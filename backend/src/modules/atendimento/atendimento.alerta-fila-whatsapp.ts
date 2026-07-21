import prisma from '../../config/prisma';
import logger from '../../config/logger';
import { enviarWhatsappMeta } from '../../config/metaWhatsapp';
import { ALERTA_FILA_CENTRO_SOLUCAO_WHATSAPP_ATIVO } from '../../config/notificacoes';
import { buscarFilaAoVivo } from './atendimento.repository';
import { SETORES_CENTRO_SOLUCAO } from './atendimento.types';

/// Notifica a gestora do Centro de Solução por WhatsApp (Meta Cloud API
/// direta, ver config/metaWhatsapp.ts) quando a fila TOTAL do grupo (soma de
/// todos os setores, mesma conta do card "Na fila de espera" do dashboard)
/// passa do limiar. Mecanismo independente do escalonamento por alerta
/// individual em atendimento.alertas-escalonamento.ts (que vai por
/// webhook/n8n). Este aqui olha o agregado, não um alerta por setor.
///
/// Dedup: 1 registro em AtendimentoAlertaOperacional por episódio (tipo
/// FILA_CRITICA_TOTAL, setor 'CENTRO_SOLUCAO' como rótulo, não é um
/// SetorAtendimento de verdade). Notifica só na abertura do episódio
/// (notificado_whatsapp_em fica null até enviar); ao voltar pro normal,
/// resolve E zera notificado_whatsapp_em, pra um próximo episódio notificar
/// de novo (diferente do escalonamento por alerta individual, que nunca
/// reseta esse campo porque cada alerta ali é uma ocorrência específica, não
/// um estado recorrente como este).
const TIPO_ALERTA = 'FILA_CRITICA_TOTAL';
/// String livre, só pra exibição no card do alerta (campo `contexto` do
/// AlertaCard.vue). Não é um SetorAtendimento de verdade, é a soma do grupo
/// inteiro, mesma convenção de AGENTE_AUSENTE (ver DadosAlerta.setor em
/// atendimento.alertas-operacionais.ts).
const SETOR_ROTULO = 'Centro de Solução';

const LIMIAR         = parseInt(process.env.LIMIAR_FILA_CRITICA_WHATSAPP ?? '5', 10);
const NUMERO_GESTORA = process.env.GESTORA_CENTRO_SOLUCAO_WHATSAPP ?? '';
const DASHBOARD      = `${process.env.BASE_URL ?? 'https://exemplo.com.br'}/bdr/`;

const CHAVE_ALERTA = {
  tipo_setor_opasuite_atendimento_id_agente_nome: {
    tipo: TIPO_ALERTA, setor: SETOR_ROTULO, opasuite_atendimento_id: '', agente_nome: '',
  },
};

export interface ResultadoAlertaFilaWhatsapp {
  qtdNaFila:  number;
  notificado: boolean;
}

export async function verificarFilaCriticaWhatsapp(): Promise<ResultadoAlertaFilaWhatsapp> {
  const qtdNaFila = await buscarFilaAoVivo(SETORES_CENTRO_SOLUCAO);

  if (qtdNaFila <= LIMIAR) {
    await prisma.atendimentoAlertaOperacional.updateMany({
      where: { tipo: TIPO_ALERTA, status: 'ABERTO' },
      data: { status: 'RESOLVIDO', resolvido_em: new Date(), notificado_whatsapp_em: null },
    });
    return { qtdNaFila, notificado: false };
  }

  const titulo    = 'Fila crítica no Centro de Solução';
  const descricao = `${qtdNaFila} cliente(s) aguardando na fila agora, acima do limiar de ${LIMIAR}.`;

  const alerta = await prisma.atendimentoAlertaOperacional.upsert({
    where:  CHAVE_ALERTA,
    create: { tipo: TIPO_ALERTA, severidade: 'CRITICO', setor: SETOR_ROTULO, titulo, descricao },
    update: { status: 'ABERTO', resolvido_em: null, resolvido_por: null, titulo, descricao, severidade: 'CRITICO' },
  });

  if (!ALERTA_FILA_CENTRO_SOLUCAO_WHATSAPP_ATIVO || alerta.notificado_whatsapp_em || !NUMERO_GESTORA) {
    return { qtdNaFila, notificado: false };
  }

  // 3 parâmetros de texto livre do template "otdr_alerta" ({{1}}, {{2}},
  // {{3}}), mesma forma usada pelo OTDR: título, detalhe, e uma 3ª linha de
  // contexto (lá é duração/início da ocorrência, aqui é o link do painel).
  const ok = await enviarWhatsappMeta(NUMERO_GESTORA, [titulo, descricao, `Painel: ${DASHBOARD}`]);

  if (ok) {
    await prisma.atendimentoAlertaOperacional.update({
      where: { id: alerta.id },
      data:  { notificado_whatsapp_em: new Date() },
    });
  } else {
    logger.warn('[Alerta Fila WhatsApp] Falha ao notificar a gestora do Centro de Solução.');
  }

  return { qtdNaFila, notificado: ok };
}

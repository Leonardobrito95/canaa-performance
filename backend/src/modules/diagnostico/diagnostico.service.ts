import prisma from '../../config/prisma';
import logger from '../../config/logger';
import {
  buscarHistoricoSinal,
  buscarOscilacaoRede,
  buscarStatusSmartOlt,
  buscarEquipamentoAtual,
  buscarOrdensServico,
  buscarMensagensOs,
  buscarArquivosOs,
  buscarAtendimentos,
  buscarContratosCliente,
  buscarContextoComercial,
  buscarRetencaoNegociacoes,
  buscarRegrasNegocio,
  buscarFotosRelevantes,
} from './diagnostico.repository';
import { buscarFatoPosAtivacaoCliente } from '../posativacao/posativacao.repository';
import { ContextoClienteDiagnostico } from './diagnostico.types';
import { montarContextoTextual, montarContextoGestaoTextual } from './diagnostico.prompt';
import { FONTES_GESTAO, DadosGestao, JanelaTemporalGestao } from './diagnostico.gestao-fontes';
import { gerarDiagnostico, gerarRespostaGestao, DiagnosticoIaResultado } from './diagnostico.ia';

/// Monta o contexto completo de um cliente (rede + O.S. + comercial) para a IA.
/// Cada fonte é buscada fresca a cada chamada — nada fica em cache permanente.
export async function montarContextoCliente(idCliente: number): Promise<ContextoClienteDiagnostico> {
  const contratos = await buscarContratosCliente(idCliente);
  const idsContrato = contratos.map((c) => c.id);
  const idsContratoAtivos = new Set(contratos.filter((c) => c.ativo).map((c) => c.id));
  const equipamentoAtual = await buscarEquipamentoAtual(idCliente);

  const [historicoSinal, oscilacaoRede, statusSmartOlt, ordensServico, atendimentos, comercial, regrasNegocio, posAtivacao] = await Promise.all([
    buscarHistoricoSinal(idCliente),
    buscarOscilacaoRede(idCliente, equipamentoAtual),
    buscarStatusSmartOlt(equipamentoAtual),
    buscarOrdensServico(idCliente, idsContratoAtivos),
    buscarAtendimentos(idCliente, idsContratoAtivos),
    buscarContextoComercial(idCliente, idsContrato),
    buscarRegrasNegocio(),
    buscarFatoPosAtivacaoCliente(idCliente, idsContratoAtivos),
  ]);

  const idsOssChamado = ordensServico.map((os) => os.idOssChamado);
  const [osMensagens, osArquivos, retencaoNegociacoes] = await Promise.all([
    buscarMensagensOs(idsOssChamado),
    buscarArquivosOs(idsOssChamado),
    buscarRetencaoNegociacoes(idsOssChamado),
  ]);

  return {
    idCliente,
    contratos,
    posAtivacao,
    equipamentoAtual,
    historicoSinal,
    oscilacaoRede,
    statusSmartOlt,
    ordensServico,
    osMensagens,
    osArquivos,
    atendimentos,
    comercial: { ...comercial, retencaoNegociacoes },
    regrasNegocio,
  };
}

export interface SolicitanteDiagnostico {
  ixcUserId: string;
  ixcUsername: string;
}

/// Intervalo do mês corrente (dia 1 até hoje) — usado pra trazer o desempenho
/// de retenção do mês em andamento tanto pro chat de gestão quanto pro
/// resumo estático dos cards (diagnostico.controller.ts), mantendo os dois
/// consistentes com o mesmo período.
export function intervaloMesAtual(): { dateFrom: string; dateTo: string } {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return { dateFrom: `${ano}-${mes}-01`, dateTo: hoje.toISOString().slice(0, 10) };
}

/// Gera um diagnóstico individual para um cliente (botão padrão ou pergunta livre no
/// chat) e persiste a consulta para auditoria.
export async function gerarDiagnosticoIndividual(
  idCliente: number,
  solicitante: SolicitanteDiagnostico,
  pergunta?: string,
  historico?: { pergunta: string; resposta: string }[],
): Promise<DiagnosticoIaResultado & { consultaId: string }> {
  const contexto = await montarContextoCliente(idCliente);
  const contextoTextual = montarContextoTextual(contexto);
  // Fotos só são buscadas/reenviadas na PRIMEIRA pergunta de uma conversa (sem
  // histórico ainda) — reenviar a mesma foto em base64 a cada pergunta de
  // acompanhamento é o maior custo de token da consulta (medido em produção:
  // média de ~9.700 tokens de entrada por chamada, com 81% sendo perguntas de
  // acompanhamento) sem ganho real, já que a foto não muda no meio da
  // conversa. `gerarDiagnostico` avisa a IA quando isso acontece, pra ela usar
  // o que já descreveu antes em vez de inventar detalhe visual novo.
  const imagens = historico?.length ? [] : await buscarFotosRelevantes(contexto.osArquivos);
  const resultado = await gerarDiagnostico(contextoTextual, pergunta, imagens, historico);

  const consulta = await prisma.diagnosticoConsulta.create({
    data: {
      tipo_alvo:      'CLIENTE',
      id_alvo:        String(idCliente),
      pergunta:       pergunta ?? null,
      resposta:       resultado.textoCompleto,
      contexto_json:  contexto as any,
      ixc_user_id:    solicitante.ixcUserId,
      ixc_username:   solicitante.ixcUsername,
      latencia_ms:    resultado.metricas.latenciaMs,
      tokens_entrada: resultado.metricas.tokensEntrada,
      tokens_saida:   resultado.metricas.tokensSaida,
      modelo_usado:   resultado.metricas.modeloUsado,
    },
  });

  return { ...resultado, consultaId: consulta.id };
}

/// Responde perguntas de gestão (ranking de vendedores, evolução de vendas,
/// atendimento, retenção...) sem cliente específico — mesma auditoria de
/// consultas do Diagnóstico. Busca cada fonte de FONTES_GESTAO em paralelo
/// (diagnostico.gestao-fontes.ts) — adicionar uma fonte nova não muda essa
/// função, só o registry.
export async function gerarRespostaGestaoIndividual(
  pergunta: string,
  solicitante: SolicitanteDiagnostico,
  historico?: { pergunta: string; resposta: string }[],
): Promise<{ resposta: string; consultaId: string }> {
  const hoje = new Date();
  const janela: JanelaTemporalGestao = {
    hoje,
    inicioMes: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
    inicioUltimos3Meses: new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1),
  };

  const entradas = await Promise.all(FONTES_GESTAO.map(async (fonte) => {
    // ranking/evolução não são resilientes de propósito — uma falha nelas
    // propaga e derruba a resposta (500) em vez de degradar silenciosamente,
    // diferente das outras fontes (ver comentário de `resiliente` no tipo).
    if (!fonte.resiliente) return [fonte.chave, await fonte.buscar(janela)] as const;
    try {
      return [fonte.chave, await fonte.buscar(janela)] as const;
    } catch (err: any) {
      logger.warn(`[DIAGNOSTICO] ${fonte.resiliente.logErroMsg}`, { error: err.message });
      return [fonte.chave, fonte.valorVazio] as const;
    }
  }));
  const dados = Object.fromEntries(entradas) as DadosGestao;

  const contextoTextual = montarContextoGestaoTextual(dados);
  const { texto: resposta, metricas } = await gerarRespostaGestao(contextoTextual, pergunta, historico);

  const consulta = await prisma.diagnosticoConsulta.create({
    data: {
      tipo_alvo:      'GESTAO',
      id_alvo:        'GERAL',
      pergunta,
      resposta,
      contexto_json:  dados as any,
      ixc_user_id:    solicitante.ixcUserId,
      ixc_username:   solicitante.ixcUsername,
      latencia_ms:    metricas.latenciaMs,
      tokens_entrada: metricas.tokensEntrada,
      tokens_saida:   metricas.tokensSaida,
      modelo_usado:   metricas.modeloUsado,
    },
  });

  return { resposta, consultaId: consulta.id };
}

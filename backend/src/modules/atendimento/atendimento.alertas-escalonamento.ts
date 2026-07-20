import axios from 'axios';
import prisma from '../../config/prisma';
import logger from '../../config/logger';
import { ESCALONAMENTO_WHATSAPP_ATIVO } from '../../config/notificacoes';
import { nomeSetorAtendimento, SetorAtendimento } from './atendimento.types';

/// Escalonamento por WhatsApp dos alertas operacionais de Atendimento — quando
/// um alerta CRITICO (hoje só SLA_FILA pode virar CRITICO, ver
/// atendimento.alertas-operacionais.ts) fica aberto, notifica a gestora uma
/// vez; se continuar aberto por mais de LIMIAR_ESCALONAMENTO_DIRETORIA_MIN,
/// escala pra governança/diretoria. Cada etapa dispara só uma vez por alerta
/// (guardada em notificado_whatsapp_em/escalado_whatsapp_em) — reabrir o
/// alerta no ciclo de 2 min não reseta esses campos, então não reenvia a
/// mesma notificação em loop.
///
/// Envio é via webhook genérico (mesmo padrão do otdr.alerts.ts) — quem fala
/// com a Meta Cloud API de verdade é um fluxo externo (n8n), fora deste repo.

const WEBHOOK_URL = process.env.ESCALONAMENTO_WEBHOOK_URL ?? '';
const DASHBOARD    = `${process.env.BASE_URL ?? 'https://exemplo.com.br'}/bdr/`;
/// Tempo entre a 1ª notificação (gestora) e a escalada (governança/diretoria)
/// se o alerta continuar aberto — confirmado com o usuário 2026-07-20 (faixa
/// de 1 a 2h), 90 min é o meio do intervalo.
const LIMIAR_ESCALONAMENTO_DIRETORIA_MIN = parseInt(process.env.LIMIAR_ESCALONAMENTO_DIRETORIA_MIN ?? '90', 10);

type Destinatario = 'gestora' | 'diretoria';

/// `destinatario` é um papel, não um número de telefone — o mapeamento
/// papel→número real fica do lado do n8n, esse repo nunca guarda telefone.
async function enviarWhatsapp(destinatario: Destinatario, mensagem: string, tipo: string): Promise<boolean> {
  if (!WEBHOOK_URL) return false;
  try {
    await axios.post(WEBHOOK_URL, { tipo, destinatario, mensagem }, { timeout: 10_000 });
    return true;
  } catch (err: any) {
    logger.warn(`[Escalonamento WhatsApp] Falha ao enviar pra ${destinatario}: ${err.message}`);
    return false;
  }
}

export interface ResultadoEscalonamento {
  notificados: number;
  escalados:   number;
}

export async function verificarEscalonamentoAlertas(): Promise<ResultadoEscalonamento> {
  if (!ESCALONAMENTO_WHATSAPP_ATIVO) return { notificados: 0, escalados: 0 };

  const pendentesNotificacao = await prisma.atendimentoAlertaOperacional.findMany({
    where: { status: 'ABERTO', severidade: 'CRITICO', notificado_whatsapp_em: null },
  });

  let notificados = 0;
  for (const a of pendentesNotificacao) {
    const mensagem = `🔴 *Centro de Solução · ${nomeSetorAtendimento(a.setor as SetorAtendimento)}*\n\n${a.titulo}\n${a.descricao}\n\n🔗 ${DASHBOARD}`;
    const ok = await enviarWhatsapp('gestora', mensagem, a.tipo);
    if (ok) {
      await prisma.atendimentoAlertaOperacional.update({
        where: { id: a.id },
        data: { notificado_whatsapp_em: new Date() },
      });
      notificados++;
    }
  }

  const limiteEscalonamento = new Date(Date.now() - LIMIAR_ESCALONAMENTO_DIRETORIA_MIN * 60000);
  const pendentesEscalonamento = await prisma.atendimentoAlertaOperacional.findMany({
    where: {
      status: 'ABERTO', severidade: 'CRITICO',
      notificado_whatsapp_em: { lte: limiteEscalonamento },
      escalado_whatsapp_em: null,
    },
  });

  let escalados = 0;
  for (const a of pendentesEscalonamento) {
    const mensagem = `🔴 *Escalonamento · Centro de Solução · ${nomeSetorAtendimento(a.setor as SetorAtendimento)}*\n\nSem resolução há mais de ${LIMIAR_ESCALONAMENTO_DIRETORIA_MIN} min:\n${a.titulo}\n${a.descricao}\n\n🔗 ${DASHBOARD}`;
    const ok = await enviarWhatsapp('diretoria', mensagem, a.tipo);
    if (ok) {
      await prisma.atendimentoAlertaOperacional.update({
        where: { id: a.id },
        data: { escalado_whatsapp_em: new Date() },
      });
      escalados++;
    }
  }

  return { notificados, escalados };
}

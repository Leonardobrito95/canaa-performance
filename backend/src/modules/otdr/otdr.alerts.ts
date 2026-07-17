import axios from 'axios';
import transporter from '../../config/mailer';
import logger from '../../config/logger';
import { ENVIO_ALERTAS_ATIVO } from '../../config/notificacoes';
import { ResumoOlt, EstadoOlt } from './otdr.service';

/// Causa provável levantada pelo Diagnóstico IA para um dos piores clientes do
/// dia — "poucos, fundamentados na causa" (não um por ONU degradada).
export interface CausaCliente {
  nome: string;
  causa: string;
}

const EMAILS_INFRA = (process.env.OTDR_ALERT_EMAIL ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);
const WEBHOOK_URL  = process.env.OTDR_WEBHOOK_URL ?? '';
const DASHBOARD    = `${process.env.BASE_URL ?? 'https://exemplo.com.br'}/bdr/`;
const FROM         = process.env.ALERT_EMAIL_FROM ?? 'contato@exemplo.com.br';

// ── WhatsApp via webhook (n8n) ────────────────────────────────────────────────

async function enviarWhatsapp(mensagem: string, tipo: string): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    await axios.post(WEBHOOK_URL, { tipo, mensagem }, { timeout: 10_000 });
  } catch (err: any) {
    logger.warn(`[OTDR] Falha ao enviar WhatsApp: ${err.message}`);
  }
}

// ── Resumo diário — 7h ───────────────────────────────────────────────────────

export function htmlResumoDiario(resumos: ResumoOlt[], data: string, causas: CausaCliente[]): string {
  const linhas = resumos.map(r =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;">${r.olt}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;text-align:center;">${r.qtdPioraram}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-family:monospace;color:#ef4444;">${r.piorRx.toFixed(2)} dBm</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-family:monospace;color:#f59e0b;">${r.deltaDdBm.toFixed(2)} dBm</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-family:monospace;font-size:11px;color:#94a3b8;">${r.piorSn}</td>
    </tr>`
  ).join('');

  const blocoCausas = causas.length ? `
        <p style="margin:24px 0 10px;font-size:11px;color:#38bdf8;letter-spacing:.08em;text-transform:uppercase;">🔎 Causa provável (Diagnóstico IA) — piores casos de hoje</p>
        ${causas.map(c => `
        <div style="background:#0f172a;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
          <p style="margin:0 0 4px;font-size:13px;color:#fff;font-weight:600;">${c.nome}</p>
          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">${c.causa}</p>
        </div>`).join('')}
        <p style="margin:8px 0 0;font-size:11px;color:#64748b;">Sugestão gerada por IA para avaliação humana — não é uma ação automática.</p>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
  <tr><td align="center">
    <table width="620" style="max-width:620px;background:#1e293b;border-radius:12px;overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:24px 28px;">
        <p style="margin:0;font-size:11px;color:#38bdf8;letter-spacing:.1em;text-transform:uppercase;">📡 OTDR Preventivo</p>
        <h1 style="margin:6px 0 0;font-size:20px;color:#fff;font-weight:700;">Resumo Diário de Sinal · ${data}</h1>
      </td></tr>
      <tr><td style="padding:24px 28px;">
        <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;">ONUs com degradação de sinal registrada hoje, agrupadas por OLT:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr style="background:#0f172a;">
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;">OLT</th>
              <th style="padding:8px 12px;text-align:center;font-size:10px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;">ONUs</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;">Pior Sinal</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;">Variação</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;">Serial</th>
            </tr>
          </thead>
          <tbody style="color:#e2e8f0;">${linhas}</tbody>
        </table>
        ${blocoCausas}
        <div style="margin-top:24px;text-align:center;">
          <a href="${DASHBOARD}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 24px;border-radius:8px;">Abrir Dashboard OTDR</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function enviarResumoDiario(resumos: ResumoOlt[], causas: CausaCliente[] = []): Promise<void> {
  if (!ENVIO_ALERTAS_ATIVO) {
    logger.info('[OTDR] Envio desativado (sistema em desenvolvimento) — resumo diário suprimido.');
    return;
  }
  if (!resumos.length) {
    logger.info('[OTDR] Nenhuma piora registrada hoje — resumo não enviado.');
    return;
  }

  const data = new Date().toLocaleDateString('pt-BR');
  const totalOnus = resumos.reduce((s, r) => s + r.qtdPioraram, 0);
  const piorOlt   = resumos[0];

  // WhatsApp
  const linhasWpp = resumos
    .map(r => `  • ${r.olt}: ${r.qtdPioraram} ONU${r.qtdPioraram > 1 ? 's' : ''} ↓ (pior: ${r.piorRx.toFixed(1)} dBm)`)
    .join('\n');
  const linhasCausasWpp = causas.length
    ? `\n\n🔎 *Causa provável (IA) — piores casos:*\n` + causas.map(c => `  • ${c.nome}: ${c.causa}`).join('\n')
    : '';
  const msgWpp = `📡 *OTDR · ${data}*\n\n${totalOnus} ONU${totalOnus > 1 ? 's' : ''} degradaram:\n${linhasWpp}${linhasCausasWpp}\n\n🔗 ${DASHBOARD}`;
  await enviarWhatsapp(msgWpp, 'resumo_diario');

  // Email
  if (!EMAILS_INFRA.length) return;
  try {
    await transporter.sendMail({
      from: FROM,
      to: EMAILS_INFRA,
      subject: `📡 OTDR ${data} — ${totalOnus} ONUs degradadas | Pior: ${piorOlt.olt} (${piorOlt.piorRx.toFixed(1)} dBm)`,
      html: htmlResumoDiario(resumos, data, causas),
    });
    logger.info(`[OTDR] Resumo diário enviado → ${EMAILS_INFRA.join(', ')}`);
  } catch (err: any) {
    logger.error(`[OTDR] Falha ao enviar e-mail resumo: ${err.message}`);
  }
}

// ── Alerta de queda brusca ────────────────────────────────────────────────────

const ultimoAlerta = new Map<string, number>(); // OLT → timestamp do último alerta
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 horas entre alertas da mesma OLT

export async function enviarAlertaQueda(
  olt: string,
  atual: EstadoOlt,
  delta: number,
): Promise<void> {
  if (!ENVIO_ALERTAS_ATIVO) {
    logger.info(`[OTDR] Envio desativado (sistema em desenvolvimento) — alerta de queda suprimido (${olt}).`);
    return;
  }
  const agora = Date.now();
  const ultimo = ultimoAlerta.get(olt) ?? 0;
  if (agora - ultimo < COOLDOWN_MS) return;
  ultimoAlerta.set(olt, agora);

  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const msg  = `🔴 *ALERTA OTDR · ${hora}*\n\n*${olt}*\n+${delta} ONUs "Fora de Operação" nos últimos 15 min\n\nAtual: ${atual.fora} fora | ${atual.critico} crítico\n\nPossível fibra cortada ou falha de OLT.\n🔗 ${DASHBOARD}`;

  await enviarWhatsapp(msg, 'alerta_queda');

  if (!EMAILS_INFRA.length) return;
  try {
    await transporter.sendMail({
      from: FROM,
      to: EMAILS_INFRA,
      subject: `🔴 OTDR ALERTA — ${olt}: +${delta} ONUs fora às ${hora}`,
      html: `<p style="font-family:sans-serif;font-size:15px;">${msg.replace(/\n/g, '<br>').replace(/\*/g, '<b>').replace(/<b>([^<]+)<\/b>/g, '<b>$1</b>')}</p>`,
    });
  } catch (err: any) {
    logger.error(`[OTDR] Falha ao enviar e-mail alerta queda: ${err.message}`);
  }

  logger.warn(`[OTDR] Alerta queda enviado — ${olt} +${delta} fora`);
}

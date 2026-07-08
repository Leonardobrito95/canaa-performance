import prisma from '../../config/prisma';
import transporter from '../../config/mailer';
import logger from '../../config/logger';
import { gerarRelatorioComissao } from './comissao-relatorio.service';

const FROM = process.env.ALERT_EMAIL_FROM ?? 'contato@exemplo.com.br';

function parseEmails(envVar: string | undefined, fallback: string[]): string[] {
  if (!envVar) return fallback;
  return envVar.split(',').map((s) => s.trim()).filter(Boolean);
}

const EMAILS_COMERCIAL = parseEmails(process.env.ALERT_EMAIL_COMERCIAL, [
  'comercial@exemplo.com.br',
]);

const EMAILS_FINANCEIRO = parseEmails(process.env.ALERT_EMAIL_FINANCEIRO, [
  'financeiro@exemplo.com.br',
]);

// Cópia extra opcional (ex: gestor que quer acompanhar o envio ao financeiro).
const EMAIL_CC_EXTRA = parseEmails(process.env.ALERT_EMAIL_CC_EXTRA, []);

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

function labelMes(mes_referencia: string): string {
  const [year, month] = mes_referencia.split('-').map(Number);
  return `${MESES[month - 1]}/${year}`;
}

// ── Verifica envios anteriores ────────────────────────────────────────────────

export async function statusEnvio(mes_referencia: string) {
  const logs = await prisma.comissaoEnvioLog.findMany({
    where: { mes_referencia },
  });
  const comercial  = logs.find((l) => l.tipo_envio === 'COMERCIAL');
  const financeiro = logs.find((l) => l.tipo_envio === 'FINANCEIRO');
  return {
    comercial:  comercial  ? { enviado: true, em: comercial.enviado_em,  por: comercial.enviado_por  } : { enviado: false },
    financeiro: financeiro ? { enviado: true, em: financeiro.enviado_em, por: financeiro.enviado_por } : { enviado: false },
  };
}

// ── Envio ao comercial (chamado pelo cron do dia 19) ─────────────────────────

export async function enviarRelatorioComercial(mes_referencia: string): Promise<void> {
  const status = await statusEnvio(mes_referencia);
  if (status.comercial.enviado) {
    logger.info(`[COMISSAO] Relatório ${mes_referencia} já enviado ao comercial — ignorando.`);
    return;
  }

  const buffer = await gerarRelatorioComissao(mes_referencia);
  const label  = labelMes(mes_referencia);
  const filename = `Comissao_Vendas_${mes_referencia}.xlsx`;

  await transporter.sendMail({
    from,
    to:      EMAILS_COMERCIAL.join(', '),
    subject: `📊 Relatório de Comissão — ${label}`,
    html:    emailBody(
      `Relatório de Comissão — ${label}`,
      '#002B5C',
      `<p>Segue em anexo o relatório de comissão de vendas referente a <strong>${label}</strong>.</p>
       <p style="color:#6b7280;font-size:12px">Após validação, utilize o sistema para liberar o envio ao financeiro.</p>`,
    ),
    attachments: [{ filename, content: buffer as Buffer }],
  });

  await prisma.comissaoEnvioLog.upsert({
    where:  { mes_referencia_tipo_envio: { mes_referencia, tipo_envio: 'COMERCIAL' } },
    update: { enviado_em: new Date(), enviado_por: 'sistema' },
    create: { mes_referencia, tipo_envio: 'COMERCIAL', enviado_por: 'sistema' },
  });

  logger.info(`[COMISSAO] Relatório ${mes_referencia} enviado ao comercial.`);
}

// ── Envio ao financeiro (chamado manualmente pelo gestor) ────────────────────

export async function enviarRelatorioFinanceiro(
  mes_referencia: string,
  enviado_por: string,
): Promise<{ ok: boolean; mensagem: string }> {
  const status = await statusEnvio(mes_referencia);

  if (!status.comercial.enviado) {
    return { ok: false, mensagem: 'Relatório ainda não foi enviado ao comercial.' };
  }
  if (status.financeiro.enviado) {
    return { ok: false, mensagem: 'Relatório já foi enviado ao financeiro.' };
  }

  const buffer = await gerarRelatorioComissao(mes_referencia);
  const label  = labelMes(mes_referencia);
  const filename = `Comissao_Vendas_${mes_referencia}.xlsx`;

  await transporter.sendMail({
    from,
    to:      EMAILS_FINANCEIRO.join(', '),
    cc:      [...EMAILS_COMERCIAL, ...EMAIL_CC_EXTRA].join(', '),
    subject: `✅ Comissão Aprovada — ${label}`,
    html:    emailBody(
      `Comissão Aprovada para Pagamento — ${label}`,
      '#1A5C1A',
      `<p>O setor comercial validou o relatório de comissão referente a <strong>${label}</strong>.</p>
       <p>Segue em anexo o arquivo para processamento do pagamento.</p>
       <p style="color:#6b7280;font-size:12px">Autorizado por: ${enviado_por}</p>`,
    ),
    attachments: [{ filename, content: buffer as Buffer }],
  });

  await prisma.comissaoEnvioLog.upsert({
    where:  { mes_referencia_tipo_envio: { mes_referencia, tipo_envio: 'FINANCEIRO' } },
    update: { enviado_em: new Date(), enviado_por },
    create: { mes_referencia, tipo_envio: 'FINANCEIRO', enviado_por },
  });

  logger.info(`[COMISSAO] Relatório ${mes_referencia} enviado ao financeiro por ${enviado_por}.`);
  return { ok: true, mensagem: `Relatório enviado ao financeiro com sucesso.` };
}

// ── Template de email ─────────────────────────────────────────────────────────

function emailBody(titulo: string, cor: string, conteudo: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <tr>
          <td style="background:${cor};padding:20px 32px">
            <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700">Canaã Performance</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">${titulo}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;color:#374151;font-size:14px;line-height:1.6">${conteudo}</td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#f3f4f6;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:11px;color:#9ca3af">
              Email automático — Canaã Performance<br>
              ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// corrige referência — `from` precisa ser a constante FROM
const from = FROM;

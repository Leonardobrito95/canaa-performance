import nodemailer from 'nodemailer';
import logger from '../../config/logger';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    logger.warn('[AGENDA] E-mail: SMTP não configurado.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

function escHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function gerarLinksCalendario({ tituloReuniao, data, horaInicio, horaFim, nomeOrganizador, sala, modalidade, linkReuniao }: any) {
  if (!data || !horaInicio || !horaFim) return null;
  const [ano, mes, dia] = data.split('-');
  const [hIni, mIni] = horaInicio.split(':');
  const [hFim, mFim] = horaFim.split(':');
  const dtInicio = `${ano}${mes}${dia}T${hIni}${mIni}00`;
  const dtFim    = `${ano}${mes}${dia}T${hFim}${mFim}00`;
  const local = modalidade === 'presencial' ? (sala || 'Sala de Reunião') : (linkReuniao || 'Online');
  const descricao = `Reunião organizada por ${nomeOrganizador}. Local: ${local}`;
  const gParams = new URLSearchParams({ action: 'TEMPLATE', text: tituloReuniao, dates: `${dtInicio}/${dtFim}`, details: descricao, location: local });
  const googleUrl = `https://calendar.google.com/calendar/render?${gParams.toString()}`;
  const oParams = new URLSearchParams({ subject: tituloReuniao, startdt: `${ano}-${mes}-${dia}T${hIni}:${mIni}:00`, enddt: `${ano}-${mes}-${dia}T${hFim}:${mFim}:00`, body: descricao, location: local });
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?${oParams.toString()}`;
  return { googleUrl, outlookUrl };
}

function templateConvite(p: any): string {
  const dataFormatada = (() => {
    if (!p.data) return '—';
    const [ano, mes, dia] = p.data.split('-');
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const d = new Date(`${ano}-${mes}-${dia}T12:00:00`);
    return `${dias[d.getDay()]}, ${parseInt(dia)} de ${meses[parseInt(mes) - 1]} de ${ano}`;
  })();
  const isOnline = p.modalidade === 'online';
  const nomeSala = !isOnline ? (p.sala || 'Sala de Reunião') : null;
  const calLinks = gerarLinksCalendario({ ...p, sala: nomeSala });

  const linkBtn = isOnline && p.linkReuniao ? `<tr><td align="center" style="padding: 8px 0 24px;"><a href="${escHtml(p.linkReuniao)}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 28px;border-radius:8px;">🎥 Entrar na Reunião Online</a></td></tr>` : '';
  const calendarBlock = calLinks ? `<tr><td align="center" style="padding:8px 32px 20px;"><p style="margin:0 0 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#64748b;">📅 Adicionar à Agenda</p><table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="padding-right:8px;"><a href="${escHtml(calLinks.googleUrl)}" target="_blank" style="display:inline-block;background:#fff;border:1px solid #e2e8f0;color:#1d4ed8;text-decoration:none;font-weight:700;font-size:11px;padding:8px 16px;border-radius:8px;">🗓 Google Agenda</a></td><td><a href="${escHtml(calLinks.outlookUrl)}" target="_blank" style="display:inline-block;background:#fff;border:1px solid #e2e8f0;color:#0078d4;text-decoration:none;font-weight:700;font-size:11px;padding:8px 16px;border-radius:8px;">📆 Outlook</a></td></tr></table></td></tr>` : '';
  const recusoBlock = p.tokenRecuso && p.baseUrl ? `<tr><td align="center" style="padding:0 32px 24px;"><p style="margin:0 0 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#64748b;">Não poderá participar?</p><a href="${p.baseUrl}/api/v1/agenda/presenca/recusar?token=${p.tokenRecuso}" style="display:inline-block;background:#fff;border:1px solid #fecaca;color:#dc2626;text-decoration:none;font-weight:600;font-size:11px;padding:8px 20px;border-radius:8px;">🚫 Recusar Presença</a></td></tr>` : '';
  const pautaBlock = p.preAta ? `<tr><td style="padding:0 32px 20px;"><div style="background:#f8fafc;border-left:3px solid #06b6d4;border-radius:6px;padding:12px 16px;"><p style="margin:0 0 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#64748b;">Pauta / Pré-Ata</p><p style="margin:0;font-size:13px;color:#334155;line-height:1.6;white-space:pre-wrap;">${escHtml(p.preAta)}</p></div></td></tr>` : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Convite</title></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden;"><tr><td style="background:linear-gradient(135deg,#080e1f 0%,#0f1c3f 60%,#1d4ed8 100%);padding:28px 32px 28px;"><div style="margin-bottom:12px;"><span style="font-size:10px;font-weight:700;color:#06b6d4;letter-spacing:.1em;text-transform:uppercase;">📅 Convite de Reunião</span></div><h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;">${escHtml(p.tituloReuniao)}</h1></td></tr><tr><td style="padding:28px 32px 4px;"><p style="margin:0;font-size:15px;color:#1e293b;">Olá, <strong style="color:#1d4ed8;">${escHtml(p.nomeParticipante)}</strong>! 👋</p><p style="margin:8px 0 0;font-size:14px;color:#475569;"><strong>${escHtml(p.nomeOrganizador)}</strong> agendou uma reunião e solicitou a sua presença.</p></td></tr><tr><td style="padding:20px 32px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;"><tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;">Data</p><p style="margin:2px 0 0;font-size:14px;font-weight:600;color:#1e293b;">${dataFormatada}</p></td></tr><tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;">Horário</p><p style="margin:2px 0 0;font-size:14px;font-weight:600;color:#1e293b;">${p.horaInicio} <span style="color:#94a3b8;font-weight:400;">até</span> ${p.horaFim}</p></td></tr><tr><td style="padding:14px 18px;"><p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;">Modalidade</p><p style="margin:2px 0 0;font-size:14px;font-weight:600;color:${isOnline ? '#7c3aed' : '#1d4ed8'};">${isOnline ? '🌐 Online' : '🏢 Presencial'}${nomeSala ? ` — ${escHtml(nomeSala)}` : ''}</p></td></tr></table></td></tr>${linkBtn}${calendarBlock}${recusoBlock}${pautaBlock}<tr><td style="padding:20px 32px 28px;"><p style="margin:0;font-size:12px;color:#94a3b8;">Este é um aviso automático. Não responda este e-mail.</p></td></tr><tr><td style="height:5px;background:linear-gradient(90deg,#1d4ed8,#06b6d4,#7c3aed);border-radius:0 0 16px 16px;"></td></tr></table></td></tr></table></body></html>`;
}

export async function enviarConviteReuniao(params: {
  emailDestinatario: string; nomeParticipante: string; tituloReuniao: string;
  data: string; horaInicio: string; horaFim: string; modalidade: string;
  linkReuniao?: string; nomeOrganizador: string; preAta?: string; sala?: string;
  tokenRecuso?: string; baseUrl?: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || '"Canaã Telecom" <noreply@exemplo.com.br>',
      to: params.emailDestinatario,
      subject: `📅 Você foi convidado: ${params.tituloReuniao}`,
      html: templateConvite(params),
    });
    logger.info('[AGENDA] Convite enviado', { destinatario: params.emailDestinatario });
    return true;
  } catch (err: any) {
    logger.error('[AGENDA] Falha ao enviar convite', { destinatario: params.emailDestinatario, error: err.message });
    return false;
  }
}

export async function enviarNotificacaoRecuso(params: {
  emailOrganizador: string; nomeOrganizador: string; nomeParticipante: string;
  tituloReuniao: string; data: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const [ano, mes, dia] = (params.data || '').split('-');
  const dataFormatada = dia ? `${dia}/${mes}/${ano}` : '—';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc;font-family:sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center"><table width="500" style="background:#fff;border-radius:12px;box-shadow:0 10px 15px -3px rgba(0,0,0,.1);overflow:hidden;"><tr><td style="background:#ef4444;padding:20px;text-align:center;"><h2 style="margin:0;color:#fff;">🚫 Convite Recusado</h2></td></tr><tr><td style="padding:32px;"><p style="margin:0;font-size:15px;color:#334155;">Olá, <strong>${escHtml(params.nomeOrganizador)}</strong>,</p><p style="margin:16px 0 0;font-size:14px;color:#475569;"><strong>${escHtml(params.nomeParticipante)}</strong> informou que não poderá comparecer à reunião <strong>${escHtml(params.tituloReuniao)}</strong> (${dataFormatada}).</p></td></tr></table></td></tr></table></body></html>`;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || '"Canaã Telecom" <noreply@exemplo.com.br>',
      to: params.emailOrganizador,
      subject: `🚫 Recusa de Convite: ${params.tituloReuniao}`,
      html,
    });
    return true;
  } catch (err: any) {
    logger.error('[AGENDA] Falha ao enviar notificação de recusa', { organizador: params.emailOrganizador, error: err.message });
    return false;
  }
}

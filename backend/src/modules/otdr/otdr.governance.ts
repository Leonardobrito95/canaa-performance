import axios from 'axios';
import transporter from '../../config/mailer';
import logger from '../../config/logger';

const OTDR_BASE  = process.env.OTDR_API_URL ?? 'http://127.0.0.1:5008';
const DASHBOARD  = `${process.env.BASE_URL ?? 'https://exemplo.com.br'}/bdr/`;
const FROM       = process.env.ALERT_EMAIL_FROM ?? 'contato@exemplo.com.br';

function parseEmails(env: string | undefined): string[] {
  return (env ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

// ── Busca de dados ────────────────────────────────────────────────────────────

interface ResumoSnapshot {
  snapshot_data: string;
  atencao: number;
  critico: number;
  fora: number;
  media_rx: number;
  pior_rx: number;
  total_degradados: number;
}

interface EvolucaoOlt {
  olt_name: string;
  nivel_sinal: string;
  qtd: number;
  media_rx: string;
  pior_rx: string;
  snapshot_data: string;
}

function parseDMY(s: string): Date {
  const [d, m, y] = s.split('/');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

async function buscarResumo(): Promise<ResumoSnapshot[]> {
  const { data } = await axios.get(`${OTDR_BASE}/api/historico/resumo`, { timeout: 15_000 });
  return (data.dados ?? []) as ResumoSnapshot[];
}

async function buscarEvolucao(): Promise<EvolucaoOlt[]> {
  const { data } = await axios.get(`${OTDR_BASE}/api/historico/evolucao`, { timeout: 15_000 });
  return (data.dados ?? []) as EvolucaoOlt[];
}

// ── Processamento ─────────────────────────────────────────────────────────────

interface SemanaResumo {
  label: string;
  degradados: number;
  mediaRx: number;
  fora: number;
  critico: number;
  atencao: number;
}

interface OltResumo {
  olt: string;
  fora: number;
  critico: number;
  atencao: number;
  totalDeg: number;
}

function agruparPorSemana(snapshots: ResumoSnapshot[]): SemanaResumo[] {
  const sorted = [...snapshots].sort((a, b) =>
    parseDMY(a.snapshot_data).getTime() - parseDMY(b.snapshot_data).getTime()
  );

  const semanas: SemanaResumo[] = [];
  let i = 0;
  while (i < sorted.length) {
    const chunk = sorted.slice(i, i + 7);
    const first = chunk[0].snapshot_data;
    const last  = chunk[chunk.length - 1].snapshot_data;
    semanas.push({
      label:      first === last ? first : `${first} – ${last}`,
      degradados: Math.round(chunk.reduce((s, d) => s + d.total_degradados, 0) / chunk.length),
      mediaRx:    parseFloat((chunk.reduce((s, d) => s + d.media_rx, 0) / chunk.length).toFixed(2)),
      fora:       Math.round(chunk.reduce((s, d) => s + d.fora, 0) / chunk.length),
      critico:    Math.round(chunk.reduce((s, d) => s + d.critico, 0) / chunk.length),
      atencao:    Math.round(chunk.reduce((s, d) => s + d.atencao, 0) / chunk.length),
    });
    i += 7;
  }
  return semanas;
}

function rankingOlts(evolucao: EvolucaoOlt[], snapshots: ResumoSnapshot[]): OltResumo[] {
  // Usa só dados do período disponível
  const datas = new Set(snapshots.map(s => s.snapshot_data));
  const filtrado = evolucao.filter(e => datas.has(e.snapshot_data));

  const byOlt = new Map<string, OltResumo>();
  for (const e of filtrado) {
    if (!byOlt.has(e.olt_name)) byOlt.set(e.olt_name, { olt: e.olt_name, fora: 0, critico: 0, atencao: 0, totalDeg: 0 });
    const o = byOlt.get(e.olt_name)!;
    if (e.nivel_sinal.includes('Fora'))   o.fora    += e.qtd;
    else if (e.nivel_sinal.includes('Critico')) o.critico += e.qtd;
    else if (e.nivel_sinal.includes('Atencao')) o.atencao += e.qtd;
    o.totalDeg += e.qtd;
  }

  return [...byOlt.values()].sort((a, b) => b.totalDeg - a.totalDeg);
}

// ── HTML ──────────────────────────────────────────────────────────────────────

function badge(n: number, cor: string): string {
  return `<span style="display:inline-block;background:${cor}22;color:${cor};border:1px solid ${cor}55;border-radius:4px;padding:1px 7px;font-size:11px;font-family:monospace;">${n.toLocaleString('pt-BR')}</span>`;
}

function htmlGovernanca(
  snapshots: ResumoSnapshot[],
  semanas: SemanaResumo[],
  olts: OltResumo[],
  periodo: string,
  diasDisponiveis: number,
): string {
  const ultimo   = snapshots[0];
  const primeiro = snapshots[snapshots.length - 1];
  const mediaGeral = (snapshots.reduce((s, d) => s + d.media_rx, 0) / snapshots.length).toFixed(2);
  const maxDeg  = Math.max(...snapshots.map(d => d.total_degradados));
  const minDeg  = Math.min(...snapshots.map(d => d.total_degradados));
  const tendencia = ultimo.total_degradados < primeiro.total_degradados
    ? { txt: '↓ Melhora', cor: '#22c55e' }
    : ultimo.total_degradados > primeiro.total_degradados
    ? { txt: '↑ Piora', cor: '#ef4444' }
    : { txt: '→ Estável', cor: '#94a3b8' };

  const linhasSemanas = semanas.map((s, i) => `
    <tr style="background:${i % 2 === 0 ? '#0f172a' : '#1a2744'};">
      <td style="padding:9px 14px;font-size:12px;color:#94a3b8;">${s.label}</td>
      <td style="padding:9px 14px;text-align:center;">${badge(s.degradados, '#f59e0b')}</td>
      <td style="padding:9px 14px;font-family:monospace;font-size:12px;color:#ef4444;">${s.mediaRx.toFixed(2)} dBm</td>
      <td style="padding:9px 14px;text-align:center;">${badge(s.fora, '#ef4444')}</td>
      <td style="padding:9px 14px;text-align:center;">${badge(s.critico, '#f59e0b')}</td>
      <td style="padding:9px 14px;text-align:center;">${badge(s.atencao, '#3b82f6')}</td>
    </tr>`).join('');

  const linhasOlts = olts.map((o, i) => {
    const pct = ((o.fora / (o.totalDeg || 1)) * 100).toFixed(0);
    return `
    <tr style="background:${i % 2 === 0 ? '#0f172a' : '#1a2744'};">
      <td style="padding:9px 14px;font-weight:600;color:#e2e8f0;">${o.olt}</td>
      <td style="padding:9px 14px;text-align:center;">${badge(o.fora, '#ef4444')}</td>
      <td style="padding:9px 14px;text-align:center;">${badge(o.critico, '#f59e0b')}</td>
      <td style="padding:9px 14px;text-align:center;">${badge(o.atencao, '#3b82f6')}</td>
      <td style="padding:9px 14px;text-align:center;font-family:monospace;font-size:12px;color:#94a3b8;">${pct}%</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a1628;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="660" style="max-width:660px;background:#1e293b;border-radius:14px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#080e1f 0%,#0f1c3f 60%,#1d4ed8 100%);padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:10px;color:#38bdf8;letter-spacing:.12em;text-transform:uppercase;">📡 OTDR Preventivo · Relatório de Governança</p>
    <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;">Qualidade de Sinal Óptico</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Período: ${periodo} &nbsp;·&nbsp; ${diasDisponiveis} dias analisados</p>
  </td></tr>

  <!-- KPIs -->
  <tr><td style="padding:24px 32px 8px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:25%;padding:0 6px 0 0;">
          <div style="background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:14px 16px;">
            <p style="margin:0;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.1em;">Média RX período</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#ef4444;font-family:monospace;">${mediaGeral}</p>
            <p style="margin:2px 0 0;font-size:10px;color:#64748b;">dBm</p>
          </div>
        </td>
        <td style="width:25%;padding:0 6px;">
          <div style="background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:14px 16px;">
            <p style="margin:0;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.1em;">Degradados (média/dia)</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#f59e0b;font-family:monospace;">${Math.round(snapshots.reduce((s,d) => s + d.total_degradados, 0) / snapshots.length).toLocaleString('pt-BR')}</p>
            <p style="margin:2px 0 0;font-size:10px;color:#64748b;">ONUs</p>
          </div>
        </td>
        <td style="width:25%;padding:0 6px;">
          <div style="background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:14px 16px;">
            <p style="margin:0;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.1em;">Fora de Op. (média/dia)</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#ef4444;font-family:monospace;">${Math.round(snapshots.reduce((s,d) => s + d.fora, 0) / snapshots.length).toLocaleString('pt-BR')}</p>
            <p style="margin:2px 0 0;font-size:10px;color:#64748b;">ONUs</p>
          </div>
        </td>
        <td style="width:25%;padding:0 0 0 6px;">
          <div style="background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:14px 16px;">
            <p style="margin:0;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.1em;">Tendência</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:${tendencia.cor};">${tendencia.txt}</p>
            <p style="margin:2px 0 0;font-size:10px;color:#64748b;">${Math.abs(ultimo.total_degradados - primeiro.total_degradados)} ONUs</p>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Evolução semanal -->
  <tr><td style="padding:20px 32px 8px;">
    <p style="margin:0 0 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;">Evolução Semanal</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#0a1628;">
          <th style="padding:8px 14px;text-align:left;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">Período</th>
          <th style="padding:8px 14px;text-align:center;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">Degradados</th>
          <th style="padding:8px 14px;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">Média RX</th>
          <th style="padding:8px 14px;text-align:center;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">Fora</th>
          <th style="padding:8px 14px;text-align:center;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">Crítico</th>
          <th style="padding:8px 14px;text-align:center;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">Atenção</th>
        </tr>
      </thead>
      <tbody>${linhasSemanas}</tbody>
    </table>
  </td></tr>

  <!-- Ranking OLTs -->
  <tr><td style="padding:20px 32px 8px;">
    <p style="margin:0 0 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;">Ranking de OLTs — Total acumulado no período</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#0a1628;">
          <th style="padding:8px 14px;text-align:left;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">OLT</th>
          <th style="padding:8px 14px;text-align:center;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">Fora</th>
          <th style="padding:8px 14px;text-align:center;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">Crítico</th>
          <th style="padding:8px 14px;text-align:center;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">Atenção</th>
          <th style="padding:8px 14px;text-align:center;font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;">% Fora</th>
        </tr>
      </thead>
      <tbody>${linhasOlts}</tbody>
    </table>
  </td></tr>

  <!-- Nota -->
  <tr><td style="padding:16px 32px 28px;">
    <div style="background:#0f172a;border-left:3px solid #1d4ed8;border-radius:6px;padding:12px 16px;">
      <p style="margin:0;font-size:11px;color:#64748b;">Valores acumulados somam snapshots diários de todas as OLTs no período. Min/Max degradados no período: <strong style="color:#94a3b8;">${minDeg.toLocaleString('pt-BR')}</strong> / <strong style="color:#94a3b8;">${maxDeg.toLocaleString('pt-BR')}</strong> ONUs.</p>
    </div>
    <div style="margin-top:20px;text-align:center;">
      <a href="${DASHBOARD}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:11px 28px;border-radius:8px;">Abrir Dashboard OTDR</a>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ── Envio ─────────────────────────────────────────────────────────────────────

export async function enviarRelatorioGovernanca(): Promise<void> {
  const emails = parseEmails(process.env.OTDR_GOV_EMAIL);
  if (!emails.length) {
    logger.warn('[OTDR-GOV] OTDR_GOV_EMAIL não configurado — relatório não enviado.');
    return;
  }

  const [snapshots, evolucao] = await Promise.all([buscarResumo(), buscarEvolucao()]);
  if (!snapshots.length) {
    logger.warn('[OTDR-GOV] Sem dados históricos disponíveis.');
    return;
  }

  const sorted = [...snapshots].sort((a, b) =>
    parseDMY(a.snapshot_data).getTime() - parseDMY(b.snapshot_data).getTime()
  );

  const primeiro = sorted[0].snapshot_data;
  const ultimo   = sorted[sorted.length - 1].snapshot_data;
  const periodo  = primeiro === ultimo ? primeiro : `${primeiro} a ${ultimo}`;

  const semanas = agruparPorSemana(sorted);
  const olts    = rankingOlts(evolucao, snapshots);
  const html    = htmlGovernanca(sorted, semanas, olts, periodo, sorted.length);

  const now = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  try {
    await transporter.sendMail({
      from: FROM,
      to: emails,
      subject: `📊 OTDR Governança — Qualidade de Sinal · ${now}`,
      html,
    });
    logger.info(`[OTDR-GOV] Relatório de governança enviado → ${emails.join(', ')}`);
  } catch (err: any) {
    logger.error(`[OTDR-GOV] Falha ao enviar relatório: ${err.message}`);
  }
}

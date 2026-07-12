import prisma from '../../config/prisma';
import transporter from '../../config/mailer';
import logger from '../../config/logger';
import { fetchContracts } from '../vendas/vendas.repository';
import { fetchRetencao } from '../retencao/retencao.repository';
import { getComparativoVolumeHoje } from '../atendimento/atendimento.service';
import { buscarKpisAtendimento } from '../atendimento/atendimento.repository';
import { TODOS_SETORES } from '../atendimento/atendimento.types';

// ── Destinatários ─────────────────────────────────────────────────────────────

function parseEmails(envVar: string | undefined, fallback: string[]): string[] {
  if (!envVar) return fallback;
  return envVar.split(',').map((s) => s.trim()).filter(Boolean);
}

const EMAILS_COMERCIAL = parseEmails(
  process.env.ALERT_EMAIL_COMERCIAL,
  ['comercial@exemplo.com.br'],
);

const EMAILS_SAC = parseEmails(
  process.env.ALERT_EMAIL_SAC,
  ['sac@exemplo.com.br'],
);

const FROM = process.env.ALERT_EMAIL_FROM ?? 'contato@exemplo.com.br';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mesAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function diasDesdeAtivacao(dataAtivacao: string): number {
  const ativacao = new Date(dataAtivacao);
  const hoje = new Date();
  return Math.floor((hoje.getTime() - ativacao.getTime()) / (1000 * 60 * 60 * 24));
}

async function jaEnviou(
  tipo: string,
  referencia: string,
  mes: string,
  metaNivel?: string,
): Promise<boolean> {
  const registro = await prisma.alertaEnviado.findUnique({
    where: {
      tipo_referencia_mes_referencia_meta_nivel: {
        tipo,
        referencia,
        mes_referencia: mes,
        meta_nivel: metaNivel ?? '',
      },
    },
  });
  return registro !== null;
}

async function registrarEnvio(
  tipo: string,
  referencia: string,
  mes: string,
  metaNivel?: string,
): Promise<void> {
  await prisma.alertaEnviado.upsert({
    where: {
      tipo_referencia_mes_referencia_meta_nivel: {
        tipo,
        referencia,
        mes_referencia: mes,
        meta_nivel: metaNivel ?? '',
      },
    },
    update: { enviado_em: new Date() },
    create: {
      tipo,
      referencia,
      mes_referencia: mes,
      meta_nivel: metaNivel ?? '',
    },
  });
}

// ── 1. Contratos com assinatura pendente (>10 dias de ativação) ───────────────

export async function alertaAssinaturaPendente(): Promise<void> {
  const mes = mesAtual();
  const now = new Date();
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const dateTo   = now.toISOString().substring(0, 10);

  // Foco no mês corrente: colaboradores têm até o dia 18 do mês seguinte para desbloquear
  const todos = await fetchContracts({ dateFrom, dateTo });

  // Filtra: bloqueados por assinatura + ativados há mais de 10 dias
  const pendentes = todos.filter((c) => {
    const bloqueadoAssinatura =
      c.status_comissao.startsWith('Bloqueada') &&
      !c.status_comissao.includes('pagamento');
    const diasAtivado = diasDesdeAtivacao(c.data_ativacao);
    return bloqueadoAssinatura && diasAtivado > 10 && c.status_contrato === 'A';
  });

  if (pendentes.length === 0) return;

  // Remove os que já foram alertados neste mês
  const novos: typeof pendentes = [];
  for (const c of pendentes) {
    const enviado = await jaEnviou('ASSINATURA_PENDENTE', c.id_contrato, mes);
    if (!enviado) novos.push(c);
  }

  if (novos.length === 0) return;

  const linhas = novos
    .map(
      (c) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.id_contrato}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.nome_cliente}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.nome_vendedor}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.data_ativacao.substring(0, 10)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${diasDesdeAtivacao(c.data_ativacao)} dias</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.motivo_bloqueio ?? c.status_comissao}</td>
        </tr>`,
    )
    .join('');

  const html = emailTemplate(
    'Contratos com Assinatura Pendente',
    '#d97706',
    `<p>Os contratos abaixo estão <strong>sem assinatura</strong> há mais de 10 dias após a ativação e com comissão bloqueada.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px">
       <thead>
         <tr style="background:#f3f4f6">
           <th style="padding:8px 12px;text-align:left">ID Contrato</th>
           <th style="padding:8px 12px;text-align:left">Cliente</th>
           <th style="padding:8px 12px;text-align:left">Vendedor</th>
           <th style="padding:8px 12px;text-align:left">Ativação</th>
           <th style="padding:8px 12px;text-align:left">Dias</th>
           <th style="padding:8px 12px;text-align:left">Motivo</th>
         </tr>
       </thead>
       <tbody>${linhas}</tbody>
     </table>`,
  );

  await transporter.sendMail({
    from: FROM,
    to: EMAILS_COMERCIAL.join(', '),
    subject: `⚠️ ${novos.length} contrato(s) com assinatura pendente — ${mes}`,
    html,
  });

  for (const c of novos) {
    await registrarEnvio('ASSINATURA_PENDENTE', c.id_contrato, mes);
  }

  logger.info(`[ALERTA] Assinatura pendente: ${novos.length} contrato(s) notificado(s).`);
}

// ── 2. Contratos com fatura não quitada (>10 dias de ativação) ────────────────

export async function alertaFaturaNaoQuitada(): Promise<void> {
  const mes = mesAtual();
  const now = new Date();
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const dateTo   = now.toISOString().substring(0, 10);

  // Foco no mês corrente: colaboradores têm até o dia 18 do mês seguinte para desbloquear
  const todos = await fetchContracts({ dateFrom, dateTo });

  const pendentes = todos.filter((c) => {
    const aguardandoPagamento = c.status_comissao === 'Bloqueada — aguardando pagamento';
    const diasAtivado = diasDesdeAtivacao(c.data_ativacao);
    return aguardandoPagamento && diasAtivado > 10 && c.status_contrato === 'A';
  });

  if (pendentes.length === 0) return;

  const novos: typeof pendentes = [];
  for (const c of pendentes) {
    const enviado = await jaEnviou('FATURA_NAO_QUITADA', c.id_contrato, mes);
    if (!enviado) novos.push(c);
  }

  if (novos.length === 0) return;

  const linhas = novos
    .map(
      (c) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.id_contrato}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.nome_cliente}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.nome_vendedor}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.data_ativacao.substring(0, 10)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${diasDesdeAtivacao(c.data_ativacao)} dias</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">R$ ${c.valor_mensal.toFixed(2)}</td>
        </tr>`,
    )
    .join('');

  const html = emailTemplate(
    'Contratos com Fatura não Quitada',
    '#dc2626',
    `<p>Os contratos abaixo estão com a <strong>primeira fatura não quitada</strong> há mais de 10 dias após a ativação.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px">
       <thead>
         <tr style="background:#f3f4f6">
           <th style="padding:8px 12px;text-align:left">ID Contrato</th>
           <th style="padding:8px 12px;text-align:left">Cliente</th>
           <th style="padding:8px 12px;text-align:left">Vendedor</th>
           <th style="padding:8px 12px;text-align:left">Ativação</th>
           <th style="padding:8px 12px;text-align:left">Dias</th>
           <th style="padding:8px 12px;text-align:left">Valor Mensal</th>
         </tr>
       </thead>
       <tbody>${linhas}</tbody>
     </table>`,
  );

  await transporter.sendMail({
    from: FROM,
    to: EMAILS_COMERCIAL.join(', '),
    subject: `🔴 ${novos.length} contrato(s) com fatura não quitada — ${mes}`,
    html,
  });

  for (const c of novos) {
    await registrarEnvio('FATURA_NAO_QUITADA', c.id_contrato, mes);
  }

  logger.info(`[ALERTA] Fatura não quitada: ${novos.length} contrato(s) notificado(s).`);
}

// ── 3. Operador atingiu meta de retenção ──────────────────────────────────────

const METAS = [
  { nivel: '110', minimo: 110, label: 'Ouro', valor: 'R$ 750,00', cor: '#d97706' },
  { nivel: '90', minimo: 90, label: 'Prata', valor: 'R$ 550,00', cor: '#6b7280' },
  { nivel: '70', minimo: 70, label: 'Bronze', valor: 'R$ 400,00', cor: '#92400e' },
];

export async function alertaRetencaoMeta(): Promise<void> {
  const mes = mesAtual();
  const now = new Date();
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const dateTo = now.toISOString().substring(0, 10);

  const operadores = await fetchRetencao({ dateFrom, dateTo });

  for (const op of operadores) {
    for (const meta of METAS) {
      if (op.qtd_retidas >= meta.minimo) {
        const enviado = await jaEnviou('RETENCAO_META', op.nome_operador, mes, meta.nivel);
        if (!enviado) {
          const html = emailTemplate(
            `Meta de Retenção Atingida — ${meta.label}`,
            meta.cor,
            `<p>O operador <strong>${op.nome_operador}</strong> atingiu a faixa <strong>${meta.label}</strong> de retenção neste mês.</p>
             <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
               <tr style="background:#f3f4f6">
                 <th style="padding:8px 12px;text-align:left">Operador</th>
                 <th style="padding:8px 12px;text-align:left">Retenções</th>
                 <th style="padding:8px 12px;text-align:left">Faixa</th>
                 <th style="padding:8px 12px;text-align:left">Comissão</th>
                 <th style="padding:8px 12px;text-align:left">% Reversão</th>
               </tr>
               <tr>
                 <td style="padding:8px 12px">${op.nome_operador}</td>
                 <td style="padding:8px 12px">${op.qtd_retidas}</td>
                 <td style="padding:8px 12px">${meta.label}</td>
                 <td style="padding:8px 12px">${meta.valor}</td>
                 <td style="padding:8px 12px">${op.pct_reversao.toFixed(1)}%</td>
               </tr>
             </table>`,
          );

          await transporter.sendMail({
            from: FROM,
            to: EMAILS_SAC.join(', '),
            subject: `🏆 ${op.nome_operador} atingiu a meta ${meta.label} de retenção — ${mes}`,
            html,
          });

          await registrarEnvio('RETENCAO_META', op.nome_operador, mes, meta.nivel);
          logger.info(`[ALERTA] Retenção meta ${meta.label}: ${op.nome_operador}`);
        }
      }
    }
  }
}

// ── 4. Operadores abaixo da meta no final do mês (dia >= 25) ─────────────────

export async function alertaRetencaoFimMes(): Promise<void> {
  const now = new Date();
  if (now.getDate() < 25) return;

  const mes = mesAtual();
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const dateTo = now.toISOString().substring(0, 10);

  const operadores = await fetchRetencao({ dateFrom, dateTo });
  const abaixo = operadores.filter((op) => op.qtd_retidas < 70);

  if (abaixo.length === 0) return;

  const novos: typeof abaixo = [];
  for (const op of abaixo) {
    const enviado = await jaEnviou('RETENCAO_FIM_MES', op.nome_operador, mes);
    if (!enviado) novos.push(op);
  }

  if (novos.length === 0) return;

  const linhas = novos
    .map(
      (op) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${op.nome_operador}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${op.qtd_retidas}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${70 - op.qtd_retidas} retenções</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${op.pct_reversao.toFixed(1)}%</td>
        </tr>`,
    )
    .join('');

  const html = emailTemplate(
    'Atenção: Operadores Abaixo da Meta de Retenção',
    '#7c3aed',
    `<p>Faltam poucos dias para o fim do mês e os operadores abaixo ainda não atingiram a meta mínima de <strong>70 retenções</strong>.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
       <thead>
         <tr style="background:#f3f4f6">
           <th style="padding:8px 12px;text-align:left">Operador</th>
           <th style="padding:8px 12px;text-align:left">Retenções Atuais</th>
           <th style="padding:8px 12px;text-align:left">Faltam</th>
           <th style="padding:8px 12px;text-align:left">% Reversão</th>
         </tr>
       </thead>
       <tbody>${linhas}</tbody>
     </table>`,
  );

  await transporter.sendMail({
    from: FROM,
    to: EMAILS_SAC.join(', '),
    subject: `⏰ ${novos.length} operador(es) abaixo da meta de retenção — fim de mês ${mes}`,
    html,
  });

  for (const op of novos) {
    await registrarEnvio('RETENCAO_FIM_MES', op.nome_operador, mes);
  }

  logger.info(`[ALERTA] Retenção fim de mês: ${novos.length} operador(es) notificado(s).`);
}

// ── 5. Atendimento: volume do dia muito acima do normal ──────────────────────

const LIMITE_PCT_VOLUME_ALTO = 50; // dia 50%+ acima da média móvel dos últimos 30 dias
const VOLUME_MINIMO_BASELINE = 3;  // evita alerta ruidoso num setor de baixíssimo volume (ex: N2, Backoffice)

function diaAtual(): string {
  return new Date().toISOString().slice(0, 10);
}

/// Roda pra TODOS os setores configurados (ver SETORES_ATENDIMENTO em
/// atendimento.types.ts) — diferente da monitoria de qualidade (que tem
/// orçamento de IA e por isso é seletiva por setor no cron), esse alerta só
/// faz agregação Mongo (sem custo de IA), então não tem motivo pra excluir
/// setor nenhum por padrão.
export async function alertaAtendimentoVolumeAlto(): Promise<void> {
  const dia = diaAtual();

  for (const setor of TODOS_SETORES) {
    const comparativo = await getComparativoVolumeHoje(setor);
    if (
      comparativo.mediaAnterior === null ||
      comparativo.mediaAnterior < VOLUME_MINIMO_BASELINE ||
      comparativo.pctAcimaDaMedia === null ||
      comparativo.pctAcimaDaMedia < LIMITE_PCT_VOLUME_ALTO
    ) continue;

    const enviado = await jaEnviou('ATENDIMENTO_VOLUME_ALTO', setor, dia);
    if (enviado) continue;

    const html = emailTemplate(
      `Volume Alto de Atendimento — ${setor}`,
      '#d97706',
      `<p>O volume de atendimentos de <strong>${setor}</strong> hoje está
       <strong>${comparativo.pctAcimaDaMedia.toFixed(0)}% acima</strong> da média dos últimos 30 dias.</p>
       <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
         <tr style="background:#f3f4f6">
           <th style="padding:8px 12px;text-align:left">Setor</th>
           <th style="padding:8px 12px;text-align:left">Hoje</th>
           <th style="padding:8px 12px;text-align:left">Média (30d)</th>
           <th style="padding:8px 12px;text-align:left">Variação</th>
         </tr>
         <tr>
           <td style="padding:8px 12px">${setor}</td>
           <td style="padding:8px 12px">${comparativo.volumeHoje}</td>
           <td style="padding:8px 12px">${comparativo.mediaAnterior.toFixed(1)}</td>
           <td style="padding:8px 12px">▲ ${comparativo.pctAcimaDaMedia.toFixed(0)}%</td>
         </tr>
       </table>`,
    );

    await transporter.sendMail({
      from: FROM,
      to: EMAILS_SAC.join(', '),
      subject: `📈 Volume alto de atendimento — ${setor} (${comparativo.pctAcimaDaMedia.toFixed(0)}% acima da média)`,
      html,
    });

    await registrarEnvio('ATENDIMENTO_VOLUME_ALTO', setor, dia);
    logger.info(`[ALERTA] Volume alto de atendimento: ${setor} (${comparativo.pctAcimaDaMedia.toFixed(0)}% acima da média).`);
  }
}

// ── 6. Atendimento: taxa de escalonamento N1→N2 acima do normal ──────────────

const LIMITE_PCT_ESCALONAMENTO = 15; // % dos atendimentos N1 do dia escalados pra N2

export async function alertaAtendimentoEscalonamentoAlto(): Promise<void> {
  const dia = diaAtual();
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const kpisN1 = await buscarKpisAtendimento('N1', inicioHoje, hoje);
  if (kpisN1.volume < VOLUME_MINIMO_BASELINE || kpisN1.pctEscalonamento === null || kpisN1.pctEscalonamento < LIMITE_PCT_ESCALONAMENTO) return;

  const enviado = await jaEnviou('ATENDIMENTO_ESCALONAMENTO_ALTO', 'N1', dia);
  if (enviado) return;

  const html = emailTemplate(
    'Escalonamento N1 → N2 Acima do Normal',
    '#dc2626',
    `<p><strong>${kpisN1.pctEscalonamento.toFixed(1)}%</strong> dos atendimentos de Suporte N1 hoje
     foram escalados pra N2 (${kpisN1.escalonamentos} de ${kpisN1.volume}) — pode indicar que o N1
     não está conseguindo resolver casos que deveria, ou um problema recorrente novo.</p>`,
  );

  await transporter.sendMail({
    from: FROM,
    to: EMAILS_SAC.join(', '),
    subject: `🔴 Escalonamento N1→N2 acima do normal — ${kpisN1.pctEscalonamento.toFixed(1)}% hoje`,
    html,
  });

  await registrarEnvio('ATENDIMENTO_ESCALONAMENTO_ALTO', 'N1', dia);
  logger.info(`[ALERTA] Escalonamento N1→N2 alto: ${kpisN1.pctEscalonamento.toFixed(1)}% (${kpisN1.escalonamentos}/${kpisN1.volume}).`);
}

// ── Template HTML ─────────────────────────────────────────────────────────────

function emailTemplate(titulo: string, cor: string, conteudo: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <!-- Header -->
        <tr>
          <td style="background:${cor};padding:20px 32px">
            <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700">Canaã Performance</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">${titulo}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;color:#374151;font-size:14px;line-height:1.6">
            ${conteudo}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f3f4f6;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:11px;color:#9ca3af">
              Este é um email automático gerado pelo sistema Canaã Performance.<br>
              Data/hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

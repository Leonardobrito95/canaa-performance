/**
 * Relatório de exceção aprovado pelo RH.
 * Remove o gatilho de meta (R$8.000) e paga comissão sobre
 * contratos Liberados de cada consultor, independente do total.
 *
 * USO:
 *   node -r ts-node/register scripts/excecao-rh-relatorio.ts 2026-05
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import prisma from '../src/config/prisma';

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

const C = {
  navyDark  : 'FF002B5C',
  navyMid   : 'FF1A3C6E',
  greenDark : 'FF1A5C1A',
  orange    : 'FFB45309',
  orangeBg  : 'FFFFF3CD',
  white     : 'FFFFFFFF',
  black     : 'FF000000',
  red       : 'FFFF2A5F',
  greenOk   : 'FF00C853',
  border    : 'FFD0D7E0',
} as const;

type ArgbColor = string;

function fill(argb: ArgbColor): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function font(opts: { bold?: boolean; size?: number; argb?: ArgbColor; italic?: boolean }): Partial<ExcelJS.Font> {
  return { name: 'Calibri', size: opts.size ?? 9, bold: opts.bold ?? false,
           italic: opts.italic ?? false, color: { argb: opts.argb ?? C.black } };
}
function bord(): Partial<ExcelJS.Borders> {
  const s = { style: 'thin' as const, color: { argb: C.border } };
  return { top: s, bottom: s, left: s, right: s };
}
function centerAlign(): Partial<ExcelJS.Alignment> {
  return { horizontal: 'center', vertical: 'middle', wrapText: true };
}
function fmt(v: number): string {
  if (v === 0) return 'R$ -';
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function sectionHeader(ws: ExcelJS.Worksheet, row: number, label: string, cols: number, bg: ArgbColor) {
  ws.mergeCells(row, 1, row, cols);
  const r = ws.getRow(row);
  r.getCell(1).value = label;
  r.getCell(1).font = font({ bold: true, size: 10, argb: C.white });
  r.getCell(1).alignment = centerAlign();
  for (let c = 1; c <= cols; c++) r.getCell(c).fill = fill(bg);
  r.height = 20;
}

function colHeaders(ws: ExcelJS.Worksheet, row: number, labels: string[], bg: ArgbColor) {
  const r = ws.getRow(row);
  labels.forEach((label, i) => {
    const cell = r.getCell(i + 1);
    cell.value = label;
    cell.font = font({ bold: true, size: 8, argb: C.white });
    cell.fill = fill(bg);
    cell.alignment = centerAlign();
    cell.border = bord();
  });
  r.height = 30;
}

function dataRow(
  ws: ExcelJS.Worksheet,
  row: number,
  values: (string | number | null)[],
  overrides: Record<number, { bg?: ArgbColor; fontArgb?: ArgbColor; bold?: boolean }> = {},
) {
  const r = ws.getRow(row);
  values.forEach((v, i) => {
    const cell = r.getCell(i + 1);
    cell.value = v ?? '-';
    const ov = overrides[i] ?? {};
    cell.font = font({ bold: ov.bold ?? (i === 0), size: 9, argb: ov.fontArgb ?? C.black });
    cell.fill = fill(ov.bg ?? C.white);
    cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' };
    cell.border = bord();
  });
  r.height = 15;
}

async function main() {
  const mesRef = process.argv[2];
  if (!mesRef || !/^\d{4}-\d{2}$/.test(mesRef)) {
    console.error('Uso: node -r ts-node/register scripts/excecao-rh-relatorio.ts YYYY-MM');
    process.exit(1);
  }

  const [year, month] = mesRef.split('-').map(Number);
  const dateFrom = new Date(year, month - 1, 1);
  const dateTo   = new Date(year, month, 0, 23, 59, 59, 999);
  const refLabel = `${MESES[month - 1]}/${year}`;

  console.log(`Buscando dados para ${refLabel}...`);

  const [snapshots, commissions] = await Promise.all([
    prisma.vendasSnapshot.findMany({
      where: { mes_referencia: mesRef },
      orderBy: { nome_vendedor: 'asc' },
    }),
    prisma.commission.findMany({
      where: { data_registro: { gte: dateFrom, lte: dateTo } },
      orderBy: { vendedor: 'asc' },
    }),
  ]);

  console.log(`  Snapshots: ${snapshots.length} | Comissões BDR: ${commissions.length}`);

  // Resolução canônica de nomes (prefixo)
  const allRawNames = [
    ...snapshots.map(s => s.nome_vendedor.trim().toUpperCase()),
    ...commissions.map(c => c.vendedor.trim().toUpperCase()),
  ];
  const uniqueNames = [...new Set(allRawNames)].sort((a, b) => b.length - a.length);
  const canonicalMap = new Map<string, string>();
  for (const name of uniqueNames) {
    if (canonicalMap.has(name)) continue;
    for (const other of uniqueNames) {
      if (other !== name && name.startsWith(other + ' ') && !canonicalMap.has(other)) {
        canonicalMap.set(other, name);
      }
    }
    if (!canonicalMap.has(name)) canonicalMap.set(name, name);
  }
  const toKey = (nome: string) => canonicalMap.get(nome.trim().toUpperCase()) ?? nome.trim().toUpperCase();

  // Agrupamento
  const snapMap     = new Map<string, typeof snapshots[number][]>();
  const snapNomeMap = new Map<string, string>();
  for (const s of snapshots) {
    const key = toKey(s.nome_vendedor);
    if (!snapNomeMap.has(key) || s.nome_vendedor.trim().length > (snapNomeMap.get(key)?.length ?? 0))
      snapNomeMap.set(key, s.nome_vendedor.trim());
    const arr = snapMap.get(key) ?? [];
    arr.push(s);
    snapMap.set(key, arr);
  }

  const bdrMap     = new Map<string, typeof commissions[number][]>();
  const bdrNomeMap = new Map<string, string>();
  for (const c of commissions) {
    const key = toKey(c.vendedor);
    if (!bdrNomeMap.has(key) || c.vendedor.trim().length > (bdrNomeMap.get(key)?.length ?? 0))
      bdrNomeMap.set(key, c.vendedor.trim());
    const arr = bdrMap.get(key) ?? [];
    arr.push(c);
    bdrMap.set(key, arr);
  }

  const allKeys = [...new Set([...snapMap.keys(), ...bdrMap.keys()])].sort();

  // ── Cálculo de métricas com exceção RH ───────────────────────────────────────
  interface Metrica {
    nome: string;
    equipe: string;
    qtdTotal: number;
    valorAtivacaoTotal: number;  // TODOS os contratos ativados (liberados + bloqueados)
    qtdLiberados: number;
    valorLiberado: number;       // somente contratos com boleto pago (base real da meta)
    valorNaoLiberado: number;    // contratos bloqueados/pendentes (não entram na meta)
    comissaoLiberada: number;    // comissão calculada sobre liberados (exceção RH)
    metaNormal: boolean;         // se atingiria a meta pela regra padrão
    comissaoNormal: number;      // o que receberia pela regra padrão
    comBDR: number;
  }

  const metricas: Metrica[] = allKeys.map(key => {
    const vendas = snapMap.get(key) ?? [];
    const bdr    = bdrMap.get(key)  ?? [];
    const nome   = snapNomeMap.get(key) ?? bdrNomeMap.get(key) ?? key;
    const equipe = vendas[0]?.segmento ?? 'B2C';

    const liberadas       = vendas.filter(v => v.status_comissao === 'Liberada');
    const naoLiberadas    = vendas.filter(v => v.status_comissao !== 'Liberada');
    const valorAtivacaoTotal = vendas.reduce((s, v) => s + Number(v.valor_mensal), 0);
    const valorLiberado      = liberadas.reduce((s, v) => s + Number(v.valor_mensal), 0);
    const valorNaoLiberado   = naoLiberadas.reduce((s, v) => s + Number(v.valor_mensal), 0);
    const comissaoLiberada   = liberadas.reduce((s, v) => s + Number(v.valor_comissao), 0);

    const upgrades   = bdr.filter(c => c.tipo_negociacao === 'Upgrade');
    const downgrades = bdr.filter(c => c.tipo_negociacao === 'Downgrade');
    const renovacoes = bdr.filter(c => c.tipo_negociacao === 'Refidelizacao');
    const comBDR = upgrades.reduce((s, c) => s + Number(c.valor_comissao), 0)
                 + downgrades.reduce((s, c) => s + Number(c.valor_comissao), 0)
                 + renovacoes.reduce((s, c) => s + Number(c.valor_comissao), 0);

    const somaVendas   = upgrades.reduce((s, c) => s + Number(c.valor_comissao), 0) + valorLiberado;
    const metaNormal   = somaVendas >= 8_000;
    const comissaoNormal = metaNormal ? comissaoLiberada + comBDR : 0;

    return {
      nome, equipe,
      qtdTotal: vendas.length,
      valorAtivacaoTotal,
      qtdLiberados: liberadas.length,
      valorLiberado,
      valorNaoLiberado,
      comissaoLiberada,
      metaNormal,
      comissaoNormal,
      comBDR,
    };
  });

  // Coleta TODOS os contratos (liberados e não liberados) para a aba de detalhe
  const todosContratos: {
    vendedor: string; equipe: string; id_contrato: string; nome_cliente: string;
    plano: string; tipo_venda: string;
    valor_mensal: number; percentual: number; valor_comissao: number;
    status_comissao: string; motivo_bloqueio: string | null; assinatura: string;
    liberado: boolean;
  }[] = [];

  for (const key of allKeys) {
    const vendas = snapMap.get(key) ?? [];
    const nome   = snapNomeMap.get(key) ?? bdrNomeMap.get(key) ?? key;
    const equipe = vendas[0]?.segmento ?? 'B2C';
    for (const v of vendas) {
      const liberado = v.status_comissao === 'Liberada';
      todosContratos.push({
        vendedor:        nome,
        equipe,
        id_contrato:     v.id_contrato,
        nome_cliente:    v.nome_cliente,
        plano:           v.plano,
        tipo_venda:      v.tipo_venda ?? '',
        valor_mensal:    Number(v.valor_mensal),
        percentual:      Number(v.percentual),
        valor_comissao:  liberado ? Number(v.valor_comissao) : 0,
        status_comissao: v.status_comissao,
        motivo_bloqueio: v.motivo_bloqueio ?? null,
        assinatura:      v.assinatura ?? '',
        liberado,
      });
    }
  }

  // Ordena: por vendedor, depois liberados primeiro, depois por id
  todosContratos.sort((a, b) =>
    a.vendedor.localeCompare(b.vendedor) ||
    (b.liberado ? 1 : 0) - (a.liberado ? 1 : 0) ||
    a.id_contrato.localeCompare(b.id_contrato)
  );

  // ── Workbook ─────────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Canaã Performance';
  wb.created = new Date();

  const ws = wb.addWorksheet('Exceção RH');
  const N = 12; // 10 originais + 11: comissão BDR + 12: total a pagar

  ws.getColumn(1).width  = 28; // Colaborador
  ws.getColumn(2).width  = 8;  // Equipe
  ws.getColumn(3).width  = 16; // Valor Ativação Total
  ws.getColumn(4).width  = 16; // Valor Não Liberado
  ws.getColumn(5).width  = 16; // Valor Liberado (base meta)
  ws.getColumn(6).width  = 14; // Meta padrão
  ws.getColumn(7).width  = 14; // Atingiu meta? (padrão)
  ws.getColumn(8).width  = 16; // Comissão padrão (seria)
  ws.getColumn(9).width  = 14; // EXCEÇÃO RH aprovada
  ws.getColumn(10).width = 18; // Comissão vendas (exceção)
  ws.getColumn(11).width = 16; // Comissão BDR
  ws.getColumn(12).width = 18; // TOTAL A PAGAR

  // ── Banner exceção ───────────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, N);
  const bannerRow = ws.getRow(1);
  bannerRow.getCell(1).value = `EXCEÇÃO APROVADA PELO RH — ${refLabel.toUpperCase()} — Meta suspensa: comissão paga sobre contratos liberados`;
  bannerRow.getCell(1).font = font({ bold: true, size: 10, argb: C.orange });
  bannerRow.getCell(1).alignment = centerAlign();
  for (let c = 1; c <= N; c++) bannerRow.getCell(c).fill = fill(C.orangeBg);
  bannerRow.height = 24;

  ws.mergeCells(2, 1, 2, N);
  const genRow = ws.getRow(2);
  genRow.getCell(1).value = `Gerado em: ${new Date().toLocaleString('pt-BR')} · Documento interno · Não substitui o relatório oficial`;
  genRow.getCell(1).font = font({ italic: true, size: 8, argb: 'FF888888' });
  genRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  genRow.height = 16;

  // ── Legenda de cores (linha 3) ───────────────────────────────────────────────
  ws.mergeCells(3, 1, 3, 2);
  ws.mergeCells(3, 3, 3, 4);
  ws.mergeCells(3, 5, 3, 5);
  ws.mergeCells(3, 6, 3, 8);
  ws.mergeCells(3, 9, 3, 12);
  const legRow = ws.getRow(3);

  legRow.getCell(1).value = '';
  legRow.getCell(1).fill  = fill(C.white);

  legRow.getCell(3).value = 'ATIVACAO TOTAL (todos os contratos)';
  legRow.getCell(3).font  = font({ bold: true, size: 8, argb: C.white });
  legRow.getCell(3).alignment = centerAlign();
  legRow.getCell(3).fill  = fill('FF6B7280');

  legRow.getCell(5).value = 'BASE DA META (1o boleto pago)';
  legRow.getCell(5).font  = font({ bold: true, size: 8, argb: C.white });
  legRow.getCell(5).alignment = centerAlign();
  legRow.getCell(5).fill  = fill(C.navyDark);

  legRow.getCell(6).value = 'REGRA PADRAO (sem excecao)';
  legRow.getCell(6).font  = font({ bold: true, size: 8, argb: C.white });
  legRow.getCell(6).alignment = centerAlign();
  legRow.getCell(6).fill  = fill('FF6B2C0E');

  legRow.getCell(9).value = 'EXCECAO RH — PAGAMENTO';
  legRow.getCell(9).font  = font({ bold: true, size: 8, argb: C.white });
  legRow.getCell(9).alignment = centerAlign();
  legRow.getCell(9).fill  = fill(C.orange);

  legRow.height = 18;

  // ── Cabeçalhos de colunas ────────────────────────────────────────────────────
  const hRow = ws.getRow(4);
  const headDefs: { label: string; bg: string }[] = [
    { label: 'COLABORADOR',                                        bg: C.navyDark },
    { label: 'EQUIPE',                                             bg: C.navyDark },
    { label: 'VALOR DE ATIVACAO\n(todos os contratos)',            bg: '6B7280' },
    { label: 'DESTES, NAO LIBERADOS\n(boleto nao recebido)',       bg: '6B7280' },
    { label: 'LIBERADO PARA META\n(1o boleto pago)',               bg: C.navyMid },
    { label: 'META\nPADRAO',                                       bg: '6B2C0E' },
    { label: 'ATINGIU\nMETA?',                                     bg: '6B2C0E' },
    { label: 'COMISSAO PELO\nPADRAO (seria)',                      bg: '6B2C0E' },
    { label: 'EXCECAO\nRH',                                        bg: C.orange },
    { label: 'COMISSAO VENDAS\n(contratos liberados)',             bg: C.orange },
    { label: 'COMISSAO BDR\n(upgrade / renov)',                    bg: C.orange },
    { label: 'TOTAL A PAGAR\n(vendas + BDR)',                      bg: C.greenDark },
  ];
  headDefs.forEach(({ label, bg }, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = label;
    cell.font  = font({ bold: true, size: 8, argb: C.white });
    cell.fill  = fill(`FF${bg.replace(/^FF/, '')}`);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = bord();
  });
  hRow.height = 36;

  // ── Dados ────────────────────────────────────────────────────────────────────
  let row = 5;
  let totalAtivacao    = 0;
  let totalNaoLib      = 0;
  let totalLiberado    = 0;
  let totalComVendas   = 0;
  let totalComBDR      = 0;
  let totalGeral       = 0;
  let totalNormal      = 0;

  for (const m of metricas) {
    totalAtivacao  += m.valorAtivacaoTotal;
    totalNaoLib    += m.valorNaoLiberado;
    totalLiberado  += m.valorLiberado;
    totalComVendas += m.comissaoLiberada;
    totalComBDR    += m.comBDR;
    totalGeral     += m.comissaoLiberada + m.comBDR;
    totalNormal    += m.comissaoNormal;

    const totalAPagar = m.comissaoLiberada + m.comBDR;
    const r = ws.getRow(row++);
    const vals = [
      m.nome,
      m.equipe,
      fmt(m.valorAtivacaoTotal),
      fmt(m.valorNaoLiberado),
      fmt(m.valorLiberado),
      'R$ 8.000,00',
      'NAO',
      fmt(0),
      'SIM (RH)',
      fmt(m.comissaoLiberada),
      fmt(m.comBDR),
      fmt(totalAPagar),
    ];
    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.border = bord();
      cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' };
      if (i === 0 || i === 1) {
        cell.font = font({ bold: i === 0, size: 9 });
        cell.fill = fill(C.white);
      } else if (i === 2 || i === 3) {
        cell.font = font({ size: 9, argb: 'FF6B7280' });
        cell.fill = fill('FFF9FAFB');
      } else if (i === 4) {
        cell.font = font({ bold: true, size: 9, argb: C.navyDark });
        cell.fill = fill('FFE8F0FE');
      } else if (i === 5 || i === 6 || i === 7) {
        cell.font = font({ size: 9, argb: i === 6 ? C.red : 'FF6B2C0E' });
        cell.fill = fill('FFFFF3F3');
      } else if (i === 11) {
        cell.font = font({ bold: true, size: 9, argb: C.white });
        cell.fill = fill(C.greenDark);
      } else {
        cell.font = font({ bold: i === 8, size: 9, argb: i === 8 ? C.orange : C.black });
        cell.fill = fill(C.orangeBg);
      }
    });
    r.height = 15;
  }

  // ── Linha de totais ──────────────────────────────────────────────────────────
  row++;
  const totRow = ws.getRow(row);
  const totVals = [
    'TOTAL', '',
    fmt(totalAtivacao), fmt(totalNaoLib), fmt(totalLiberado),
    '', '', fmt(totalNormal),
    '', fmt(totalComVendas), fmt(totalComBDR), fmt(totalGeral),
  ];
  totVals.forEach((v, i) => {
    const cell = totRow.getCell(i + 1);
    cell.value = v || '';
    cell.font  = font({ bold: true, size: 10, argb: C.white });
    cell.alignment = centerAlign();
    cell.border = bord();
    if (i === 0 || i === 1) cell.fill = fill(C.navyDark);
    else if (i === 2 || i === 3) cell.fill = fill('FF6B7280');
    else if (i === 4) cell.fill = fill(C.navyMid);
    else if (i === 5 || i === 6 || i === 7) cell.fill = fill('FF6B2C0E');
    else if (i === 11) cell.fill = fill(C.greenDark);
    else cell.fill = fill(C.orange);
  });
  totRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  ws.mergeCells(row, 1, row, 2);
  totRow.height = 22;

  // ── Bloco explicativo ────────────────────────────────────────────────────────
  row += 2;

  const explicacoes = [
    'ATENCAO — COMO LER ESTE RELATORIO:',
    '',
    '1. VALOR DE ATIVACAO TOTAL: soma de TODOS os contratos ativados no mes (independente de pagamento).',
    '   Este valor PODE ultrapassar R$8.000, mas NAO e o que define a meta.',
    '',
    '2. NAO LIBERADOS: contratos cujo primeiro boleto ainda nao foi recebido (boleto nao pago, assinatura pendente ou contrato inativo).',
    '   Esses contratos ficam BLOQUEADOS e nao contam para a meta.',
    '',
    '3. LIBERADO PARA META: somente contratos com primeiro boleto CONFIRMADO no financeiro.',
    '   Este e o valor real que entra na contagem da meta de R$8.000.',
    '',
    '4. Nenhum colaborador atingiu R$8.000 em contratos LIBERADOS neste mes.',
    '   Pela regra padrao, a comissao seria R$0,00 para todos.',
    '',
    '5. EXCECAO RH: a pedido do RH e aprovado pela diretoria, foi autorizado o pagamento',
    '   sobre o valor liberado de cada colaborador, sem exigir o gatilho de R$8.000.',
  ];

  for (const linha of explicacoes) {
    ws.mergeCells(row, 1, row, N);
    const r = ws.getRow(row);
    r.getCell(1).value = linha;
    r.getCell(1).font = font({
      bold: linha.startsWith('ATENCAO') || linha.match(/^\d\./) ? true : false,
      size: 8,
      argb: linha.startsWith('ATENCAO') ? C.orange : '444444',
    });
    r.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    if (linha.startsWith('ATENCAO')) {
      for (let c = 1; c <= N; c++) r.getCell(c).fill = fill(C.orangeBg);
    }
    r.height = linha === '' ? 6 : 14;
    row++;
  }

  // ── Aba 2: Todos os contratos ativados (liberados + não liberados) ────────────
  const ws2 = wb.addWorksheet('Contratos Ativados');
  const ND = 11;

  ws2.getColumn(1).width  = 26;
  ws2.getColumn(2).width  = 8;
  ws2.getColumn(3).width  = 12;
  ws2.getColumn(4).width  = 32;
  ws2.getColumn(5).width  = 24;
  ws2.getColumn(6).width  = 11;
  ws2.getColumn(7).width  = 13;
  ws2.getColumn(8).width  = 10;
  ws2.getColumn(9).width  = 14;
  ws2.getColumn(10).width = 30;
  ws2.getColumn(11).width = 14;

  // Banner
  ws2.mergeCells(1, 1, 1, ND);
  const b2 = ws2.getRow(1);
  b2.getCell(1).value = `TODOS OS CONTRATOS ATIVADOS — ${refLabel.toUpperCase()} — Liberados (comissão) e Não Liberados (sem comissão)`;
  b2.getCell(1).font = font({ bold: true, size: 10, argb: C.navyDark });
  b2.getCell(1).alignment = centerAlign();
  for (let c = 1; c <= ND; c++) b2.getCell(c).fill = fill('FFE8F0FE');
  b2.height = 22;

  // Legenda de cores
  ws2.mergeCells(2, 1, 2, 5);
  ws2.mergeCells(2, 6, 2, ND);
  const legRow2 = ws2.getRow(2);
  legRow2.getCell(1).value = '  VERDE = Liberado (1º boleto pago) — gera comissão';
  legRow2.getCell(1).font  = font({ bold: true, size: 8, argb: C.white });
  legRow2.getCell(1).fill  = fill(C.greenDark);
  legRow2.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  legRow2.getCell(6).value = '  CINZA = Não Liberado (boleto pendente / assinatura / contrato inativo) — não entra na meta nem na comissão';
  legRow2.getCell(6).font  = font({ bold: true, size: 8, argb: C.white });
  legRow2.getCell(6).fill  = fill('FF6B7280');
  legRow2.getCell(6).alignment = { horizontal: 'left', vertical: 'middle' };
  legRow2.height = 18;

  colHeaders(ws2, 3, [
    'VENDEDOR', 'EQUIPE', 'ID CONTRATO', 'CLIENTE',
    'PLANO', 'TIPO VENDA', 'VALOR MENSAL',
    '% COMISSÃO', 'COMISSÃO', 'STATUS', 'ASSINATURA',
  ], C.navyDark);

  let det_row = 4;
  let det_total_ativado   = 0;
  let det_total_liberado  = 0;
  let det_total_bloqueado = 0;
  let det_total_com       = 0;
  let qtd_lib = 0;
  let qtd_blo = 0;
  let lastVendedor = '';

  for (const d of todosContratos) {
    // Cabeçalho por vendedor
    if (d.vendedor !== lastVendedor) {
      if (lastVendedor !== '') det_row++;
      ws2.mergeCells(det_row, 1, det_row, ND);
      const subRow = ws2.getRow(det_row);
      subRow.getCell(1).value = d.vendedor;
      subRow.getCell(1).font  = font({ bold: true, size: 9, argb: C.white });
      subRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      for (let c = 1; c <= ND; c++) subRow.getCell(c).fill = fill(C.navyMid);
      subRow.height = 18;
      det_row++;
      lastVendedor = d.vendedor;
    }

    det_total_ativado += d.valor_mensal;
    if (d.liberado) { det_total_liberado += d.valor_mensal; det_total_com += d.valor_comissao; qtd_lib++; }
    else            { det_total_bloqueado += d.valor_mensal; qtd_blo++; }

    const bgRow  = d.liberado ? 'FFF0FDF4' : 'FFF9FAFB';
    const fgNome = d.liberado ? C.greenDark  : '6B7280';
    const fgVal  = d.liberado ? C.navyDark   : '9CA3AF';
    const fgCom  = d.liberado ? C.greenOk    : '9CA3AF';
    const fgStat = d.liberado ? C.greenOk    : C.red;

    const r = ws2.getRow(det_row++);
    const vals = [
      d.vendedor, d.equipe, d.id_contrato, d.nome_cliente,
      d.plano, d.tipo_venda || '-',
      fmt(d.valor_mensal),
      d.liberado && d.percentual > 0 ? `${(d.percentual * 100).toFixed(0)}%` : '-',
      d.liberado ? fmt(d.valor_comissao) : 'R$ -',
      d.status_comissao,
      d.assinatura || '-',
    ];
    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value  = v;
      cell.fill   = fill(bgRow);
      cell.border = bord();
      cell.alignment = { horizontal: i === 0 || i === 3 ? 'left' : 'center', vertical: 'middle' };
      if (i === 0)       cell.font = font({ bold: true, size: 9, argb: fgNome });
      else if (i === 6)  cell.font = font({ size: 9, argb: fgVal });
      else if (i === 8)  cell.font = font({ bold: d.liberado, size: 9, argb: fgCom });
      else if (i === 9)  cell.font = font({ size: 8, argb: fgStat });
      else               cell.font = font({ size: 9, argb: fgVal });
    });
    r.height = 14;
  }

  // Linha de totais
  det_row++;
  ws2.mergeCells(det_row, 1, det_row, 6);
  const totRow2 = ws2.getRow(det_row);
  totRow2.getCell(1).value = `TOTAL — ${qtd_lib} liberados | ${qtd_blo} não liberados | ${qtd_lib + qtd_blo} contratos`;
  totRow2.getCell(1).font  = font({ bold: true, size: 9, argb: C.white });
  totRow2.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  for (let c = 1; c <= ND; c++) totRow2.getCell(c).fill = fill(C.navyDark);

  totRow2.getCell(7).value  = fmt(det_total_ativado);
  totRow2.getCell(7).font   = font({ bold: true, size: 9, argb: C.white });
  totRow2.getCell(7).alignment = centerAlign();
  totRow2.getCell(7).border = bord();

  totRow2.getCell(9).value  = fmt(det_total_com);
  totRow2.getCell(9).font   = font({ bold: true, size: 9, argb: C.greenOk });
  totRow2.getCell(9).alignment = centerAlign();
  totRow2.getCell(9).border = bord();

  // Sub-totais na linha seguinte
  det_row++;
  ws2.mergeCells(det_row, 1, det_row, 6);
  const subTotRow = ws2.getRow(det_row);
  subTotRow.getCell(1).value = `  Liberado: ${fmt(det_total_liberado)}   |   Não liberado (bloqueado): ${fmt(det_total_bloqueado)}`;
  subTotRow.getCell(1).font  = font({ italic: true, size: 8, argb: '444444' });
  subTotRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  for (let c = 1; c <= ND; c++) subTotRow.getCell(c).fill = fill('FFF3F4F6');
  subTotRow.height = 16;
  totRow2.height = 22;

  // Salva arquivo
  const outDir  = path.resolve('/home/canaa/Comissões');
  const outFile = path.join(outDir, `excecao-rh-${mesRef}.xlsx`);
  await wb.xlsx.writeFile(outFile);

  console.log(`\nArquivo gerado: ${outFile}`);
  console.log(`\nResumo:`);
  console.log(`  Total VENDAS (exceção):    ${fmt(totalComVendas)}`);
  console.log(`  Total BDR:                 ${fmt(totalComBDR)}`);
  console.log(`  TOTAL GERAL A PAGAR:       ${fmt(totalGeral)}`);
  console.log(`  Total pela regra NORMAL:   ${fmt(totalNormal)}`);
  console.log(`\nPor consultor:`);
  for (const m of metricas.filter(m => m.comissaoLiberada + m.comBDR > 0)) {
    console.log(`  ${m.nome.padEnd(25)} vendas: ${fmt(m.comissaoLiberada).padStart(12)}  BDR: ${fmt(m.comBDR).padStart(12)}  total: ${fmt(m.comissaoLiberada + m.comBDR).padStart(12)}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

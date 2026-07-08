import ExcelJS from 'exceljs';
import prisma from '../../config/prisma';

// ── Regras de negócio ────────────────────────────────────────────────────────
// Meta calculada sobre valor total ativado (liberado + bloqueado)
// Comissão paga somente sobre o valor liberado (1º boleto recebido)
const META_B2C           = 10_000;
const META_B2B           = 7_000;
const META_BDR_UPGRADES  = 50;
const META_BDR_RENOVACOES = 80;

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

// ── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  navyDark  : 'FF002B5C',
  navyMid   : 'FF1A3C6E',
  greenDark : 'FF1A5C1A',
  yellow    : 'FFFFD700',
  white     : 'FFFFFFFF',
  black     : 'FF000000',
  red       : 'FFFF2A5F',
  greenOk   : 'FF00C853',
  border    : 'FFD0D7E0',
} as const;

// ── Helpers de estilo ────────────────────────────────────────────────────────
type ArgbColor = string;

function fill(argb: ArgbColor): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function font(opts: { bold?: boolean; size?: number; argb?: ArgbColor; italic?: boolean }): Partial<ExcelJS.Font> {
  return {
    name: 'Calibri',
    size: opts.size ?? 9,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    color: { argb: opts.argb ?? C.black },
  };
}

function border(): Partial<ExcelJS.Borders> {
  const s = { style: 'thin' as const, color: { argb: C.border } };
  return { top: s, bottom: s, left: s, right: s };
}

function centerAlign(wrap = false): Partial<ExcelJS.Alignment> {
  return { horizontal: 'center', vertical: 'middle', wrapText: wrap };
}

function fmt(v: number): string {
  if (v === 0) return 'R$ -';
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

// ── Secção: cabeçalho mesclado ────────────────────────────────────────────────
function sectionHeader(ws: ExcelJS.Worksheet, row: number, label: string, cols: number, bg: ArgbColor) {
  ws.mergeCells(row, 1, row, cols);
  const r = ws.getRow(row);
  const cell = r.getCell(1);
  cell.value = label;
  cell.font = font({ bold: true, size: 10, argb: C.white });
  cell.alignment = centerAlign();
  for (let c = 1; c <= cols; c++) {
    r.getCell(c).fill = fill(bg);
  }
  r.height = 20;
}

// ── Secção: linha de cabeçalhos de colunas ────────────────────────────────────
function colHeaders(
  ws: ExcelJS.Worksheet,
  row: number,
  labels: string[],
  bg: ArgbColor,
  overrides: Record<number, { bg?: ArgbColor; fontArgb?: ArgbColor }> = {},
) {
  const r = ws.getRow(row);
  labels.forEach((label, i) => {
    const cell = r.getCell(i + 1);
    cell.value = label;
    const ov = overrides[i] ?? {};
    cell.font  = font({ bold: true, size: 8, argb: ov.fontArgb ?? C.white });
    cell.fill  = fill(ov.bg ?? bg);
    cell.alignment = centerAlign(true);
    cell.border = border();
  });
  r.height = 30;
}

// ── Secção: linha de dados ────────────────────────────────────────────────────
function dataRow(
  ws: ExcelJS.Worksheet,
  row: number,
  values: (string | number | null)[],
  overrides: Record<number, { bg?: ArgbColor; fontArgb?: ArgbColor; bold?: boolean }> = {},
) {
  const r = ws.getRow(row);
  values.forEach((v, i) => {
    const cell = r.getCell(i + 1);
    cell.value = v ?? '—';
    const ov = overrides[i] ?? {};
    cell.font  = font({ bold: ov.bold ?? (i === 0), size: 9, argb: ov.fontArgb ?? C.black });
    cell.fill  = fill(ov.bg ?? C.white);
    cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' };
    cell.border = border();
  });
  r.height = 15;
}

// ── Interface de métricas por vendedor ────────────────────────────────────────
interface VendedorMetrics {
  nome:    string;
  equipe:  string;
  // BDR
  qtdUpgrade:  number; comUpgrade:  number;
  qtdDowngrade: number; comDowngrade: number;
  qtdRenovacao: number; comRenovacao: number;
  metaBDR: boolean;
  // Vendas
  qtdVendas: number; valorVendas: number;
  qtdInterna: number; qtdExterna: number; qtdPlantao: number;
  valorComissaoVendas: number;
  // Aplicação de regras
  valorAtivado: number;           // sum(valor_mensal) de TODOS os contratos — base da meta
  valorLiberado: number;          // sum(valor_mensal) where Liberada — base da comissão
  somaVendas: number;             // comUpgrade + valorAtivado (para checar meta)
  analiseMeta: boolean;
  valorComissaoLiberada: number;  // sum(valor_comissao) where Liberada — o que é pago
  valorComissaoBloqueada: number; // sum(valor_comissao) where !Liberada — pendente
  // Final
  comissaoAPagar: number;
}

// ── Exportação principal ──────────────────────────────────────────────────────
export async function gerarRelatorioComissao(mes_referencia: string): Promise<Buffer> {
  const [year, month] = mes_referencia.split('-').map(Number);
  const dateFrom = new Date(year, month - 1, 1);
  const dateTo   = new Date(year, month, 0, 23, 59, 59, 999);

  const [snapshots, commissions] = await Promise.all([
    prisma.vendasSnapshot.findMany({
      where:   { mes_referencia },
      orderBy: { nome_vendedor: 'asc' },
    }),
    prisma.commission.findMany({
      where:   { data_registro: { gte: dateFrom, lte: dateTo } },
      orderBy: { vendedor: 'asc' },
    }),
  ]);

  // Resolve prefixos: "MARIA" e "MARIA SILVA" → ambos mapeiam para "MARIA SILVA"
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

  // Agrupamento com chave canônica
  const snapMap     = new Map<string, typeof snapshots[0][]>();
  const snapNomeMap = new Map<string, string>();
  for (const s of snapshots) {
    const key = toKey(s.nome_vendedor);
    if (!snapNomeMap.has(key) || s.nome_vendedor.trim().length > (snapNomeMap.get(key)?.length ?? 0))
      snapNomeMap.set(key, s.nome_vendedor.trim());
    const arr = snapMap.get(key) ?? [];
    arr.push(s);
    snapMap.set(key, arr);
  }

  const bdrMap     = new Map<string, typeof commissions[0][]>();
  const bdrNomeMap = new Map<string, string>();
  for (const c of commissions) {
    const key = toKey(c.vendedor);
    if (!bdrNomeMap.has(key) || c.vendedor.trim().length > (bdrNomeMap.get(key)?.length ?? 0))
      bdrNomeMap.set(key, c.vendedor.trim());
    const arr = bdrMap.get(key) ?? [];
    arr.push(c);
    bdrMap.set(key, arr);
  }

  const allVendedores = [...new Set([...snapMap.keys(), ...bdrMap.keys()])].sort();

  // Cálculo de métricas — usa a chave normalizada (UPPER) para cruzar, mas preserva nome legível
  const metrics: VendedorMetrics[] = allVendedores.map((key) => {
    const vendas = snapMap.get(key) ?? [];
    const bdr    = bdrMap.get(key)  ?? [];
    // Prefere o nome do snapshot (vem do IXC com formatação original); fallback para BDR
    const nome   = snapNomeMap.get(key) ?? bdrNomeMap.get(key) ?? key;
    const equipe = vendas[0]?.segmento ?? 'B2C';

    const upgrades  = bdr.filter((c) => c.tipo_negociacao === 'Upgrade');
    const downgrades = bdr.filter((c) => c.tipo_negociacao === 'Downgrade');
    const renovacoes = bdr.filter((c) => c.tipo_negociacao === 'Refidelizacao');

    const qtdUpgrade   = upgrades.length;
    const comUpgrade   = upgrades.reduce((s, c) => s + Number(c.valor_comissao), 0);
    const qtdDowngrade = downgrades.length;
    const comDowngrade = downgrades.reduce((s, c) => s + Number(c.valor_comissao), 0);
    const qtdRenovacao = renovacoes.length;
    const comRenovacao = renovacoes.reduce((s, c) => s + Number(c.valor_comissao), 0);
    const metaBDR      = qtdUpgrade >= META_BDR_UPGRADES && qtdRenovacao >= META_BDR_RENOVACOES;

    const qtdVendas   = vendas.length;
    const valorVendas = vendas.reduce((s, v) => s + Number(v.valor_mensal), 0);
    const qtdInterna  = vendas.filter((v) => v.tipo_venda === 'INTERNO').length;
    const qtdExterna  = vendas.filter((v) => v.tipo_venda === 'EXTERNO').length;
    const qtdPlantao  = vendas.filter((v) => ['PLANTÃO','PLANTAO'].includes(v.tipo_venda?.toUpperCase() ?? '')).length;

    const liberadas  = vendas.filter((v) => v.status_comissao === 'Liberada');
    const bloqueadas = vendas.filter((v) => v.status_comissao !== 'Liberada');

    const valorComissaoVendas    = vendas.reduce((s, v) => s + Number(v.valor_comissao), 0);
    const valorComissaoLiberada  = liberadas.reduce((s, v) => s + Number(v.valor_comissao), 0);
    const valorComissaoBloqueada = bloqueadas.reduce((s, v) => s + Number(v.valor_comissao), 0);
    const valorAtivado           = vendas.reduce((s, v) => s + Number(v.valor_mensal), 0);   // todos os contratos → base meta
    const valorLiberado          = liberadas.reduce((s, v) => s + Number(v.valor_mensal), 0); // só liberados → base comissão
    const somaVendas             = comUpgrade + valorAtivado; // meta sobre valor total ativado

    const metaLimit   = equipe === 'B2B' ? META_B2B : META_B2C;
    const analiseMeta = somaVendas >= metaLimit;

    // Comissão a pagar só se meta atingida
    const comissaoAPagar = analiseMeta
      ? valorComissaoLiberada + comUpgrade + comDowngrade + comRenovacao
      : 0;

    return {
      nome, equipe,
      qtdUpgrade, comUpgrade, qtdDowngrade, comDowngrade, qtdRenovacao, comRenovacao, metaBDR,
      qtdVendas, valorVendas, qtdInterna, qtdExterna, qtdPlantao, valorComissaoVendas,
      valorAtivado, valorLiberado, somaVendas, analiseMeta,
      valorComissaoLiberada, valorComissaoBloqueada,
      comissaoAPagar,
    };
  });

  // Workbook
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Canaã Performance';
  wb.created  = new Date();

  const refLabel = `${MESES[month - 1]}/${year}`;

  buildSheet1(wb, metrics, refLabel);
  buildSheet2(wb, snapshots);
  buildSheet3(wb, commissions);

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

// ── Sheet 1: Aplicação de regras ─────────────────────────────────────────────
function buildSheet1(wb: ExcelJS.Workbook, metrics: VendedorMetrics[], refLabel: string) {
  const ws = wb.addWorksheet('Aplicação de regras');
  const N = 9; // colunas

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 8;
  ws.getColumn(3).width = 13;
  ws.getColumn(4).width = 17;
  ws.getColumn(5).width = 13;
  ws.getColumn(6).width = 17;
  ws.getColumn(7).width = 13;
  ws.getColumn(8).width = 17;
  ws.getColumn(9).width = 14;

  // Row 1: cabeçalho principal
  ws.mergeCells(1, 1, 1, 7);
  ws.mergeCells(1, 8, 1, N);
  const hr = ws.getRow(1);
  const titleCell = hr.getCell(1);
  titleCell.value = 'COMISSÃO DE VENDAS';
  titleCell.font  = font({ bold: true, size: 14, argb: C.white });
  titleCell.alignment = centerAlign();
  const refCell = hr.getCell(8);
  refCell.value = `Referência: ${refLabel}`;
  refCell.font  = font({ size: 9, italic: true, argb: C.white });
  refCell.alignment = { horizontal: 'right', vertical: 'middle' };
  for (let c = 1; c <= N; c++) hr.getCell(c).fill = fill(C.navyDark);
  hr.height = 30;

  let row = 3;

  // ── Seção 1: ALTERAÇÕES DE PLANO (BDR) ──────────────────────────────────────
  sectionHeader(ws, row++, 'ALTERAÇÕES DE PLANO', N, C.navyDark);
  colHeaders(ws, row++, [
    'COLABORADOR','EQUIPE',
    'QTD DOWNGRADE','COMISSÃO DOWNGRADE',
    'QTD UPGRADE','COMISSÃO UPGRADE',
    'QTD RENOVAÇÃO','COMISSÃO RENOVAÇÃO',
    'META ALCANÇADA',
  ], C.navyMid);

  const bdrRows = metrics.filter((m) => m.qtdUpgrade > 0 || m.qtdDowngrade > 0 || m.qtdRenovacao > 0);
  for (const m of bdrRows) {
    dataRow(ws, row++, [
      m.nome, m.equipe,
      m.qtdDowngrade || null, fmt(m.comDowngrade),
      m.qtdUpgrade   || null, fmt(m.comUpgrade),
      m.qtdRenovacao || null, fmt(m.comRenovacao),
      m.metaBDR ? 'SIM' : 'NÃO',
    ], {
      8: { fontArgb: m.metaBDR ? C.greenOk : C.red, bold: true },
    });
  }
  if (bdrRows.length === 0) {
    ws.mergeCells(row, 1, row, N);
    const r = ws.getRow(row++);
    r.getCell(1).value = 'Sem registros BDR neste período';
    r.getCell(1).font  = font({ italic: true, argb: 'FF888888' });
    r.height = 15;
  }

  row++; // espaço

  // ── Seção 2: VENDAS ATIVADAS ─────────────────────────────────────────────────
  sectionHeader(ws, row++, 'VENDAS ATIVADAS', N, C.navyDark);
  colHeaders(ws, row++, [
    'COLABORADOR','EQUIPE',
    'QTD DE VENDAS','VALOR ATIVADO (BASE META)',
    'QTD INTERNA','QTD EXTERNA','QTD PLANTÃO',
    'COMISSÃO POTENCIAL','META ALCANÇADA',
  ], C.navyMid);

  const vendasRows = metrics.filter((m) => m.qtdVendas > 0);
  for (const m of vendasRows) {
    dataRow(ws, row++, [
      m.nome, m.equipe,
      m.qtdVendas, fmt(m.valorVendas),
      m.qtdInterna || null, m.qtdExterna || null, m.qtdPlantao || null,
      fmt(m.valorComissaoVendas),
      m.analiseMeta ? 'SIM' : 'NÃO',
    ], {
      8: { fontArgb: m.analiseMeta ? C.greenOk : C.red, bold: true },
    });
  }
  if (vendasRows.length === 0) {
    ws.mergeCells(row, 1, row, N);
    const r = ws.getRow(row++);
    r.getCell(1).value = 'Sem snapshot para este período';
    r.getCell(1).font  = font({ italic: true, argb: 'FF888888' });
    r.height = 15;
  }

  row++; // espaço

  // ── Seção 3: APLICAÇÃO DE REGRAS ─────────────────────────────────────────────
  const metaLabel = `META: R$ ${META_B2C.toLocaleString('pt-BR')}`;
  sectionHeader(ws, row++, `APLICAÇÃO DE REGRAS — ${metaLabel} EM VALOR ATIVADO`, N, C.navyDark);
  colHeaders(ws, row++, [
    'COLABORADOR','EQUIPE',
    'VALOR UPGRADE','VALOR ATIVADO (TODOS OS CONTRATOS)',
    `TOTAL PARA META (${metaLabel})`,'ATINGIU A META?',
    'VALOR LIBERADO (BASE DA COMISSÃO)',
    'COMISSÃO A PAGAR (só sobre liberado)',
    'COMISSÃO PENDENTE (sem liberação)',
  ], C.navyMid);

  for (const m of metrics) {
    const comissaoFinal = m.analiseMeta ? m.valorComissaoLiberada : 0;
    dataRow(ws, row++, [
      m.nome, m.equipe,
      fmt(m.comUpgrade),
      fmt(m.valorAtivado),
      fmt(m.somaVendas),
      m.analiseMeta ? 'SIM' : 'NÃO',
      fmt(m.valorLiberado),
      fmt(comissaoFinal),
      fmt(m.valorComissaoBloqueada),
    ], {
      5: { fontArgb: m.analiseMeta ? C.greenOk : C.red, bold: true },
      7: { fontArgb: m.analiseMeta ? C.greenOk : 'FF888888' },
      8: { fontArgb: C.red },
    });
  }

  row++; // espaço

  // ── Seção 4: COMISSÃO (verde) ─────────────────────────────────────────────────
  const N4 = 8;
  sectionHeader(ws, row++, 'COMISSÃO', N4, C.greenDark);
  colHeaders(ws, row++, [
    'COLABORADOR','EQUIPE/CARGO',
    'META ATINGIDA','SOMA',
    'ALTERAÇÃO DE PLANO','BÔNUS POR SUPERAÇÃO',
    'VALORES RETROATIVOS','COMISSÃO A PAGAR',
  ], C.greenDark, {
    6: { bg: C.yellow, fontArgb: C.black },  // VALORES RETROATIVOS
  });

  let totalComissao = 0;
  for (const m of metrics) {
    const soma      = m.analiseMeta ? m.valorComissaoLiberada : 0;
    const alteracao = m.analiseMeta ? (m.comUpgrade + m.comDowngrade + m.comRenovacao) : 0;
    totalComissao  += m.comissaoAPagar;

    dataRow(ws, row++, [
      m.nome, m.equipe,
      m.analiseMeta ? 'SIM' : 'NÃO',
      fmt(soma),
      fmt(alteracao),
      'R$ -',
      'R$ -',
      fmt(m.comissaoAPagar),
    ], {
      2: { fontArgb: m.analiseMeta ? C.greenOk : C.red, bold: true },
      6: { bg: C.yellow },
      7: { bold: true },
    });
  }

  // Linha TOTAL
  ws.mergeCells(row, 1, row, N4 - 1);
  const totalRow = ws.getRow(row);
  const tcLabel  = totalRow.getCell(1);
  tcLabel.value     = 'TOTAL';
  tcLabel.font      = font({ bold: true, size: 10, argb: C.white });
  tcLabel.alignment = centerAlign();
  tcLabel.fill      = fill(C.greenDark);
  const tcVal = totalRow.getCell(N4);
  tcVal.value     = fmt(totalComissao);
  tcVal.font      = font({ bold: true, size: 10, argb: C.white });
  tcVal.alignment = centerAlign();
  tcVal.fill      = fill(C.greenDark);
  tcVal.border    = border();
  totalRow.height = 22;
}

// ── Sheet 2: Vendas Ativas B2B-B2C ───────────────────────────────────────────
function buildSheet2(
  wb: ExcelJS.Workbook,
  snapshots: Awaited<ReturnType<typeof prisma.vendasSnapshot.findMany>>,
) {
  const ws = wb.addWorksheet('Vendas Ativas B2B-B2C');
  const headers = [
    'ID Contrato','Cliente','Vendedor','Plano','Segmento','Tipo Venda',
    'Valor Mensal','% Comissão','Valor Comissão','Status Comissão','Assinatura',
  ];
  const widths = [12,30,22,20,8,10,13,10,13,28,12];
  headers.forEach((h, i) => { ws.getColumn(i + 1).width = widths[i] ?? 14; });

  colHeaders(ws, 1, headers, C.navyDark);

  snapshots.forEach((s, idx) => {
    const pct = Number(s.percentual);
    dataRow(ws, idx + 2, [
      s.id_contrato,
      s.nome_cliente,
      s.nome_vendedor,
      s.plano,
      s.segmento,
      s.tipo_venda,
      `R$ ${Number(s.valor_mensal).toFixed(2).replace('.', ',')}`,
      pct > 0 ? `${(pct * 100).toFixed(0)}%` : '-',
      `R$ ${Number(s.valor_comissao).toFixed(2).replace('.', ',')}`,
      s.status_comissao,
      s.assinatura,
    ], {
      9: { fontArgb: s.status_comissao === 'Liberada' ? C.greenOk : C.red },
    });
  });
}

// ── Sheet 3: Alterações de Plano - BDR ───────────────────────────────────────
function buildSheet3(
  wb: ExcelJS.Workbook,
  commissions: Awaited<ReturnType<typeof prisma.commission.findMany>>,
) {
  const ws = wb.addWorksheet('Alterações de Plano - BDR');
  const headers = [
    'Data','ID Contrato','Cliente','Vendedor','Tipo',
    'Plano Atual','Plano Novo','Valor Atual','Valor Novo','Valor Comissão',
  ];
  const widths = [12,12,30,22,14,18,18,12,12,14];
  headers.forEach((h, i) => { ws.getColumn(i + 1).width = widths[i] ?? 14; });

  colHeaders(ws, 1, headers, C.navyDark);

  commissions.forEach((c, idx) => {
    dataRow(ws, idx + 2, [
      c.data_registro.toLocaleDateString('pt-BR'),
      c.id_contrato,
      c.nome_cliente,
      c.vendedor,
      c.tipo_negociacao,
      c.plano_atual ?? '-',
      c.plano_novo  ?? '-',
      `R$ ${Number(c.valor_atual).toFixed(2).replace('.', ',')}`,
      c.valor_novo ? `R$ ${Number(c.valor_novo).toFixed(2).replace('.', ',')}` : '-',
      `R$ ${Number(c.valor_comissao).toFixed(2).replace('.', ',')}`,
    ]);
  });
}

import ExcelJS from 'exceljs';
import { FonteGestao } from './diagnostico.gestao-fontes';

/// Gera PDF/Excel a partir de QUALQUER fonte do registry FONTES_GESTAO —
/// PDF reaproveita `blocos[].formatar()` de graça (mesmo texto usado no
/// prompt do CAIO), Excel usa `paraExcel()` quando a fonte declarar (nem
/// toda fonte tem dado genuinamente tabular, ver diagnostico.gestao-fontes.ts).

// Puppeteer 25+ só vem em ESM; o projeto é CommonJS (tsconfig
// module:"commonjs"), que faz o TS baixar `await import(...)` pra
// require() e quebra em runtime (ERR_REQUIRE_ESM). O truque com
// Function(...) esconde o import() da análise estática do TS, preservando
// o import dinâmico real do ESM (confirmado funcionando 2026-07-14).
const importDinamico = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>;

let browserPromise: Promise<any> | null = null;
/// Lança o Chromium 1x (lazy, na 1ª exportação) e mantém vivo pro resto do
/// processo — relançar a cada request seria lento e desperdiçado pra um
/// recurso de baixo volume (pedido manual via chat, não um endpoint quente).
function getBrowser(): Promise<any> {
  if (!browserPromise) {
    browserPromise = importDinamico('puppeteer').then((mod) =>
      mod.default.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] }),
    );
  }
  return browserPromise;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/// "nomeVendedor" -> "Nome Vendedor" — cabeçalho legível sem precisar de mapa
/// manual por campo (são dezenas de campos diferentes entre as 15 fontes).
/// Usado tanto no Excel quanto no PDF, pra ficar consistente entre os dois.
function humanizarChave(chave: string): string {
  return chave.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function formatarCelula(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (v instanceof Date) return v.toLocaleDateString('pt-BR');
  return String(v);
}

const TEMA_PDF = { bg: '#040507', surface: '#0b0d12', border: '#1e2330', text: '#f0f3ff', text2: '#8a99b8', text3: '#707c98', accent: '#00f0ff' };

/// Tabela de verdade (cabeçalho + linhas), não um dump de texto — o PDF
/// original reaproveitava só `blocos[].formatar()` (o texto que já ia pro
/// prompt do CAIO) dentro de um <pre>, o que ficava com "cara de print do
/// chat" (achado do usuário, 2026-07-14): sem estrutura visual nenhuma,
/// difícil de ler/apresentar. Reaproveita os mesmos dados de `paraExcel()`
/// (já tratados — ex: duração em "2h30min", não milissegundos cru), pra o
/// PDF e o Excel sempre mostrarem exatamente os mesmos números.
function renderizarTabelaHtml(linhas: Record<string, any>[]): string {
  if (!linhas.length) {
    return `<p style="color:${TEMA_PDF.text3};font-size:12px;">Sem dados disponíveis para este relatório no período consultado.</p>`;
  }
  const colunas = Object.keys(linhas[0]);
  // table-layout:fixed força a tabela a nunca passar de 100% da página — sem
  // isso (e sem os cabeçalhos/células em nowrap), o navegador media a
  // largura pelo CONTEÚDO (ex: nome longo) e a tabela vazava da página
  // impressa, cortando a última coluna (achado do usuário, 2026-07-14). Com
  // fixed, cada coluna divide a largura disponível e o texto quebra linha
  // em vez de estourar.
  const cabecalho = colunas.map((c) =>
    `<th style="padding:6px 8px;text-align:left;font-size:8px;color:${TEMA_PDF.text3};text-transform:uppercase;letter-spacing:.03em;border-bottom:2px solid ${TEMA_PDF.accent};overflow-wrap:break-word;">${escapeHtml(humanizarChave(c))}</th>`,
  ).join('');
  const corpo = linhas.map((linha, i) => {
    const bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.03)';
    const celulas = colunas.map((c) =>
      `<td style="padding:5px 8px;font-size:9px;color:${TEMA_PDF.text2};border-bottom:1px solid ${TEMA_PDF.border};overflow-wrap:break-word;word-break:break-word;">${escapeHtml(formatarCelula(linha[c]))}</td>`,
    ).join('');
    return `<tr style="background:${bg};">${celulas}</tr>`;
  }).join('');
  return `<table style="width:100%;table-layout:fixed;border-collapse:collapse;"><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table>`;
}

function montarHtmlRelatorio(fonte: FonteGestao, dados: any): string {
  const linhas = fonte.paraExcel?.(dados) ?? null;

  // Fonte com dado tabular (todas as 15 hoje) vira tabela de verdade —
  // fallback pro texto de blocos[] só pra fonte futura sem paraExcel ainda.
  const conteudoHtml = linhas
    ? `<section style="background:${TEMA_PDF.surface};border:1px solid ${TEMA_PDF.border};border-radius:8px;padding:16px 18px;">
         ${renderizarTabelaHtml(linhas)}
       </section>`
    : fonte.blocos.map((b) => `
        <section style="background:${TEMA_PDF.surface};border:1px solid ${TEMA_PDF.border};border-radius:8px;padding:18px 22px;margin-bottom:16px;">
          <h2 style="margin:0 0 12px;font-size:13px;color:${TEMA_PDF.accent};text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(b.titulo)}</h2>
          <pre style="margin:0;font-family:'Courier New',monospace;font-size:11px;line-height:1.6;color:${TEMA_PDF.text2};white-space:pre-wrap;word-break:break-word;">${escapeHtml(b.formatar(dados))}</pre>
        </section>
      `).join('');

  const titulo = fonte.blocos[0]?.titulo ?? String(fonte.chave);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:28px;background:${TEMA_PDF.bg};font-family:'Segoe UI',Arial,sans-serif;">
  <div style="border-bottom:2px solid ${TEMA_PDF.accent};padding-bottom:14px;margin-bottom:18px;">
    <p style="margin:0;font-size:10px;color:${TEMA_PDF.accent};letter-spacing:.12em;text-transform:uppercase;font-weight:700;">Canaã Performance — Relatório gerado por C.A.I.O.</p>
    <h1 style="margin:6px 0 0;font-size:15px;color:${TEMA_PDF.text};font-weight:700;">${escapeHtml(titulo)}</h1>
    <p style="margin:4px 0 0;font-size:10px;color:${TEMA_PDF.text3};">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
  </div>
  ${conteudoHtml}
</body></html>`;
}

export async function gerarPdfFonte(fonte: FonteGestao, dados: any): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(montarHtmlRelatorio(fonte, dados), { waitUntil: 'networkidle0' });
    // Paisagem: a maioria das fontes tem tabela larga (6-10 colunas, ex:
    // jornada) — retrato cortaria/espremeria demais.
    const pdf = await page.pdf({
      format: 'A4', landscape: true, printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

const COR_CABECALHO = 'FF0B0D12';
const COR_BORDA = 'FFD0D7E0';

/// null = fonte não declarou `paraExcel` (não é exportável em planilha,
/// controller trata como "formato indisponível pra essa fonte").
export async function gerarExcelFonte(fonte: FonteGestao, dados: any): Promise<Buffer | null> {
  if (!fonte.paraExcel) return null;
  const linhas = fonte.paraExcel(dados);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Canaã Performance — C.A.I.O.';
  wb.created = new Date();
  const ws = wb.addWorksheet(String(fonte.chave).slice(0, 31));

  if (!linhas.length) {
    ws.getCell(1, 1).value = 'Sem dados disponíveis para este relatório no período consultado.';
    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  const colunas = Object.keys(linhas[0]);
  ws.columns = colunas.map((c) => ({ header: humanizarChave(c), key: c, width: Math.max(14, c.length + 4) }));

  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 22;

  const bordaFina = { style: 'thin' as const, color: { argb: COR_BORDA } };
  for (const linha of linhas) {
    const row = ws.addRow(linha);
    row.eachCell((cell) => {
      cell.border = { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina };
    });
  }

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

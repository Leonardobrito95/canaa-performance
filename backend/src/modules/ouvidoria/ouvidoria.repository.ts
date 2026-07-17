import { RowDataPacket } from 'mysql2';
import pool from '../../config/mysql';
import {
  CategoriaReclamacao,
  VolumePorCategoria,
  ReclamacaoPorDesfecho,
  CruzamentoInadimplencia,
  CruzamentoRetencao,
  OuvidoriaFiltros,
} from './ouvidoria.types';

// ids reais de su_oss_assunto, validados em produção IXC em 2026-07-16.
// "reclamacao" soma dois ids com o mesmo nome "04 - Reclamação" (220 e 304).
const ASSUNTO_IDS: Record<CategoriaReclamacao, number[]> = {
  reclamacao: [220, 304],
  reclamacao_interna: [197],
  reclame_aqui: [195],
  anatel: [193],
  elogio: [221],
};

// exclui "elogio" de propósito — é contraponto positivo, não entra em desfecho
// nem em cruzamento de inadimplência/retenção.
const IDS_RECLAMACAO_NEGATIVA = [
  ...ASSUNTO_IDS.reclamacao,
  ...ASSUNTO_IDS.reclamacao_interna,
  ...ASSUNTO_IDS.reclame_aqui,
  ...ASSUNTO_IDS.anatel,
];

// mesmo critério usado em retencao.repository.ts para identificar uma O.S. de retenção
const ID_ASSUNTO_RETENCAO = 348;

function condicoesData(filtros: OuvidoriaFiltros, coluna: string, conditions: string[], params: unknown[]) {
  if (filtros.dateFrom) {
    conditions.push(`${coluna} >= ?`);
    params.push(filtros.dateFrom + ' 00:00:00');
  }
  if (filtros.dateTo) {
    conditions.push(`${coluna} <= ?`);
    params.push(filtros.dateTo + ' 23:59:59');
  }
}

export async function buscarVolumePorCategoria(filtros: OuvidoriaFiltros): Promise<VolumePorCategoria[]> {
  const todosIds = Object.values(ASSUNTO_IDS).flat();
  const conditions: string[] = [`id_assunto IN (${todosIds.map(() => '?').join(',')})`];
  const params: unknown[] = [...todosIds];
  condicoesData(filtros, 'data_abertura', conditions, params);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id_assunto, COUNT(*) as qtd
     FROM su_oss_chamado
     WHERE ${conditions.join(' AND ')}
     GROUP BY id_assunto`,
    params,
  );

  return (Object.entries(ASSUNTO_IDS) as [CategoriaReclamacao, number[]][]).map(([categoria, ids]) => ({
    categoria,
    qtd: rows
      .filter((r) => ids.includes(Number(r.id_assunto)))
      .reduce((soma, r) => soma + Number(r.qtd), 0),
  }));
}

export async function buscarDesfechoPorCategoria(filtros: OuvidoriaFiltros): Promise<ReclamacaoPorDesfecho[]> {
  const conditions: string[] = [`c.id_assunto IN (${IDS_RECLAMACAO_NEGATIVA.map(() => '?').join(',')})`];
  const params: unknown[] = [...IDS_RECLAMACAO_NEGATIVA];
  condicoesData(filtros, 'c.data_abertura', conditions, params);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ct.status, COUNT(DISTINCT c.id) as qtd
     FROM su_oss_chamado c
     JOIN cliente_contrato ct ON ct.id = c.id_contrato_kit
     WHERE ${conditions.join(' AND ')}
     GROUP BY ct.status`,
    params,
  );

  const mapaDesfecho: Record<string, ReclamacaoPorDesfecho['desfecho']> = { A: 'cliente_ativo', I: 'cliente_cancelado' };
  const soma: Record<ReclamacaoPorDesfecho['desfecho'], number> = { cliente_ativo: 0, cliente_cancelado: 0, outro: 0 };
  for (const row of rows) {
    const desfecho = mapaDesfecho[String(row.status)] ?? 'outro';
    soma[desfecho] += Number(row.qtd);
  }
  return (Object.keys(soma) as ReclamacaoPorDesfecho['desfecho'][]).map((desfecho) => ({ desfecho, qtd: soma[desfecho] }));
}

export async function buscarCruzamentoInadimplencia(filtros: OuvidoriaFiltros): Promise<CruzamentoInadimplencia> {
  const conditions: string[] = [`c.id_assunto IN (${IDS_RECLAMACAO_NEGATIVA.map(() => '?').join(',')})`];
  const params: unknown[] = [...IDS_RECLAMACAO_NEGATIVA];
  condicoesData(filtros, 'c.data_abertura', conditions, params);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(DISTINCT c.id_cliente) as totalClientesReclamaram,
       COUNT(DISTINCT CASE WHEN r.id IS NOT NULL THEN c.id_cliente END) as qtdTambemInadimplentes
     FROM su_oss_chamado c
     LEFT JOIN fn_areceber r ON r.id_cliente = c.id_cliente AND r.status = 'A'
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  const totalClientesReclamaram = Number(rows[0].totalClientesReclamaram);
  const qtdTambemInadimplentes = Number(rows[0].qtdTambemInadimplentes);
  return {
    totalClientesReclamaram,
    qtdTambemInadimplentes,
    percentualInadimplentes: totalClientesReclamaram > 0 ? (qtdTambemInadimplentes / totalClientesReclamaram) * 100 : 0,
  };
}

// negociacaoConfirmadaPelaAuditoria fica sempre null aqui: depende de cruzar o id da
// O.S. de retenção encontrada com a tabela Postgres retencaoAuditoria (Prisma), o que
// exige uma segunda consulta cross-database ainda não implementada. Ver comentário em
// ouvidoria.types.ts.
export async function buscarCruzamentoRetencao(filtros: OuvidoriaFiltros): Promise<CruzamentoRetencao[]> {
  const conditions: string[] = [`c.id_assunto IN (${IDS_RECLAMACAO_NEGATIVA.map(() => '?').join(',')})`];
  const whereParams: unknown[] = [...IDS_RECLAMACAO_NEGATIVA];
  condicoesData(filtros, 'c.data_abertura', conditions, whereParams);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       c.id as idChamado,
       EXISTS (
         SELECT 1 FROM su_oss_chamado r
         WHERE r.id_cliente = c.id_cliente AND r.id_assunto = ?
       ) as entrouEmFluxoRetencao
     FROM su_oss_chamado c
     WHERE ${conditions.join(' AND ')}`,
    [ID_ASSUNTO_RETENCAO, ...whereParams],
  );

  return rows.map((r) => ({
    idChamado: String(r.idChamado),
    entrouEmFluxoRetencao: Boolean(r.entrouEmFluxoRetencao),
    negociacaoConfirmadaPelaAuditoria: null,
  }));
}

import pool from '../../config/mysql';
import { RowDataPacket } from 'mysql2';
import prisma from '../../config/prisma';

// ── Operadoras autorizadas no módulo de Retenção ─────────────────────────────
export const OPERADORES_CS = (process.env.RETENCAO_OPERADORES_CS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

// ── Mapeamento de IDs de diagnóstico ─────────────────────────────────────────
// Fonte: planilha "ID DIAGNOSTICO.xlsx"

export const RETIDO_IDS = [
  20, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32,
  33, 34, 35, 58, 94, 316, 318, 320, 322, 324, 326,
];

export const NAO_RETIDO_IDS = [
  37, 38, 39, 40, 41, 42, 43, 44, 46, 47, 48, 49,
  50, 51, 52, 56, 57, 59, 319, 321, 323, 325, 327,
];

// ── Comissão por faixa ────────────────────────────────────────────────────────
export function getComissaoRetencao(qtdRetidas: number): number {
  if (qtdRetidas >= 110) return 750;
  if (qtdRetidas >= 90)  return 550;
  if (qtdRetidas >= 70)  return 400;
  return 0;
}

export function getFaixaRetencao(qtdRetidas: number): string {
  if (qtdRetidas >= 110) return '110+ retenções — R$ 750';
  if (qtdRetidas >= 90)  return '90+ retenções — R$ 550';
  if (qtdRetidas >= 70)  return '70+ retenções — R$ 400';
  return 'Abaixo da meta (mín. 70)';
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RetencaoRecord {
  nome_operador:   string;
  qtd_tratadas:    number;
  qtd_retidas:     number;
  qtd_nao_retidas: number;
  pct_reversao:    number;  // 0–100
  comissao:        number;
  faixa:           string;
}

export interface NegociacaoData {
  valor_original:  number;
  valor_negociado: number;
  descricao:       string | null;
  registrado_por:  string;
  data_registro:   string;
}

export interface RetencaoDetalhe {
  id_chamado:       string;
  data_abertura:    string;
  nome_operador:    string;
  nome_cliente:     string;
  valor_mensal:     number;
  id_diagnostico:   number | null;
  desc_diagnostico: string;
  resultado:        'RETIDO' | 'NAO_RETIDO' | 'PENDENTE';
  negociacao:       NegociacaoData | null;
}

export interface NegociacaoInput {
  id_chamado:      string;
  valor_original:  number;
  valor_negociado: number;
  descricao:       string | null;
  registrado_por:  string;
}

export interface RetencaoFilters {
  dateFrom?:    string;
  dateTo?:      string;
  operadorNome?: string;
}

// ── Query principal ───────────────────────────────────────────────────────────

export async function fetchRetencao(filters: RetencaoFilters): Promise<RetencaoRecord[]> {
  const conditions: string[] = ["id_assunto = '348'"];
  const params: unknown[] = [];

  if (filters.dateFrom) {
    conditions.push('data_abertura >= ?');
    params.push(filters.dateFrom + ' 00:00:00');
  }
  if (filters.dateTo) {
    conditions.push('data_abertura <= ?');
    params.push(filters.dateTo + ' 23:59:59');
  }
  if (filters.operadorNome) {
    conditions.push('id_atendente LIKE ?');
    params.push(`%${filters.operadorNome}%`);
  }

  // Restringe apenas às operadoras autorizadas
  const placeholders = OPERADORES_CS.map(() => '?').join(', ');
  conditions.push(`id_atendente IN (${placeholders})`);
  params.push(...OPERADORES_CS);

  const retidoList    = RETIDO_IDS.join(',');
  const naoRetidoList = NAO_RETIDO_IDS.join(',');

  // id_su_diagnostico está na própria tabela su_oss_chamado
  // id_atendente já contém o nome do operador (string)
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(CONVERT(id_atendente USING utf8mb4), CONCAT('Técnico #', id_tecnico)) AS nome_operador,
       COUNT(*)                                                  AS qtd_tratadas,
       COUNT(CASE WHEN id_su_diagnostico IN (${retidoList})     THEN 1 END) AS qtd_retidas,
       COUNT(CASE WHEN id_su_diagnostico IN (${naoRetidoList})  THEN 1 END) AS qtd_nao_retidas
     FROM su_oss_chamado
     WHERE ${conditions.join(' AND ')}
     GROUP BY id_atendente, id_tecnico
     ORDER BY qtd_retidas DESC`,
    params as any[]
  );

  return rows.map((r) => {
    const qtdTratadas   = Number(r.qtd_tratadas)    || 0;
    const qtdRetidas    = Number(r.qtd_retidas)     || 0;
    const qtdNaoRetidas = Number(r.qtd_nao_retidas) || 0;
    const pctReversao   = qtdTratadas > 0 ? (qtdRetidas / qtdTratadas) * 100 : 0;

    return {
      nome_operador:   String(r.nome_operador),
      qtd_tratadas:    qtdTratadas,
      qtd_retidas:     qtdRetidas,
      qtd_nao_retidas: qtdNaoRetidas,
      pct_reversao:    Math.round(pctReversao * 10) / 10,
      comissao:        getComissaoRetencao(qtdRetidas),
      faixa:           getFaixaRetencao(qtdRetidas),
    };
  });
}

// ── Detalhe por chamado ───────────────────────────────────────────────────────

export async function fetchRetencaoDetalhe(filters: RetencaoFilters): Promise<RetencaoDetalhe[]> {
  const conditions: string[] = ["c.id_assunto = '348'"];
  const params: unknown[] = [];

  if (filters.dateFrom) {
    conditions.push('c.data_abertura >= ?');
    params.push(filters.dateFrom + ' 00:00:00');
  }
  if (filters.dateTo) {
    conditions.push('c.data_abertura <= ?');
    params.push(filters.dateTo + ' 23:59:59');
  }
  if (filters.operadorNome) {
    conditions.push('c.id_atendente LIKE ?');
    params.push(`%${filters.operadorNome}%`);
  }

  // Restringe apenas às operadoras autorizadas
  const placeholders = OPERADORES_CS.map(() => '?').join(', ');
  conditions.push(`c.id_atendente IN (${placeholders})`);
  params.push(...OPERADORES_CS);

  const retidoList    = RETIDO_IDS.join(',');
  const naoRetidoList = NAO_RETIDO_IDS.join(',');

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       c.id                                                                              AS id_chamado,
       c.data_abertura,
       COALESCE(CONVERT(c.id_atendente USING utf8mb4), CONCAT('Técnico #', c.id_tecnico)) AS nome_operador,
       COALESCE(CONVERT(cl.razao      USING utf8mb4), '')                                AS nome_cliente,
       COALESCE(
         (SELECT SUM(vv.valorTotalLiquido)
          FROM view_valor_produtos_contrato_composicao vv
          INNER JOIN cliente_contrato cc ON cc.id = vv.cliente_contrato_id AND cc.status = 'A'
          WHERE vv.cliente_id = c.id_cliente),
         0
       )                                                                                 AS valor_mensal,
       c.id_su_diagnostico,
       CASE
         WHEN c.id_su_diagnostico IN (${retidoList})    THEN 'RETIDO'
         WHEN c.id_su_diagnostico IN (${naoRetidoList}) THEN 'NAO_RETIDO'
         ELSE 'PENDENTE'
       END AS resultado
     FROM su_oss_chamado c
     LEFT JOIN cliente cl ON cl.id = c.id_cliente
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.data_abertura DESC
     LIMIT 2000`,
    params as any[]
  );

  const chamadoIds = rows.map((r) => String(r.id_chamado));

  // Busca negociações registradas no Postgres (apenas para os IDs retornados)
  const negociacoes = chamadoIds.length
    ? await prisma.retencaoNegociacao.findMany({
        where: { id_chamado: { in: chamadoIds } },
      })
    : [];

  const negMap = new Map(negociacoes.map((n) => [n.id_chamado, n]));

  return rows.map((r) => {
    const idChamado = String(r.id_chamado);
    const neg = negMap.get(idChamado) ?? null;

    return {
      id_chamado:       idChamado,
      data_abertura:    r.data_abertura instanceof Date
                          ? r.data_abertura.toISOString()
                          : String(r.data_abertura ?? ''),
      nome_operador:    String(r.nome_operador),
      nome_cliente:     String(r.nome_cliente ?? ''),
      valor_mensal:     parseFloat(r.valor_mensal ?? 0),
      id_diagnostico:   r.id_su_diagnostico != null ? Number(r.id_su_diagnostico) : null,
      desc_diagnostico: '',
      resultado:        (r.resultado as 'RETIDO' | 'NAO_RETIDO' | 'PENDENTE') ?? 'PENDENTE',
      negociacao:       neg
        ? {
            valor_original:  parseFloat(neg.valor_original.toString()),
            valor_negociado: parseFloat(neg.valor_negociado.toString()),
            descricao:       neg.descricao ?? null,
            registrado_por:  neg.registrado_por,
            data_registro:   neg.data_registro.toISOString(),
          }
        : null,
    };
  });
}

// ── Negociações (PostgreSQL) ──────────────────────────────────────────────────

export async function upsertNegociacao(input: NegociacaoInput): Promise<NegociacaoData> {
  const result = await prisma.retencaoNegociacao.upsert({
    where:  { id_chamado: input.id_chamado },
    create: {
      id_chamado:      input.id_chamado,
      valor_original:  input.valor_original,
      valor_negociado: input.valor_negociado,
      descricao:       input.descricao,
      registrado_por:  input.registrado_por,
    },
    update: {
      valor_original:  input.valor_original,
      valor_negociado: input.valor_negociado,
      descricao:       input.descricao,
      registrado_por:  input.registrado_por,
    },
  });

  return {
    valor_original:  parseFloat(result.valor_original.toString()),
    valor_negociado: parseFloat(result.valor_negociado.toString()),
    descricao:       result.descricao ?? null,
    registrado_por:  result.registrado_por,
    data_registro:   result.data_registro.toISOString(),
  };
}

export async function deleteNegociacao(idChamado: string): Promise<void> {
  await prisma.retencaoNegociacao.deleteMany({ where: { id_chamado: idChamado } });
}

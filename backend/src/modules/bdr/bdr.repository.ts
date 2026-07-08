import pool from '../../config/mysql';
import prisma from '../../config/prisma';
import ixcApi from '../../config/ixcApi';
import { RowDataPacket } from 'mysql2';
import { Decimal } from '@prisma/client/runtime/library';

export interface ContractData {
  id_contrato: string;
  nome_cliente: string;
  plano_atual: string;
  valor_atual: number;
}

export interface CreateCommissionDTO {
  id_contrato: string;
  nome_cliente: string;
  vendedor: string;
  tipo_negociacao: 'Upgrade' | 'Downgrade' | 'Refidelizacao';
  plano_atual?: string;
  plano_novo?: string;
  valor_atual: number;
  valor_novo?: number;
  valor_comissao: number;
  criado_por?: string;
}

const BDR_GROUPS = [110, 134];
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

let consultantsCache: { names: string[]; expiresAt: number } | null = null;
let plansCache: { names: string[]; expiresAt: number } | null = null;

/** Invalida o cache de consultores, forçando nova busca no próximo acesso. */
export function clearConsultantsCache(): void {
  consultantsCache = null;
}

/**
 * Busca consultores BDR na API do IXC (grupos 110 e 134).
 * Resultado em cache por 5 minutos para evitar chamadas repetidas.
 */
export async function fetchConsultantsFromIXC(): Promise<string[]> {
  if (consultantsCache && Date.now() < consultantsCache.expiresAt) {
    return consultantsCache.names;
  }

  const requests = BDR_GROUPS.map((groupId) =>
    ixcApi.get('/webservice/v1/usuarios', {
      headers: { ixcsoft: 'listar' },
      data: {
        qtype: 'usuarios.id_grupo',
        query: String(groupId),
        oper: '=',
        page: '1',
        rp: '200',
        sortname: 'usuarios.nome',
        sortorder: 'asc',
      },
    })
  );

  const responses = await Promise.all(requests);

  const names = new Set<string>();
  for (const res of responses) {
    const records: Array<{ nome: string; status: string }> = res.data?.registros ?? [];
    for (const user of records) {
      if (user.nome && user.status === 'A') {
        names.add(user.nome);
      }
    }
  }

  const sorted = Array.from(names).sort();
  consultantsCache = { names: sorted, expiresAt: Date.now() + CACHE_TTL_MS };
  return sorted;
}

/**
 * Busca planos distintos ativos no MariaDB do IXC.
 * Resultado em cache por 5 minutos.
 */
export async function fetchPlansFromDB(): Promise<string[]> {
  if (plansCache && Date.now() < plansCache.expiresAt) {
    return plansCache.names;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT TRIM(contrato) AS nome
     FROM cliente_contrato
     WHERE status = 'A' AND contrato IS NOT NULL AND TRIM(contrato) != ''
     ORDER BY contrato`
  );

  const names = (rows as Array<{ nome: string }>).map((r) => r.nome).filter(Boolean);
  plansCache = { names, expiresAt: Date.now() + CACHE_TTL_MS };
  return names;
}

/**
 * Busca contrato no MariaDB do ERP IXC (somente leitura).
 */
export async function findContractById(id_contrato: string): Promise<ContractData | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       cc.id                       AS id_contrato,
       c.razao                     AS nome_cliente,
       MIN(cc.contrato)            AS plano_atual,
       SUM(v.valorTotalLiquido)    AS valor_atual
     FROM cliente_contrato cc
     INNER JOIN cliente c ON c.id = cc.id_cliente
     INNER JOIN view_valor_produtos_contrato_composicao v ON v.cliente_contrato_id = cc.id
     WHERE cc.id = ?
       AND cc.status = 'A'
     GROUP BY cc.id, c.razao
     LIMIT 1`,
    [id_contrato]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id_contrato: String(row.id_contrato),
    nome_cliente: String(row.nome_cliente),
    plano_atual:  String(row.plano_atual ?? ''),
    valor_atual:  parseFloat(row.valor_atual),
  };
}

/**
 * Persiste o registro de comissão no PostgreSQL.
 */
export async function createCommission(data: CreateCommissionDTO) {
  return prisma.commission.create({
    data: {
      id_contrato:     data.id_contrato,
      nome_cliente:    data.nome_cliente,
      vendedor:        data.vendedor,
      tipo_negociacao: data.tipo_negociacao,
      plano_atual:     data.plano_atual ?? null,
      plano_novo:      data.plano_novo  ?? null,
      valor_atual:     new Decimal(data.valor_atual),
      valor_novo:      data.valor_novo != null ? new Decimal(data.valor_novo) : null,
      valor_comissao:  new Decimal(data.valor_comissao),
      criado_por:      data.criado_por ?? null,
    },
  });
}

export interface ListCommissionsFilter {
  vendedor?:  string;
  dateFrom?:  string; // YYYY-MM-DD
  dateTo?:    string; // YYYY-MM-DD
  cursor?:    string; // UUID do último registro retornado
  take?:      number; // padrão 200
}

/**
 * Verifica se já existe registro do mesmo tipo para o contrato no mês corrente.
 */
export async function findDuplicateCommission(
  id_contrato: string,
  tipo_negociacao: 'Upgrade' | 'Downgrade' | 'Refidelizacao',
) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return prisma.commission.findFirst({
    where: {
      id_contrato,
      tipo_negociacao,
      data_registro: { gte: start, lt: end },
    },
    select: { id: true, data_registro: true },
  });
}

/**
 * Lista comissões com filtros server-side e cursor-based pagination.
 * Consultores veem apenas as próprias; gestores veem todas.
 */
export async function listCommissions(filter: ListCommissionsFilter = {}) {
  const { vendedor, dateFrom, dateTo, cursor, take = 200 } = filter;

  return prisma.commission.findMany({
    where: {
      ...(vendedor ? { vendedor } : {}),
      ...(dateFrom || dateTo ? {
        data_registro: {
          ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
          ...(dateTo   ? { lte: new Date(`${dateTo}T23:59:59`)   } : {}),
        },
      } : {}),
    },
    orderBy: { data_registro: 'desc' },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
}

// ── Adjustments ───────────────────────────────────────────────────────────────

export interface CreateAdjustmentDTO {
  vendedor:       string;
  descricao:      string;
  valor:          number;
  registrado_por: string;
}

export async function createAdjustment(data: CreateAdjustmentDTO) {
  return prisma.adjustment.create({
    data: {
      vendedor:       data.vendedor,
      descricao:      data.descricao,
      valor:          new Decimal(data.valor),
      registrado_por: data.registrado_por,
    },
  });
}

export async function listAdjustments(vendedor?: string) {
  return prisma.adjustment.findMany({
    where: {
      deletado_em: null,
      ...(vendedor ? { vendedor } : {}),
    },
    orderBy: { data_registro: 'desc' },
  });
}

export async function deleteAdjustment(id: string, deletado_por: string) {
  return prisma.adjustment.update({
    where: { id },
    data: { deletado_por, deletado_em: new Date() },
  });
}

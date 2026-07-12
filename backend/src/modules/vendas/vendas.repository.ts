import pool from '../../config/mysql';
import { RowDataPacket } from 'mysql2';
import { getZapSignMap } from './zapsign.service';
import { getGovSignSet } from './govsign.service';
import { getFisicoSet } from './fisico.service';
import { getFinanceiroSet } from './financeiro.service';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContractRecord {
  id_contrato: string;
  id_cliente: string;
  nome_cliente: string;
  plano: string;
  data_ativacao: string;
  status_contrato: string;
  status_internet: string;
  valor_mensal: number;
  nome_vendedor: string;
  tipo_venda: string;          // EXTERNO | INTERNO
  segmento: string;            // B2C | B2B
  cortesia: string;            // SIM | NÃO
  vencimento: string;
  assinatura_zapsign: string;  // raw API status or "Sem Contrato"
  status_comissao: string;
  motivo_bloqueio: string | null;
  comissao: number;
}

export interface ContractFilters {
  dateFrom?: string;
  dateTo?: string;
  vendedorNome?: string;
}

// ── Contracts (Vendas Dashboard + Comissão Vendas) ────────────────────────────

export async function fetchContracts(filters: ContractFilters): Promise<ContractRecord[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.dateFrom) {
    conditions.push('v.cliente_contrato_data_ativacao >= ?');
    params.push(filters.dateFrom + ' 00:00:00');
  }
  if (filters.dateTo) {
    conditions.push('v.cliente_contrato_data_ativacao <= ?');
    params.push(filters.dateTo + ' 23:59:59');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
        v.cliente_contrato_id                       AS id_contrato,
        MIN(v.cliente_id)                           AS id_cliente,
        MIN(v.cliente_razao)                        AS nome_cliente,
        MIN(v.cliente_contrato_contrato)            AS plano,
        MIN(v.cliente_contrato_data_ativacao)       AS data_ativacao,
        MIN(v.cliente_contrato_status)              AS status_contrato,
        MIN(v.cliente_contrato_status_internet)     AS status_internet,
        SUM(v.valorTotalLiquido)                    AS valor_mensal,
        MIN(vend.nome)                              AS nome_vendedor_raw,
        MIN(cc.id_carteira_cobranca)                AS id_carteira_cobranca,
        MIN(cc.id_tipo_contrato)                    AS id_tipo_contrato,
        MIN(ct.tipo_contrato)                       AS tipo_contrato_str,
        MIN(adh.status)                             AS status_assinatura_ixc
     FROM view_valor_produtos_contrato_composicao v
     LEFT JOIN cliente_contrato cc         ON cc.id = v.cliente_contrato_id
     LEFT JOIN vendedor vend               ON vend.id = cc.id_vendedor
     LEFT JOIN cliente_contrato_tipo ct    ON ct.id = cc.id_tipo_contrato
     LEFT JOIN (
       SELECT h.id_contrato, h.status
       FROM assinatura_digital_historico h
       INNER JOIN (
         SELECT id_contrato, MAX(id) AS max_id
         FROM assinatura_digital_historico
         GROUP BY id_contrato
       ) ultimo ON ultimo.id_contrato = h.id_contrato AND ultimo.max_id = h.id
     ) adh ON adh.id_contrato = v.cliente_contrato_id
     ${where}
     GROUP BY v.cliente_contrato_id
     ORDER BY MIN(v.cliente_contrato_data_ativacao) DESC
     LIMIT 3000`,
    params as any[]
  );

  const [zapMap, govSet, fisicoSet, financeiroSet] = await Promise.all([
    getZapSignMap(),
    getGovSignSet(),
    getFisicoSet(),
    getFinanceiroSet(),
  ]);

  return rows
    .map((row) => enrichContract(row, zapMap, govSet, fisicoSet, financeiroSet))
    .filter((c) => c.nome_vendedor !== 'Central de Relacionamento')
    .filter((c) => {
      if (!filters.vendedorNome) return true;
      if (!c.nome_vendedor) return false;
      const vend  = c.nome_vendedor.toLowerCase();
      const filtro = filters.vendedorNome.toLowerCase();
      // Cobre tanto "MARIA SILVA".includes("MARIA SILVA - EXTERNO")
      // quanto o caso inverso onde o vendedor tem nome abreviado no IXC:
      // ex: vendedor = "MARIA", usuário = "MARIA SILVA"
      return vend.includes(filtro) || filtro.includes(vend);
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Retorna o percentual de comissão com base no nome do plano.
 * (Não se aplica a PLANTÃO — nesses casos usa-se 50% fixo sobre o valor mensal.)
 *   >= 900 Mbps (ou Giga)  → 20%
 *   >= 700 Mbps            → 18%
 *   >= 500 Mbps            → 15%
 *   Não mapeado            →  0%
 */
function getComissaoPercentual(plano: string): number {
  const upper = plano.toUpperCase();

  // Planos com "GIGA" (≥ 1000 Mbps) — inclui "1G", "2G", "GB", "GIGA"
  if (/\d*\s*GIGA|\d+\s*GB?\b/.test(upper)) return 0.20;

  // Extrai valor numérico seguido de mega/mb/mbps ou apenas o número isolado
  const match = upper.match(/(\d+)\s*(MEGA|MEGAS|MB|MBPS)?/);
  if (match) {
    const mbps = parseInt(match[1], 10);
    if (mbps >= 900) return 0.20;
    if (mbps >= 700) return 0.18;
    if (mbps >= 500) return 0.15;
  }

  return 0;
}

function enrichContract(
  row:           RowDataPacket,
  zapMap:        Map<string, string>,
  govSet:        Set<string>,
  fisicoSet:     Set<string>,
  financeiroSet: Set<string>,
): ContractRecord {
  const raw      = row.nome_vendedor_raw ? String(row.nome_vendedor_raw) : '';
  const dashIdx  = raw.indexOf(' - ');
  const nomeVend = dashIdx >= 0 ? raw.substring(0, dashIdx).trim() : raw.trim();
  const tipoRaw  = dashIdx >= 0 ? raw.substring(dashIdx + 3).trim().toUpperCase() : '';
  const tipoVenda = tipoRaw
    ? tipoRaw.replace('EXTERNA', 'EXTERNO').replace('INTERNA', 'INTERNO')
    : 'INTERNO';

  const plano    = String(row.plano ?? '').toUpperCase();
  const segmento =
    plano.includes('DEDICAD')    ||   // "Dedicada" e "Dedicado"
    plano.includes('CORPORATE')  ||   // "Link Corporate" e similares
    plano.includes('EMPRESARIAL') ||  // planos Empresarial
    (plano.includes('CORPORATIV') && !plano.includes('VAREJO'))  // "Corporativo" puro, não Varejo
      ? 'B2B' : 'B2C';

  const cortesia =
    Number(row.id_carteira_cobranca) === 4 || Number(row.id_tipo_contrato) === 11
      ? 'SIM' : 'NÃO';

  const vencMatch  = String(row.tipo_contrato_str ?? '').match(/DIA\s+(\d+)/i);
  const vencimento = vencMatch ? vencMatch[1] : '0';

  const idContrato     = String(row.id_contrato);
  const zapStatus      = zapMap.get(idContrato) ?? 'Sem Contrato';
  const isGovSigned    = govSet.has(idContrato);
  const isFisicoSigned = fisicoSet.has(idContrato);
  const temFinanceiro  = financeiroSet.has(idContrato);
  const statusContrato = String(row.status_contrato ?? '');

  // IXC Assina (substituiu o ZapSign a partir de 01/07/2026): o status real do
  // envio de assinatura fica em assinatura_digital_historico.status (enum
  // 'P','A','S','C'), pegando o registro mais recente por id_contrato — SÓ 'A'
  // (Assinado) conta como concluído. cliente_contrato.assinatura_digital ('S'/
  // 'N'/'P') NÃO é confiável pra isso: é uma flag de configuração do contrato
  // (usa ou não assinatura digital), não o status da assinatura em si — 'S' lá
  // aparece mesmo com o envio ainda pendente ('P' no histórico), o que fazia
  // liberar comissão de contrato ainda não assinado de verdade.
  const isIxcAssinaSigned = String(row.status_assinatura_ixc ?? '').toUpperCase() === 'A';

  // Considera assinado se: ZapSign signed  OU  IXC Assina  OU  GOV  OU  Físico
  const assinaturaOk = zapStatus === 'signed' || isIxcAssinaSigned || isGovSigned || isFisicoSigned;

  // Valor exibido no campo assinatura_zapsign
  const assinaturaDisplay =
    zapStatus === 'signed'  ? zapStatus :
    isIxcAssinaSigned       ? 'ixc_assina' :
    isGovSigned             ? 'gov'     :
    isFisicoSigned          ? 'fisico'  :
    zapStatus;

  let statusComissao: string;
  let motivoBloqueio: string | null = null;

  if (!assinaturaOk) {
    if (zapStatus === 'Sem Contrato') {
      statusComissao = 'Bloqueada — sem assinatura';
      motivoBloqueio = 'Assinatura ausente';
    } else {
      statusComissao = 'Bloqueada — assinatura pendente';
      motivoBloqueio = 'Assinatura não concluída';
    }
  } else if (statusContrato !== 'A') {
    statusComissao = 'Pendente — contrato inativo';
    motivoBloqueio = 'Contrato inativo';
  } else if (!temFinanceiro) {
    statusComissao = 'Bloqueada — aguardando pagamento';
    motivoBloqueio = 'Primeiro boleto não recebido';
  } else {
    statusComissao = 'Liberada';
  }

  const valorMensal = parseFloat(row.valor_mensal ?? 0);
  const percentual  = statusComissao === 'Liberada'
    ? (tipoVenda === 'PLANTÃO' ? 0.50 : getComissaoPercentual(String(row.plano ?? '')))
    : 0;
  const comissao    = valorMensal * percentual;

  return {
    id_contrato:        idContrato,
    id_cliente:         String(row.id_cliente ?? ''),
    nome_cliente:       String(row.nome_cliente ?? ''),
    plano:              String(row.plano ?? ''),
    data_ativacao:      formatDate(row.data_ativacao),
    status_contrato:    statusContrato,
    status_internet:    String(row.status_internet ?? ''),
    valor_mensal:       valorMensal,
    nome_vendedor:      nomeVend,
    tipo_venda:         tipoVenda,
    segmento,
    cortesia,
    vencimento,
    assinatura_zapsign: assinaturaDisplay,
    status_comissao:    statusComissao,
    motivo_bloqueio:    motivoBloqueio,
    comissao,
  };
}

function formatDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}

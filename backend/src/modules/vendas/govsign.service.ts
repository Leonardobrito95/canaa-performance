import pool from '../../config/mysql';
import logger from '../../config/logger';
import { RowDataPacket } from 'mysql2';

/**
 * Serviço de Assinatura GOV (IXC)
 * ─────────────────────────────────────────────────────────────────────────────
 * Alguns clientes assinam o contrato via certificado digital GOV em vez do
 * ZapSign. O arquivo deve ser salvo no IXC com o nome no padrão:
 *
 *   {id_contrato}-GOV          →  ex.: "44925-GOV" ou "44925-GOV.pdf"
 *
 * Isso permite identificar exatamente qual contrato foi assinado, sem depender
 * de JOIN por id_cliente (que falha quando o cliente tem múltiplos contratos).
 *
 * Estratégia de matching:
 *   - Busca em cliente_arquivos todos os arquivos cujo nome começa com dígitos
 *     seguidos de "-GOV" (case-insensitive): REGEXP '^[0-9]+-[Gg][Oo][Vv]'
 *   - Extrai o id_contrato com SUBSTRING_INDEX(nome_arquivo, '-', 1)
 *   - Sem JOIN, sem janela de datas — matching exato pelo ID no nome.
 *
 * Mantém um Set<id_contrato> em memória com TTL 15 min.
 */

interface GovCache {
  set: Set<string>;
  expiresAt: number;
}

let cache: GovCache | null = null;
let refreshPromise: Promise<void> | null = null;

// ── Público ───────────────────────────────────────────────────────────────────

export async function getGovSignSet(): Promise<Set<string>> {
  if (!cache || Date.now() > cache.expiresAt) {
    if (!refreshPromise) {
      refreshPromise = refreshCache().finally(() => { refreshPromise = null; });
    }
    await refreshPromise;
  }
  return cache?.set ?? new Set();
}

export async function forceRefreshGov(): Promise<{ size: number }> {
  cache = null;
  if (!refreshPromise) {
    refreshPromise = refreshCache().finally(() => { refreshPromise = null; });
  }
  await refreshPromise;
  return { size: (cache as GovCache | null)?.set.size ?? 0 };
}

// ── Interno ───────────────────────────────────────────────────────────────────

async function refreshCache(): Promise<void> {
  const startMs = Date.now();
  try {
    /**
     * Extrai o id_contrato de arquivos GOV salvos no IXC.
     * Cobre dois padrões reais observados em produção:
     *   1. nome_arquivo: "45017 - GOV.pdf"  (espaços ao redor do hífen)
     *   2. descricao:    "45032 - GOV"      (ID no campo descrição, nome do arquivo diferente)
     *
     * REGEXP aceita espaços opcionais: '^[0-9]+ *- *[Gg][Oo][Vv]'
     * TRIM remove espaços residuais antes/depois do id extraído.
     * HAVING garante que só IDs puramente numéricos entrem no Set.
     */
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT
         TRIM(SUBSTRING_INDEX(
           CASE
             WHEN ca.nome_arquivo REGEXP '^[0-9]+ *- *[Gg][Oo][Vv]' THEN ca.nome_arquivo
             ELSE ca.descricao
           END,
         '-', 1)) AS id_contrato
       FROM cliente_arquivos ca
       WHERE ca.nome_arquivo REGEXP '^[0-9]+ *- *[Gg][Oo][Vv]'
          OR ca.descricao   REGEXP '^[0-9]+ *- *[Gg][Oo][Vv]'
       HAVING id_contrato REGEXP '^[0-9]+$'`
    );

    const set = new Set<string>(rows.map((r) => String(r.id_contrato)));
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

    cache = { set, expiresAt: Date.now() + 15 * 60 * 1000 };
    logger.info(`[GovSign] Cache atualizado — ${set.size} contratos com assinatura GOV em ${elapsed}s.`);
  } catch (err) {
    const e = err as { message?: string };
    logger.error('[GovSign] Falha ao atualizar cache', { message: e.message });
    if (!cache) {
      cache = { set: new Set(), expiresAt: Date.now() + 2 * 60 * 1000 };
    } else {
      cache.expiresAt = Date.now() + 2 * 60 * 1000;
    }
  }
}

// Aquece o cache imediatamente ao iniciar o servidor
refreshPromise = refreshCache().finally(() => { refreshPromise = null; });

import pool from '../../config/mysql';
import logger from '../../config/logger';
import { RowDataPacket } from 'mysql2';

/**
 * Serviço de Assinatura Física (IXC)
 * ─────────────────────────────────────────────────────────────────────────────
 * Contratos assinados fisicamente (impressos, assinados à mão e escaneados)
 * devem ser salvos no IXC com o nome no padrão:
 *
 *   {id_contrato} - FISICO     →  ex.: "44925 - FISICO" ou "44925 - FISICO.pdf"
 *
 * Aceita variações de espaçamento e capitalização:
 *   "44925-FISICO", "44925 - fisico.pdf", "44925 - Fisico"
 *
 * Mantém um Set<id_contrato> em memória com TTL 15 min.
 */

interface FisicoCache {
  set: Set<string>;
  expiresAt: number;
}

let cache: FisicoCache | null = null;
let refreshPromise: Promise<void> | null = null;

// ── Público ───────────────────────────────────────────────────────────────────

export async function getFisicoSet(): Promise<Set<string>> {
  if (!cache || Date.now() > cache.expiresAt) {
    if (!refreshPromise) {
      refreshPromise = refreshCache().finally(() => { refreshPromise = null; });
    }
    await refreshPromise;
  }
  return cache?.set ?? new Set();
}

export async function forceRefreshFisico(): Promise<{ size: number }> {
  cache = null;
  if (!refreshPromise) {
    refreshPromise = refreshCache().finally(() => { refreshPromise = null; });
  }
  await refreshPromise;
  return { size: (cache as FisicoCache | null)?.set.size ?? 0 };
}

// ── Interno ───────────────────────────────────────────────────────────────────

async function refreshCache(): Promise<void> {
  const startMs = Date.now();
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT
         TRIM(SUBSTRING_INDEX(
           CASE
             WHEN ca.nome_arquivo REGEXP '^[0-9]+ *- *[Ff][Ii][Ss][Ii][Cc][Oo]' THEN ca.nome_arquivo
             ELSE ca.descricao
           END,
         '-', 1)) AS id_contrato
       FROM cliente_arquivos ca
       WHERE ca.nome_arquivo REGEXP '^[0-9]+ *- *[Ff][Ii][Ss][Ii][Cc][Oo]'
          OR ca.descricao   REGEXP '^[0-9]+ *- *[Ff][Ii][Ss][Ii][Cc][Oo]'
       HAVING id_contrato REGEXP '^[0-9]+$'`
    );

    const set = new Set<string>(rows.map((r) => String(r.id_contrato)));
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

    cache = { set, expiresAt: Date.now() + 15 * 60 * 1000 };
    logger.info(`[Fisico] Cache atualizado — ${set.size} contratos com assinatura física em ${elapsed}s.`);
  } catch (err) {
    const e = err as { message?: string };
    logger.error('[Fisico] Falha ao atualizar cache', { message: e.message });
    if (!cache) {
      cache = { set: new Set(), expiresAt: Date.now() + 2 * 60 * 1000 };
    } else {
      cache.expiresAt = Date.now() + 2 * 60 * 1000;
    }
  }
}

// Aquece o cache imediatamente ao iniciar o servidor
refreshPromise = refreshCache().finally(() => { refreshPromise = null; });

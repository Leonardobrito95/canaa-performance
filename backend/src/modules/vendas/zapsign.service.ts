import axios from 'axios';
import logger from '../../config/logger';

const ZAPSIGN_API = 'https://api.zapsign.com.br/api/v1';
const BATCH_SIZE  = 15;   // páginas buscadas em paralelo por rodada
const MAX_PAGES   = 300;  // cap: 300 × 25 = 7 500 docs mais recentes

interface ZapSignDoc {
  status: string;
  name:   string;
}

// Prioridade de status: signed sempre vence
const STATUS_PRIORITY: Record<string, number> = {
  signed:  3,
  pending: 2,
  refused: 1,
};

interface ZapCache {
  map:       Map<string, string>;
  expiresAt: number;
}

let cache:          ZapCache | null      = null;
let refreshPromise: Promise<void> | null = null;

/**
 * Retorna o mapa { id_contrato → status } do ZapSign.
 * Requisições concorrentes aguardam a mesma Promise de recarga.
 */
export async function getZapSignMap(): Promise<Map<string, string>> {
  if (!cache || Date.now() > cache.expiresAt) {
    if (!refreshPromise) {
      refreshPromise = refreshCache().finally(() => { refreshPromise = null; });
    }
    // Only block if there is no cached data at all (cold start).
    // If stale data exists, serve it immediately while rebuild runs in background.
    if (!cache) {
      await refreshPromise;
    }
  }
  return cache?.map ?? new Map();
}

async function fetchPage(token: string, page: number): Promise<{ results: ZapSignDoc[]; hasNext: boolean; total: number }> {
  const res = await axios.get(`${ZAPSIGN_API}/docs/?page=${page}&sort_order=desc`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20_000,
  });
  return {
    results: res.data?.results ?? [],
    hasNext: !!res.data?.next,
    total:   res.data?.count  ?? 0,
  };
}

async function refreshCache(): Promise<void> {
  const token = process.env.ZAPSIGN_TOKEN;
  if (!token) {
    cache = { map: new Map(), expiresAt: Date.now() + 5 * 60 * 1000 };
    logger.warn('[ZapSign] ZAPSIGN_TOKEN não configurado.');
    return;
  }

  const startMs = Date.now();
  try {
    // ── Página 1: descobre total e primeiros docs ─────────────────────────────
    const first = await fetchPage(token, 1);
    if (first.results.length === 0) {
      cache = { map: new Map(), expiresAt: Date.now() + 15 * 60 * 1000 };
      return;
    }

    const perPage    = first.results.length;
    const totalPages = Math.min(Math.ceil(first.total / perPage), MAX_PAGES);
    const allDocs: ZapSignDoc[] = [...first.results];

    // ── Demais páginas em lotes paralelos ─────────────────────────────────────
    const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

    for (let b = 0; b < remaining.length; b += BATCH_SIZE) {
      const batch = remaining.slice(b, b + BATCH_SIZE);
      const responses = await Promise.all(
        batch.map((pg) =>
          fetchPage(token, pg).catch((err) => {
            logger.warn(`[ZapSign] Falha na página ${pg}`, { message: err.message });
            return null;
          })
        )
      );
      for (const r of responses) {
        if (r?.results?.length) allDocs.push(...r.results);
      }
    }

    // ── Monta mapa id_contrato → status ──────────────────────────────────────
    const map = new Map<string, string>();

    for (const doc of allDocs) {
      if (!doc.name) continue;

      // Replica lógica Power BI:
      // 1. Remove .pdf  →  "44925 - NOME CLIENTE"
      // 2. ID = Text.BeforeDelimiter(name, "-")  →  "44925 "
      // 3. Trim + dígitos apenas (Int64)
      const nameNoPdf  = doc.name.replace(/\.pdf$/i, '').trim();
      const dashIdx    = nameNoPdf.indexOf('-');
      const idRaw      = dashIdx >= 0 ? nameNoPdf.substring(0, dashIdx).trim() : nameNoPdf.trim();
      const contractId = idRaw.replace(/\D/g, '');
      if (!contractId) continue;

      // Dedup com prioridade: "signed" sempre vence independente da ordem.
      // Isso evita que um re-envio pendente sobrescreva um documento já assinado.
      const existing        = map.get(contractId);
      const newPriority     = STATUS_PRIORITY[doc.status]     ?? 0;
      const existingPriority = STATUS_PRIORITY[existing ?? ''] ?? -1;
      if (!existing || newPriority > existingPriority) {
        map.set(contractId, doc.status ?? 'unknown');
      }
    }

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    cache = { map, expiresAt: Date.now() + 15 * 60 * 1000 };
    logger.info(`[ZapSign] Cache atualizado — ${map.size} contratos em ${elapsed}s (${allDocs.length} docs, ${totalPages} páginas).`);

  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string };
    logger.error('[ZapSign] Falha ao atualizar cache', {
      http:    e.response?.status,
      message: e.message,
      body:    JSON.stringify(e.response?.data),
    });
    if (!cache) {
      cache = { map: new Map(), expiresAt: Date.now() + 2 * 60 * 1000 };
    } else {
      cache.expiresAt = Date.now() + 2 * 60 * 1000;
    }
  }
}

/**
 * Força a recarga do cache (ignora expiração).
 * Útil para diagnóstico ou após correção manual no ZapSign.
 */
export async function forceRefreshCache(): Promise<{ size: number }> {
  // Mark expired but keep stale data so concurrent getZapSignMap calls don't block.
  if (cache) cache.expiresAt = 0;
  if (!refreshPromise) {
    refreshPromise = refreshCache().finally(() => { refreshPromise = null; });
  }
  await refreshPromise;
  return { size: (cache as ZapCache | null)?.map.size ?? 0 };
}

/**
 * Retorna o status ZapSign de um contrato específico (para diagnóstico).
 */
export async function debugContractStatus(contractId: string): Promise<{
  contractId: string;
  status: string;
  cacheSize: number;
  cacheExpiresAt: string;
}> {
  const map = await getZapSignMap();
  return {
    contractId,
    status:         map.get(contractId) ?? 'Sem Contrato',
    cacheSize:      map.size,
    cacheExpiresAt: cache ? new Date(cache.expiresAt).toISOString() : 'N/A',
  };
}

// Aquece o cache imediatamente ao iniciar o servidor
refreshPromise = refreshCache().finally(() => { refreshPromise = null; });

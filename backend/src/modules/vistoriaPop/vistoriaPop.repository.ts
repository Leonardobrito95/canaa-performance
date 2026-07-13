import prisma from '../../config/prisma';
import { VistoriaResumoPop, VistoriaPendencia, VistoriaHistoricoItem } from './vistoriaPop.types';

// ── Vistoria de POP (Postgres, schema public — MESMA sistema_db do Prisma,
// tabelas de um sistema externo (porta 5002), leitura via $queryRaw. Sem
// model Prisma, sem migration — mesmo tratamento já dado ao schema `otdr`
// em diagnostico.repository.ts: nunca escrevemos nessas tabelas, só lemos. ──

/// Datas do Postgres via $queryRaw chegam como Date já em UTC de verdade
/// (driver `pg`, diferente do mysql2 usado pro MariaDB IXC, que interpreta
/// no fuso local) — toISOString() é o formato correto aqui, mesmo padrão já
/// usado em diagnostico.prompt.ts (fmtData) pras datas do schema `otdr`.
function fmtDataPg(valor: unknown): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor as string);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function diasDesde(valor: unknown): number | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor as string);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/// Última vistoria de cada POP (DISTINCT ON — idioma Postgres pra "1 linha
/// por grupo, a de maior data") + contagem de pendências abertas por POP,
/// cruzados em JS (2 queries simples em vez de 1 JOIN complexo).
export async function buscarResumoPorPop(): Promise<VistoriaResumoPop[]> {
  const ultimas = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT ON (pop_name) pop_name, inspector_name, submission_time
    FROM public.vistoria_pop
    ORDER BY pop_name, submission_time DESC
  `;
  const pendencias = await prisma.$queryRaw<any[]>`
    SELECT pop_name, COUNT(*)::int AS qtd
    FROM public.vistoria_pendencias
    WHERE status = 'pendente'
    GROUP BY pop_name
  `;
  const qtdPorPop = new Map<string, number>(pendencias.map((p) => [p.pop_name, Number(p.qtd)]));

  return ultimas.map((r) => ({
    popName:           r.pop_name,
    ultimaVistoria:    fmtDataPg(r.submission_time),
    inspetor:          r.inspector_name ?? null,
    diasDesde:         diasDesde(r.submission_time),
    pendenciasAbertas: qtdPorPop.get(r.pop_name) ?? 0,
  }));
}

/// Todas as pendências ABERTAS — `categorias` filtra (ex: só as de segurança
/// crítica, usado pelo detector de alerta); sem filtro, traz tudo (usado
/// pelo dashboard). Ordenado por mais antiga primeiro (mais urgente).
export async function buscarPendenciasAbertas(categorias?: readonly string[]): Promise<VistoriaPendencia[]> {
  const rows = categorias?.length
    ? await prisma.$queryRaw<any[]>`
        SELECT id, pop_name, categoria, descricao, data_identificacao, status, observacoes
        FROM public.vistoria_pendencias
        WHERE status = 'pendente' AND categoria = ANY(${categorias})
        ORDER BY data_identificacao ASC
      `
    : await prisma.$queryRaw<any[]>`
        SELECT id, pop_name, categoria, descricao, data_identificacao, status, observacoes
        FROM public.vistoria_pendencias
        WHERE status = 'pendente'
        ORDER BY data_identificacao ASC
      `;
  return rows.map((r) => ({
    id:                r.id,
    popName:           r.pop_name,
    categoria:         r.categoria,
    descricao:         r.descricao,
    dataIdentificacao: fmtDataPg(r.data_identificacao),
    status:            r.status,
    observacoes:       r.observacoes,
    diasAberta:        diasDesde(r.data_identificacao),
  }));
}

export async function buscarHistoricoPop(popName: string, limite = 20): Promise<VistoriaHistoricoItem[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT submission_id, pop_name, inspector_name, submission_time, form_data, photos
    FROM public.vistoria_pop
    WHERE pop_name = ${popName}
    ORDER BY submission_time DESC
    LIMIT ${limite}
  `;
  return rows.map((r) => ({
    submissionId:   r.submission_id,
    popName:        r.pop_name,
    inspectorName:  r.inspector_name,
    submissionTime: fmtDataPg(r.submission_time),
    formData:       r.form_data ?? {},
    photos:         Array.isArray(r.photos) ? r.photos : [],
  }));
}

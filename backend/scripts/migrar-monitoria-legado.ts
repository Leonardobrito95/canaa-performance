/**
 * Migração pontual do sistema de monitoria legado (Flask + SQLite, rodando
 * numa VM separada em /home/canaa/Dados/Relatorios/Callcenter/Monitoria/
 * Programa) pra Postgres via Prisma. Lê os NDJSON gerados por
 * `extrair_monitoria.py` (script Python à parte, roda na VM contra o
 * monitoria.db original — não versionado aqui, é utilitário de uma vez só).
 *
 * Idempotente por `protocolo` (upsert) — seguro rodar de novo se precisar
 * corrigir o mapeamento de algum campo.
 *
 * Uso: npx ts-node -r dotenv/config scripts/migrar-monitoria-legado.ts
 */
import fs from 'fs';
import readline from 'readline';
import prisma from '../src/config/prisma';

const NDJSON_DIR = '/tmp/claude-1000/-home-canaa-Governan-a-PowerBI-bdr-commission/ac9cdcdb-af9e-4aae-a3a6-ce625d59fcd3/scratchpad';

interface RegistroAgenteLegado {
  nome: string;
  equipe: string;
  status: string;
}

interface RegistroMonitoriaLegado {
  idLegado: number;
  protocolo: string;
  dataAtendimento: string | null;
  dataMonitoria: string | null;
  nomeAgente: string;
  equipe: string;
  motivoAtendimento: string | null;
  monitoriaZero: string | null;
  avaliacaoAtd: string | null;
  erroCritico: boolean;
  itensAplicaveis: string | null;
  pontuacao: string | null;
  observacoes: string | null;
  ofensaVerbalLegado: string | null;
  criterios: Record<string, string | null>;
}

async function lerNdjson<T>(caminho: string): Promise<T[]> {
  const linhas: T[] = [];
  const stream = readline.createInterface({ input: fs.createReadStream(caminho), crlfDelay: Infinity });
  for await (const linha of stream) {
    if (linha.trim()) linhas.push(JSON.parse(linha));
  }
  return linhas;
}

function toNumber(v: string | null): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: string | null): number | null {
  const n = toNumber(v);
  return n !== null ? Math.trunc(n) : null;
}

function toDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

async function migrarAgentes(): Promise<void> {
  const agentes = await lerNdjson<RegistroAgenteLegado>(`${NDJSON_DIR}/agentes.ndjson`);
  let sucesso = 0;
  for (const a of agentes) {
    await prisma.atendimentoAgenteQa.upsert({
      where: { nome: a.nome },
      create: { nome: a.nome, equipe: a.equipe, status: a.status },
      update: { equipe: a.equipe, status: a.status },
    });
    sucesso++;
  }
  console.log(`agentes: ${sucesso}/${agentes.length} migrados`);
}

async function migrarMonitorias(): Promise<void> {
  const registros = await lerNdjson<RegistroMonitoriaLegado>(`${NDJSON_DIR}/monitoria.ndjson`);
  console.log(`monitoria: ${registros.length} registros lidos do NDJSON, migrando...`);

  const LOTE = 40;
  let sucesso = 0;
  let falha = 0;

  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE);
    const resultados = await Promise.allSettled(lote.map((r) =>
      prisma.atendimentoMonitoriaQa.upsert({
        where: { id_legado: r.idLegado },
        create: {
          id_legado:            r.idLegado,
          protocolo:            r.protocolo,
          data_atendimento:     toDate(r.dataAtendimento),
          data_monitoria:       toDate(r.dataMonitoria),
          nome_agente:          r.nomeAgente,
          equipe:               r.equipe,
          motivo_atendimento:   r.motivoAtendimento,
          monitoria_zero:       r.monitoriaZero,
          avaliacao_atd:        toNumber(r.avaliacaoAtd),
          erro_critico:         r.erroCritico,
          itens_aplicaveis:     toInt(r.itensAplicaveis),
          pontuacao:            toNumber(r.pontuacao),
          observacoes:          r.observacoes,
          ofensa_verbal_legado: r.ofensaVerbalLegado,
          criterios:            r.criterios,
          origem:               'legado',
        },
        update: {
          data_atendimento:     toDate(r.dataAtendimento),
          data_monitoria:       toDate(r.dataMonitoria),
          nome_agente:          r.nomeAgente,
          equipe:               r.equipe,
          motivo_atendimento:   r.motivoAtendimento,
          monitoria_zero:       r.monitoriaZero,
          avaliacao_atd:        toNumber(r.avaliacaoAtd),
          erro_critico:         r.erroCritico,
          itens_aplicaveis:     toInt(r.itensAplicaveis),
          pontuacao:            toNumber(r.pontuacao),
          observacoes:          r.observacoes,
          ofensa_verbal_legado: r.ofensaVerbalLegado,
          criterios:            r.criterios,
        },
      })
    ));
    for (const res of resultados) {
      if (res.status === 'fulfilled') sucesso++;
      else { falha++; console.error('  falha:', res.reason?.message ?? res.reason); }
    }
    if ((i / LOTE) % 20 === 0) console.log(`  ...${Math.min(i + LOTE, registros.length)}/${registros.length}`);
  }

  console.log(`monitoria: ${sucesso} migrados, ${falha} falhas`);
}

async function main() {
  await migrarAgentes();
  await migrarMonitorias();
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

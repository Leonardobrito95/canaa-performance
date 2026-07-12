/**
 * Rollup mensal dos KPIs de atendimento (todos os setores em SETORES_ATENDIMENTO):
 * calcula volume/TMA/TME/TMR/escalonamento/satisfação de um mês FECHADO e
 * persiste em AtendimentoKpiMensal (1 linha por setor). Idempotente (upsert
 * por setor+mês) — seguro rodar de novo pra recalcular um mês.
 *
 * Existe porque calcular esses KPIs ao vivo pra uma janela de vários meses
 * é caro no Mongo do OpaSuite (medido: ~48s pra 3 meses x 3 setores em
 * paralelo) — inviável rodar a cada pergunta do chat de gestão. O mês
 * corrente continua sendo calculado ao vivo; esse rollup só cobre o
 * histórico, servindo de cache pra tendência de vários meses.
 *
 * A partir desta sessão também roda automaticamente todo dia 1 às 03h (ver
 * jobs/alertas.job.ts) — este script continua útil pra rodar sob demanda,
 * inclusive pra backfill de meses já fechados no passado.
 *
 * Uso:
 *   npx ts-node -r dotenv/config scripts/rollup-atendimento-mensal.ts                 (mês anterior)
 *   npx ts-node -r dotenv/config scripts/rollup-atendimento-mensal.ts --mes=2026-06
 *   npx ts-node -r dotenv/config scripts/rollup-atendimento-mensal.ts --desde=2026-01 --ate=2026-06
 */

import prisma from '../src/config/prisma';
import { rodarRollupAtendimentoMensal, mesAnterior } from '../src/modules/atendimento/atendimento.rollup';

function parseArg(nome: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return arg?.split('=')[1];
}

function listaMeses(desde: string, ate: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = desde.split('-').map(Number);
  const [anoFim, mesFim] = ate.split('-').map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return meses;
}

async function run() {
  const mesUnico = parseArg('mes');
  const desde = parseArg('desde');
  const ate = parseArg('ate');

  const meses = mesUnico ? [mesUnico] : desde ? listaMeses(desde, ate ?? mesAnterior()) : [mesAnterior()];

  console.log(`Rollup de atendimento para ${meses.length} mês(es): ${meses.join(', ')}`);

  for (const mes of meses) {
    const t0 = Date.now();
    process.stdout.write(`▶ ${mes}... `);
    try {
      await rodarRollupAtendimentoMensal(mes);
      console.log(`OK (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (err: any) {
      console.log(`ERRO: ${err.message}`);
    }
  }

  await prisma.$disconnect();
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });

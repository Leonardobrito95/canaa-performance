/**
 * Camada analítica de IA em massa (Motivo/Adesão ao Script/Sentimento) —
 * processa atendimentos de TEXTO (exclui pabx) FECHADOS num período,
 * gravando em AtendimentoAnaliseIa. Sinal de triagem, NUNCA nota oficial de
 * QA (ver comentário do model no schema.prisma).
 *
 * Idempotente por opasuite_atendimento_id — rodar de novo não duplica nem
 * reprocessa o que já foi feito.
 *
 * A partir de julho/2026 também roda automaticamente todo dia às 05h via
 * cron (ver jobs/alertas.job.ts) — este script serve tanto pra rodar sob
 * demanda quanto pra fase piloto de calibração de threshold.
 *
 * Uso: npx ts-node -r dotenv/config scripts/analisar-atendimentos-ia.ts [dias=1] [limite=700]
 *
 * Ex: piloto cobrindo os últimos 7 dias, até 300 itens:
 *   npx ts-node -r dotenv/config scripts/analisar-atendimentos-ia.ts 7 300
 */

import prisma from '../src/config/prisma';
import { rodarAnaliseIaEmMassa } from '../src/modules/atendimento/atendimento.analise-ia';

async function run() {
  const args = process.argv.slice(2);
  const dias = Number(args[0]) || 1;
  const limite = Number(args[1]) || 700;

  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dias);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1, 23, 59, 59, 999);

  console.log(`Buscando atendimentos de texto fechados entre ${inicio.toISOString().slice(0, 10)} e ${fim.toISOString().slice(0, 10)} (limite ${limite})...`);

  const resultado = await rodarAnaliseIaEmMassa(inicio, fim, limite, (protocolo, erro) => {
    console.log(erro ? `▶ ${protocolo}... ERRO: ${erro}` : `▶ ${protocolo}... ok`);
  });

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Candidatos: ${resultado.totalCandidatos} | Processados: ${resultado.processados} | Falhas: ${resultado.falhas}`);
  await prisma.$disconnect();
  process.exit(resultado.falhas > 0 && resultado.processados === 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });

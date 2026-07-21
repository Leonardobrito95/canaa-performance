/**
 * Popula/atualiza a tabela de blocos de texto longo do system prompt do CAIO
 * (schema diagnostico.blocos_prompt) com o texto padrão embutido no código,
 * como ponto de partida editável pela UI de Regras de Negócio. Idempotente
 * (upsert por chave, não sobrescreve edição feita depois pela UI a menos que
 * rodado de novo manualmente).
 *
 * Uso: npx ts-node -r dotenv/config scripts/seed-diagnostico-blocos-prompt.ts
 */

import prisma from '../src/config/prisma';
import { CRITERIOS_INSTALACAO_PADRAO } from '../src/modules/diagnostico/diagnostico.prompt';
import {
  REGRA_SINAL_DUAS_FONTES_PADRAO,
  REGRA_RETENCAO_DESEMPENHO_VS_AUDITORIA_PADRAO,
  REGRA_ATENDIMENTO_SETE_FONTES_PADRAO,
} from '../src/modules/diagnostico/diagnostico.gestao-fontes';

const BLOCOS: { chave: string; titulo: string; texto: string }[] = [
  {
    chave: 'CRITERIOS_INSTALACAO',
    titulo: 'Critérios de instalação (análise de fotos)',
    texto: CRITERIOS_INSTALACAO_PADRAO,
  },
  {
    chave: 'REGRA_SINAL_DUAS_FONTES',
    titulo: 'Chat de Gestão: sinal ao vivo vs. degradação diária',
    texto: REGRA_SINAL_DUAS_FONTES_PADRAO,
  },
  {
    chave: 'REGRA_RETENCAO_DESEMPENHO_VS_AUDITORIA',
    titulo: 'Chat de Gestão: desempenho de retenção vs. auditoria',
    texto: REGRA_RETENCAO_DESEMPENHO_VS_AUDITORIA_PADRAO,
  },
  {
    chave: 'REGRA_ATENDIMENTO_SETE_FONTES',
    titulo: 'Chat de Gestão: as sete fontes de Atendimento',
    texto: REGRA_ATENDIMENTO_SETE_FONTES_PADRAO,
  },
];

async function run() {
  for (const b of BLOCOS) {
    await prisma.diagnosticoBlocoPrompt.upsert({
      where: { chave: b.chave },
      update: { titulo: b.titulo, texto: b.texto, atualizado_por: 'seed-script' },
      create: { ...b, atualizado_por: 'seed-script' },
    });
    console.log(`OK: ${b.chave}`);
  }
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });

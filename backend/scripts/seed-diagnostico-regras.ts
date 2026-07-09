/**
 * Popula/atualiza a tabela de referência de regras de negócio lida pelo
 * módulo Diagnóstico (schema diagnostico.regras_negocio). Não substitui as
 * constantes usadas hoje pelo sistema de produção — é só uma cópia de
 * leitura para o prompt da IA. Idempotente (upsert por chave).
 *
 * Uso: npx ts-node -r dotenv/config scripts/seed-diagnostico-regras.ts
 */

import prisma from '../src/config/prisma';

const REGRAS: { chave: string; valor: string; descricao: string; categoria: string }[] = [
  {
    chave: 'META_B2C',
    valor: '10000',
    descricao: 'Meta de vendas B2C em valor de ativos (contratos ativados no mês, com ou sem liberação). Comissão paga só sobre o valor liberado (1º boleto pago). Vigente desde junho/2026 (regra anterior era R$8.000 em valor liberado).',
    categoria: 'VENDAS',
  },
  {
    chave: 'META_B2B',
    valor: '7000',
    descricao: 'Meta de vendas B2B em valor liberado (1º boleto pago).',
    categoria: 'VENDAS',
  },
  {
    chave: 'META_BDR_UPGRADES',
    valor: '50',
    descricao: 'Quantidade mínima de upgrades no mês para atingir a meta BDR.',
    categoria: 'COMISSAO',
  },
  {
    chave: 'META_BDR_RENOVACOES',
    valor: '80',
    descricao: 'Quantidade mínima de refidelizações no mês para atingir a meta BDR (exigida em conjunto com META_BDR_UPGRADES).',
    categoria: 'COMISSAO',
  },
  {
    chave: 'RETENCAO_FAIXA_BRONZE',
    valor: '70:400',
    descricao: 'A partir de 70 contratos retidos no mês, comissão de R$400 (formato faixa:valor).',
    categoria: 'RETENCAO',
  },
  {
    chave: 'RETENCAO_FAIXA_PRATA',
    valor: '90:550',
    descricao: 'A partir de 90 contratos retidos no mês, comissão de R$550 (formato faixa:valor).',
    categoria: 'RETENCAO',
  },
  {
    chave: 'RETENCAO_FAIXA_OURO',
    valor: '110:750',
    descricao: 'A partir de 110 contratos retidos no mês, comissão de R$750 (formato faixa:valor).',
    categoria: 'RETENCAO',
  },
  {
    chave: 'NIVEL_SINAL_CATEGORIAS',
    valor: '1 - Atencao | 2 - Critico | 3 - Fora de Operacao',
    descricao: 'Classificação de sinal já pré-calculada pelo OTDR (historico_sinal.nivel_sinal e historico_smartolt.nivel_sinal; valores reais confirmados em produção). Cliente sem sinal degradado simplesmente não aparece nessas tabelas. A IA deve usar essa categoria pronta, não recalcular limiar de atenuação por conta própria.',
    categoria: 'REDE',
  },
  {
    chave: 'PADRAO_EQUIPAMENTO_WIFI',
    valor: 'TP-Link: maior reincidência de problemas de sinal Wi-Fi observada em campo',
    descricao: 'Segundo experiência da equipe técnica, equipamentos TP-Link (roteador/ONU) têm histórico de maior reincidência de problemas de sinal Wi-Fi comparado a outras marcas usadas pela empresa (ex: ZTE). Ao avaliar um cliente com queixa de sinal/lentidão cujo equipamento foi trocado recentemente para TP-Link, considerar isso um fator contribuinte plausível a mencionar — não é prova definitiva, é um padrão observado, não recalcular ou generalizar além do que os dados da consulta mostrarem.',
    categoria: 'REDE',
  },
];

async function run() {
  for (const r of REGRAS) {
    await prisma.diagnosticoRegraNegocio.upsert({
      where: { chave: r.chave },
      update: { valor: r.valor, descricao: r.descricao, categoria: r.categoria, atualizado_por: 'seed-script' },
      create: { ...r, atualizado_por: 'seed-script' },
    });
    console.log(`OK: ${r.chave}`);
  }
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });

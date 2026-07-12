/**
 * Auditoria de retenção: classifica O.S. de retenção (id_assunto=348) ainda não
 * auditadas, lendo o texto das mensagens (O.S. + atendimentos relacionados) pra
 * decidir se houve negociação real — não a classificação genérica do IXC.
 *
 * Idempotente: só processa o que ainda não está em RetencaoAuditoria, então
 * pode ser rodado de novo (manualmente ou num cron) sem reclassificar o que já
 * foi feito. Não altera nenhum cálculo de comissão — só popula a tabela de
 * auditoria pra relatório/chat de gestão.
 *
 * A partir de julho/2026 também roda automaticamente todo dia às 18h via cron
 * (ver jobs/alertas.job.ts) — este script continua útil pra rodar sob demanda
 * (ex: --reclassificar depois de uma melhoria no classificador).
 *
 * Uso: npx ts-node -r dotenv/config scripts/auditar-retencao.ts [limite] [desde=YYYY-MM-DD] [--apenas-retido] [--reclassificar]
 *
 * Ex: só as RETIDO deste mês pra frente:
 *   npx ts-node -r dotenv/config scripts/auditar-retencao.ts 50 2026-07-01 --apenas-retido
 *
 * --reclassificar: não pula os já auditados (upsert atualiza em cima) — usar
 * depois de melhorar a evidência (ex: integração com OpaSuite) pra reprocessar
 * o que já tinha sido classificado só com a nota da O.S.
 */

import prisma from '../src/config/prisma';
import { rodarAuditoriaRetencao } from '../src/modules/retencao/retencao.auditoria';

const LIMITE_PADRAO = 50;

async function run() {
  const args = process.argv.slice(2);
  const apenasRetido = args.includes('--apenas-retido');
  const reclassificar = args.includes('--reclassificar');
  const posicionais = args.filter((a) => !a.startsWith('--'));
  const limite = Number(posicionais[0]) || LIMITE_PADRAO;
  const dataMinima = posicionais[1] ? new Date(`${posicionais[1]}T00:00:00`) : undefined;

  console.log(
    `Buscando até ${limite}` +
    (reclassificar ? ' (reclassificando, ignora os já feitos)' : ' novos') +
    (dataMinima ? ` desde ${posicionais[1]}` : '') +
    (apenasRetido ? ' (apenas RETIDO)' : '') + '...'
  );

  const resultado = await rodarAuditoriaRetencao(
    { limite, dataMinima, apenasRetido, reclassificar },
    (item) => {
      const prefixo = `O.S. #${item.chamado.idChamado} (${item.chamado.nomeOperador}, IXC=${item.chamado.resultadoIxc}, OpaSuite=${item.chamado.conversasOpaSuite.length ? 'sim' : 'não'})`;
      if (item.erro) {
        console.log(`▶ ${prefixo}... ERRO: ${item.erro}`);
      } else if (item.resultado) {
        console.log(
          `▶ ${prefixo}... ${item.resultado.classificacao}` +
          (item.resultado.divergenciaNotaOs ? `  ⚠ DIVERGÊNCIA: ${item.resultado.divergenciaNotaOs}` : '')
        );
      }
    },
  );

  console.log(`Encontrados ${resultado.totalEncontrados} chamados para classificar.`);
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Classificados: ${resultado.sucesso} | Falhas: ${resultado.falha} | Divergências nota-vs-OpaSuite: ${resultado.divergencias} | Restantes na fila: pode haver mais, rode de novo se necessário.`);
  await prisma.$disconnect();
  process.exit(resultado.falha > 0 && resultado.sucesso === 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });

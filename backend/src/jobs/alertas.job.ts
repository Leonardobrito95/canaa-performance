import cron from 'node-cron';
import logger from '../config/logger';
import {
  alertaAssinaturaPendente,
  alertaFaturaNaoQuitada,
  alertaRetencaoMeta,
  alertaRetencaoFimMes,
} from '../modules/alertas/alertas.service';
import { enviarRelatorioComercial } from '../modules/vendas/comissao-envio.service';
import { gerarSnapshot } from '../modules/vendas/snapshot.service';
import { buscarPiorasHoje, buscarPioresClientesHoje, buscarEstadoPorOlt, EstadoOlt } from '../modules/otdr/otdr.service';
import { enviarResumoDiario, enviarAlertaQueda, CausaCliente } from '../modules/otdr/otdr.alerts';
import { enviarRelatorioGovernanca } from '../modules/otdr/otdr.governance';
import { gerarDiagnosticoIndividual } from '../modules/diagnostico/diagnostico.service';

const SOLICITANTE_CRON = { ixcUserId: 'cron-alertas', ixcUsername: 'cron-alertas' };
const LIMITE_CAUSAS_RESUMO_DIARIO = 3;

/// Roda o Diagnóstico IA só nos piores clientes do dia ("poucos, fundamentados
/// na causa" — não um por ONU degradada) e extrai a causa raiz para anexar no
/// resumo diário já existente. Falha de um cliente não derruba os outros nem
/// o resumo em si — na pior hipótese, o resumo sai sem a seção de causas.
async function coletarCausasDoDia(): Promise<CausaCliente[]> {
  const piores = await buscarPioresClientesHoje(LIMITE_CAUSAS_RESUMO_DIARIO);
  const causas: CausaCliente[] = [];

  for (const cliente of piores) {
    try {
      const resultado = await gerarDiagnosticoIndividual(cliente.idCliente, SOLICITANTE_CRON);
      causas.push({ nome: cliente.nome, causa: resultado.erro || resultado.textoCompleto });
    } catch (err) {
      logger.error('[ALERTA] Falha ao gerar causa do Diagnóstico IA para o resumo diário', {
        idCliente: cliente.idCliente, error: String(err),
      });
    }
  }

  return causas;
}

const DIAS_VENDAS   = [15, 25, 30];
const DIA_COMISSAO  = 19;

async function runSafe(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error(`[ALERTA] Erro ao executar "${nome}"`, { error: String(err) });
  }
}

function mesAnterior(): string {
  const now   = new Date();
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function iniciarJobs(): void {
  cron.schedule('0 8 * * *', async () => {
    const diaAtual = new Date().getDate();

    if (DIAS_VENDAS.includes(diaAtual)) {
      await runSafe('Assinatura Pendente', alertaAssinaturaPendente);
      await runSafe('Fatura Não Quitada',  alertaFaturaNaoQuitada);
    }

    await runSafe('Retenção Meta',       alertaRetencaoMeta);
    await runSafe('Retenção Fim de Mês', alertaRetencaoFimMes);

    if (diaAtual === DIA_COMISSAO) {
      const mes = mesAnterior();
      await runSafe('Snapshot Mensal', async () => {
        const result = await gerarSnapshot(mes);
        logger.info(`[JOBS] Snapshot ${mes}: ${result.total} contratos (${result.liberadas} liberadas).`);
      });
      await runSafe('Relatório Comissão → Comercial', () => enviarRelatorioComercial(mes));
    }
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('[JOBS] Alertas agendados — execução diária às 08:00 (Brasília).');

  // ── OTDR: resumo diário às 7h ─────────────────────────────────────────────
  cron.schedule('0 7 * * *', async () => {
    await runSafe('OTDR Resumo Diário', async () => {
      const resumos = await buscarPiorasHoje();
      if (!resumos.length) return;
      const causas = await coletarCausasDoDia();
      await enviarResumoDiario(resumos, causas);
    });
  }, { timezone: 'America/Sao_Paulo' });

  // ── OTDR: detector de queda brusca a cada 15 min ──────────────────────────
  const snapshotAnterior = new Map<string, EstadoOlt>();
  const SPIKE_THRESHOLD = parseInt(process.env.OTDR_SPIKE_THRESHOLD ?? '10', 10);

  cron.schedule('*/15 * * * *', async () => {
    await runSafe('OTDR Detector Queda', async () => {
      const atual = await buscarEstadoPorOlt();
      for (const [olt, estado] of atual) {
        const anterior = snapshotAnterior.get(olt);
        if (anterior) {
          const delta = estado.fora - anterior.fora;
          if (delta >= SPIKE_THRESHOLD) {
            await enviarAlertaQueda(olt, estado, delta);
          }
        }
        snapshotAnterior.set(olt, { ...estado });
      }
    });
  }, { timezone: 'America/Sao_Paulo' });

  // ── OTDR: relatório de governança — todo dia 1 às 08h ────────────────────
  cron.schedule('0 8 1 * *', async () => {
    await runSafe('OTDR Relatório Governança', enviarRelatorioGovernanca);
  }, { timezone: 'America/Sao_Paulo' });

  logger.info(`[JOBS] OTDR: resumo às 07:00 | detector de queda a cada 15 min (threshold: +${parseInt(process.env.OTDR_SPIKE_THRESHOLD ?? '10', 10)} ONUs/OLT) | governança dia 1 às 08h.`);
}

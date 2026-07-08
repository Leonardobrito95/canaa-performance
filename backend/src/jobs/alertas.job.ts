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
import { buscarPiorasHoje, buscarEstadoPorOlt, EstadoOlt } from '../modules/otdr/otdr.service';
import { enviarResumoDiario, enviarAlertaQueda } from '../modules/otdr/otdr.alerts';
import { enviarRelatorioGovernanca } from '../modules/otdr/otdr.governance';

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
      await enviarResumoDiario(resumos);
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

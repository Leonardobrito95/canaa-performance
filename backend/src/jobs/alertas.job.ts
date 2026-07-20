import cron from 'node-cron';
import logger from '../config/logger';
import {
  alertaAssinaturaPendente,
  alertaFaturaNaoQuitada,
  alertaRetencaoMeta,
  alertaRetencaoFimMes,
  alertaAtendimentoVolumeAlto,
  alertaAtendimentoEscalonamentoAlto,
  alertaResumoDiarioCaio,
} from '../modules/alertas/alertas.service';
import { enviarRelatorioComercial } from '../modules/vendas/comissao-envio.service';
import { gerarSnapshot } from '../modules/vendas/snapshot.service';
import { buscarPiorasHoje, buscarPioresClientesHoje, buscarEstadoPorOlt, EstadoOlt } from '../modules/otdr/otdr.service';
import { enviarResumoDiario, enviarAlertaQueda, CausaCliente } from '../modules/otdr/otdr.alerts';
import { enviarRelatorioGovernanca } from '../modules/otdr/otdr.governance';
import { gerarDiagnosticoIndividual } from '../modules/diagnostico/diagnostico.service';
import { rodarAuditoriaRetencao } from '../modules/retencao/retencao.auditoria';
import { rodarRollupAtendimentoMensal, mesAnterior as mesAnteriorAtendimento } from '../modules/atendimento/atendimento.rollup';
import { rodarAnaliseIaEmMassa } from '../modules/atendimento/atendimento.analise-ia';
import { rodarMonitoriaAutomaticaEmMassa } from '../modules/atendimento/atendimento.monitoria-automatica';
import { rodarDeteccaoAlertasOperacionais } from '../modules/atendimento/atendimento.alertas-operacionais';
import { verificarEscalonamentoAlertas } from '../modules/atendimento/atendimento.alertas-escalonamento';
import { rodarDeteccaoAlertasVistoria } from '../modules/vistoriaPop/vistoria.alerta-detectores';

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
const LIMITE_AUDITORIA_RETENCAO = 200; // volume diário de O.S. de retenção é bem menor que isso — folga de sobra
// ~543 atendimentos de texto/dia medidos em produção (2026-07-11) — folga de
// segurança sobre isso, não é uma amostra, é um teto de proteção contra pico.
const LIMITE_ANALISE_IA_DIARIO = parseInt(process.env.LIMITE_ANALISE_IA_DIARIO ?? '700', 10);
// Só conta candidatos com identidade de agente resolvida com confiança, não o
// volume bruto do dia — bem menor que LIMITE_ANALISE_IA_DIARIO na prática.
const LIMITE_MONITORIA_AUTOMATICA_DIARIO = parseInt(process.env.LIMITE_MONITORIA_AUTOMATICA_DIARIO ?? '300', 10);

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
    await runSafe('Resumo Diário C.A.I.O.', alertaResumoDiarioCaio);

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

  // ── Retenção: auditoria de negociação real (IA + OpaSuite) — todo dia às 18h ──
  cron.schedule('0 18 * * *', async () => {
    await runSafe('Auditoria de Retenção', async () => {
      const resultado = await rodarAuditoriaRetencao({ limite: LIMITE_AUDITORIA_RETENCAO });
      logger.info(
        `[JOBS] Auditoria de Retenção: ${resultado.sucesso} classificados, ${resultado.falha} falhas, ` +
        `${resultado.divergencias} divergências nota-vs-OpaSuite (de ${resultado.totalEncontrados} encontrados).`
      );
    });
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('[JOBS] Auditoria de Retenção agendada — execução diária às 18:00 (Brasília).');

  // ── Atendimento: alertas de volume/escalonamento — todo dia às 20h ───────────
  // Tarde o bastante pro volume do dia não estar artificialmente baixo
  // (comparar volume às 8h distorceria o alerta).
  cron.schedule('0 20 * * *', async () => {
    await runSafe('Atendimento Volume Alto',        alertaAtendimentoVolumeAlto);
    await runSafe('Atendimento Escalonamento Alto', alertaAtendimentoEscalonamentoAlto);
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('[JOBS] Alertas de Atendimento agendados — execução diária às 20:00 (Brasília).');

  // ── Atendimento: rollup mensal de KPIs (snapshot pra tendência histórica no
  // chat de gestão) — todo dia 1 às 03h, cobre o mês que acabou de fechar.
  // Ver comentário do model AtendimentoKpiMensal no schema.prisma: calcular
  // TMA/TME/TMR ao vivo pra vários meses é caro demais pra rodar por pergunta.
  cron.schedule('0 3 1 * *', async () => {
    await runSafe('Rollup Mensal de Atendimento', async () => {
      const mes = mesAnteriorAtendimento();
      await rodarRollupAtendimentoMensal(mes);
      logger.info(`[JOBS] Rollup de Atendimento: mês ${mes} consolidado.`);
    });
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('[JOBS] Rollup Mensal de Atendimento agendado — todo dia 1 às 03:00 (Brasília).');

  // ── Atendimento: camada analítica de IA em massa (Motivo/Adesão ao
  // Script/Sentimento) — todo dia às 05h, processa os atendimentos de TEXTO
  // (exclui pabx) FECHADOS do dia anterior. Idempotente por
  // opasuite_atendimento_id — se não terminar na janela ou o cron rodar 2x,
  // nada se perde nem duplica, o resto fica pendente pro próximo dia. Ver
  // comentário do model AtendimentoAnaliseIa no schema.prisma: isso é sinal
  // de triagem, NUNCA nota oficial de QA.
  cron.schedule('0 5 * * *', async () => {
    await runSafe('Análise IA em Massa de Atendimento', async () => {
      const hoje = new Date();
      const inicioOntem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
      const fimOntem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1, 23, 59, 59, 999);
      const resultado = await rodarAnaliseIaEmMassa(inicioOntem, fimOntem, LIMITE_ANALISE_IA_DIARIO);
      logger.info(
        `[JOBS] Análise IA de Atendimento: ${resultado.processados} processados, ${resultado.falhas} falhas ` +
        `(de ${resultado.totalCandidatos} candidatos do dia).`
      );
    });
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('[JOBS] Análise IA em Massa de Atendimento agendada — execução diária às 05:00 (Brasília).');

  // ── Atendimento: monitoria de QA automática do CAIO (22 critérios) — 1h
  // depois da análise leve, pra ler flag_triagem já definitivo do dia e não
  // competir por rate-limit do Gemini na mesma janela. Cria a monitoria
  // OFICIAL sozinho só pra casos de baixo risco (identidade do agente
  // resolvida com confiança E sinais não indicam necessidade de olhar
  // humano) — todo o resto escala pra fila de Triagem IA. Protegido por
  // MONITORIA_AUTOMATICA_ATIVA (config/notificacoes.ts): com a flag off, só
  // loga o que teria acontecido, sem gravar nada.
  cron.schedule('0 6 * * *', async () => {
    await runSafe('Monitoria Automática do CAIO (22 critérios)', async () => {
      const hoje = new Date();
      const inicioOntem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
      const fimOntem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1, 23, 59, 59, 999);
      const r = await rodarMonitoriaAutomaticaEmMassa(inicioOntem, fimOntem, LIMITE_MONITORIA_AUTOMATICA_DIARIO);
      logger.info(
        `[JOBS] Monitoria Automática do CAIO: ${r.autoSalvos} auto-salvos, ${r.escaladosAposAvaliacao} escalados após avaliação, ` +
        `${r.identidadeNaoResolvida} escalados por identidade não resolvida, ${r.jaMonitorados} já monitorados, ${r.falhas} falhas ` +
        `(${r.avaliadosPelaIa} avaliados pela IA pesada de ${r.totalElegiveis} elegíveis, ${r.totalCandidatos} candidatos do dia).`
      );
    });
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('[JOBS] Monitoria Automática do CAIO agendada — execução diária às 06:00 (Brasília).');

  // ── Atendimento: alertas operacionais em tempo real (conversa parada, SLA
  // de fila, agente ausente, fila acumulada) — a cada 2 min. Feed interno
  // (GET /atendimento/alertas-operacionais). Alertas CRITICO (hoje só
  // SLA_FILA recente) escalam por WhatsApp pra gestora e depois diretoria —
  // ver atendimento.alertas-escalonamento.ts (fica off até
  // ESCALONAMENTO_WHATSAPP_ATIVO=true no .env).
  cron.schedule('*/2 * * * *', async () => {
    await runSafe('Alertas Operacionais de Atendimento', async () => {
      const r = await rodarDeteccaoAlertasOperacionais();
      const criados = r.conversasParadas.criados + r.slaFila.criados + r.agenteAusente.criados + r.filaAcumulada.criados;
      const resolvidos = r.conversasParadas.resolvidos + r.slaFila.resolvidos + r.agenteAusente.resolvidos + r.filaAcumulada.resolvidos;
      if (criados || resolvidos) {
        logger.info(`[JOBS] Alertas Operacionais: ${criados} aberto(s)/mantido(s), ${resolvidos} resolvido(s) automaticamente.`);
      }
    });
    await runSafe('Escalonamento WhatsApp de Alertas', async () => {
      const e = await verificarEscalonamentoAlertas();
      if (e.notificados || e.escalados) {
        logger.info(`[JOBS] Escalonamento WhatsApp: ${e.notificados} notificado(s) à gestora, ${e.escalados} escalado(s) à diretoria.`);
      }
    });
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('[JOBS] Alertas Operacionais de Atendimento agendados — execução a cada 2 minutos.');

  // ── Vistoria de POP: pendência de segurança aberta há muito tempo (Extintor/
  // Gerador/Banco de Baterias) e POP atrasado pra vistoria — diário, não a
  // cada 2 min como Atendimento, porque vistoria muda no ritmo de inspeção
  // (dias/semanas), não de conversa em tempo real. Feed interno (GET
  // /vistoria-pop/alertas), ver vistoria.alerta-detectores.ts.
  cron.schedule('0 6 * * *', async () => {
    await runSafe('Alertas de Vistoria de POP', async () => {
      const r = await rodarDeteccaoAlertasVistoria();
      const criados = r.pendenciaSeguranca.criados + r.popAtrasado.criados;
      const resolvidos = r.pendenciaSeguranca.resolvidos + r.popAtrasado.resolvidos;
      logger.info(`[JOBS] Alertas de Vistoria de POP: ${criados} aberto(s)/mantido(s), ${resolvidos} resolvido(s) automaticamente.`);
    });
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('[JOBS] Alertas de Vistoria de POP agendados — execução diária às 06:00 (Brasília).');
}

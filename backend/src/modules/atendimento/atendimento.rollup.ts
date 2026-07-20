import prisma from '../../config/prisma';
import { buscarKpisAtendimento } from './atendimento.repository';
import { SetorAtendimento, TODOS_SETORES } from './atendimento.types';

function limitesDoMes(mesReferencia: string): { inicio: Date; fim: Date } {
  const [ano, mes] = mesReferencia.split('-').map(Number);
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0, 23, 59, 59, 999);
  return { inicio, fim };
}

export function mesReferenciaDe(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

export function mesAnterior(): string {
  const hoje = new Date();
  return mesReferenciaDe(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
}

/// Pré-calcula e persiste os KPIs de atendimento de um mês FECHADO, por
/// setor — ver comentário do model AtendimentoKpiMensal no schema.prisma
/// pra motivação (agregação ao vivo é cara demais pra rodar a cada pergunta
/// de gestão). Idempotente (upsert por setor+mês), seguro rodar de novo.
export async function rodarRollupAtendimentoMensal(
  mesReferencia: string,
  setores: SetorAtendimento[] = TODOS_SETORES,
): Promise<void> {
  const { inicio, fim } = limitesDoMes(mesReferencia);
  for (const setor of setores) {
    const kpis = await buscarKpisAtendimento(setor, inicio, fim);
    await prisma.atendimentoKpiMensal.upsert({
      where: { setor_mes_referencia: { setor, mes_referencia: mesReferencia } },
      create: {
        setor,
        mes_referencia:        mesReferencia,
        volume:                kpis.volume,
        tma_ms:                kpis.tmaMs,
        tme_ms:                kpis.tmeMs,
        tmr_ms:                kpis.tmrMs,
        volume_chat:           kpis.volumeChat,
        volume_ligacao:        kpis.volumeLigacao,
        tma_ms_chat:           kpis.tmaMsChat,
        tme_ms_chat:           kpis.tmeMsChat,
        tma_ms_ligacao:        kpis.tmaMsLigacao,
        tme_ms_ligacao:        kpis.tmeMsLigacao,
        duracao_real_ligacao_ms: kpis.duracaoRealLigacaoMs,
        escalonamentos:        kpis.escalonamentos,
        pct_escalonamento:     kpis.pctEscalonamento,
        nota_media_satisfacao: kpis.notaMediaSatisfacao,
        qtd_avaliados:         kpis.qtdAvaliados,
      },
      update: {
        volume:                kpis.volume,
        tma_ms:                kpis.tmaMs,
        tme_ms:                kpis.tmeMs,
        tmr_ms:                kpis.tmrMs,
        volume_chat:           kpis.volumeChat,
        volume_ligacao:        kpis.volumeLigacao,
        tma_ms_chat:           kpis.tmaMsChat,
        tme_ms_chat:           kpis.tmeMsChat,
        tma_ms_ligacao:        kpis.tmaMsLigacao,
        tme_ms_ligacao:        kpis.tmeMsLigacao,
        duracao_real_ligacao_ms: kpis.duracaoRealLigacaoMs,
        escalonamentos:        kpis.escalonamentos,
        pct_escalonamento:     kpis.pctEscalonamento,
        nota_media_satisfacao: kpis.notaMediaSatisfacao,
        qtd_avaliados:         kpis.qtdAvaliados,
        calculado_em:          new Date(),
      },
    });
  }
}

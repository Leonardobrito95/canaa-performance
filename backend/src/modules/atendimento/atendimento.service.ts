import prisma from '../../config/prisma';
import {
  buscarKpisAtendimento,
  buscarAtendimentoPorProtocolo,
  buscarVolumeDiario,
  buscarRankingAtendentes,
  buscarMotivosAtendimento,
  buscarRankingAvaliacaoAtendentes,
  buscarKpisOperadoresAoVivo,
  buscarFilaAoVivo,
  buscarIndicadoresJornada,
  buscarConfigJornada,
} from './atendimento.repository';
import { auditarAtendimentoPontual } from './atendimento.ia';
import { SetorAtendimento, KpisAtendimento, RankingAtendenteEntry, MotivoAtendimentoEntry, RankingAvaliacaoEntry, TODOS_SETORES, OperadorAoVivo, IndicadorJornadaOperador, ConfigJornada } from './atendimento.types';

export interface SolicitanteAtendimento {
  ixcUserId:   string;
  ixcUsername: string;
}

/// KPIs brutos dos setores informados num período (todos os 9, se `setores`
/// não for passado) — alimenta tanto os cards das views dedicadas (Centro de
/// Solução e Comercial, cada uma passando seu próprio subconjunto) quanto o
/// contexto de gestão do C.A.I.O. (que não filtra, quer a visão completa).
export async function getResumoKpisAtendimento(dateFrom: Date, dateTo: Date, setores: SetorAtendimento[] = TODOS_SETORES): Promise<KpisAtendimento[]> {
  return Promise.all(setores.map((setor) => buscarKpisAtendimento(setor, dateFrom, dateTo)));
}

export interface RankingsAtendimento {
  atendentes: RankingAtendenteEntry[];
  avaliacoes: RankingAvaliacaoEntry[];
  motivos:    MotivoAtendimentoEntry[];
}

/// Ranking de atendentes (por volume), ranking de avaliações (CSAT) e top 
/// motivos de atendimento, somando os setores informados no período.
export async function getRankingsAtendimento(dateFrom: Date, dateTo: Date, setores?: SetorAtendimento[]): Promise<RankingsAtendimento> {
  const [atendentes, avaliacoes, motivos] = await Promise.all([
    buscarRankingAtendentes(dateFrom, dateTo, setores),
    buscarRankingAvaliacaoAtendentes(dateFrom, dateTo, setores),
    buscarMotivosAtendimento(dateFrom, dateTo, setores),
  ]);
  return { atendentes, avaliacoes, motivos };
}

export interface KpiAtendimentoMensal extends KpisAtendimento {
  mesReferencia: string;
}

/// Tendência histórica dos KPIs de atendimento — lê o snapshot mensal
/// pré-calculado (AtendimentoKpiMensal), não recalcula ao vivo no Mongo do
/// OpaSuite (custa dezenas de segundos por mês, inviável a cada pergunta do
/// chat de gestão — ver atendimento.rollup.ts). Só cobre meses FECHADOS; o
/// mês corrente vem separado, ao vivo, via getResumoKpisAtendimento.
export async function getKpisAtendimentoHistorico(meses = 6): Promise<KpiAtendimentoMensal[]> {
  const registros = await prisma.atendimentoKpiMensal.findMany({
    orderBy: { mes_referencia: 'desc' },
    take: meses * TODOS_SETORES.length,
  });
  return registros
    .map((r) => ({
      setor:               r.setor as SetorAtendimento,
      mesReferencia:       r.mes_referencia,
      volume:              r.volume,
      tmaMs:               r.tma_ms,
      tmeMs:               r.tme_ms,
      tmrMs:               r.tmr_ms,
      volumeChat:          r.volume_chat ?? 0,
      volumeLigacao:       r.volume_ligacao ?? 0,
      tmaMsChat:           r.tma_ms_chat,
      tmeMsChat:           r.tme_ms_chat,
      tmaMsLigacao:        r.tma_ms_ligacao,
      tmeMsLigacao:        r.tme_ms_ligacao,
      duracaoRealLigacaoMs: r.duracao_real_ligacao_ms,
      escalonamentos:      r.escalonamentos,
      pctEscalonamento:    r.pct_escalonamento,
      notaMediaSatisfacao: r.nota_media_satisfacao,
      qtdAvaliados:        r.qtd_avaliados,
    }))
    .sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia) || a.setor.localeCompare(b.setor));
}

export interface ComparativoVolumeHoje {
  setor:        SetorAtendimento;
  volumeHoje:   number;
  mediaAnterior: number | null; // média móvel dos dias anteriores no período consultado (exclui hoje)
  pctAcimaDaMedia: number | null;
}

/// Compara o volume de hoje contra a média dos últimos `diasHistorico` dias
/// anteriores (exclui hoje do cálculo da média, pra não diluir um pico do
/// próprio dia na própria referência de comparação) — usado pelo alerta de
/// volume anormal.
export async function getComparativoVolumeHoje(setor: SetorAtendimento, diasHistorico = 30): Promise<ComparativoVolumeHoje> {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const inicioHistorico = new Date(inicioHoje);
  inicioHistorico.setDate(inicioHistorico.getDate() - diasHistorico);

  const porDia = await buscarVolumeDiario(setor, inicioHistorico, hoje);
  const diaHojeStr = inicioHoje.toISOString().slice(0, 10);

  const volumeHoje = porDia.find((d) => d.dia === diaHojeStr)?.volume ?? 0;
  const anteriores = porDia.filter((d) => d.dia !== diaHojeStr);
  const mediaAnterior = anteriores.length
    ? anteriores.reduce((s, d) => s + d.volume, 0) / anteriores.length
    : null;

  return {
    setor,
    volumeHoje,
    mediaAnterior,
    pctAcimaDaMedia: mediaAnterior && mediaAnterior > 0
      ? Math.round(((volumeHoje - mediaAnterior) / mediaAnterior) * 1000) / 10
      : null,
  };
}

/// Auditoria pontual, sob demanda — gestor pede análise de 1 atendimento
/// específico. Não passa pela régua fixa da monitoria (isso é a contínua,
/// via cron); aqui é uma pergunta livre, síncrona, como o modo Consulta.
export async function auditarAtendimentoIndividual(
  protocolo: string,
  solicitante: SolicitanteAtendimento,
  pergunta?: string,
): Promise<{ texto: string; consultaId: string } | null> {
  const atendimento = await buscarAtendimentoPorProtocolo(protocolo);
  if (!atendimento) return null;

  const { texto, metricas } = await auditarAtendimentoPontual(atendimento, pergunta);

  const consulta = await prisma.diagnosticoConsulta.create({
    data: {
      tipo_alvo:      'ATENDIMENTO',
      id_alvo:        protocolo,
      pergunta:       pergunta ?? null,
      resposta:       texto,
      contexto_json:  atendimento as any,
      ixc_user_id:    solicitante.ixcUserId,
      ixc_username:   solicitante.ixcUsername,
      latencia_ms:    metricas.latenciaMs,
      tokens_entrada: metricas.tokensEntrada,
      tokens_saida:   metricas.tokensSaida,
      modelo_usado:   metricas.modeloUsado,
    },
  });

  return { texto, consultaId: consulta.id };
}

/// Tabela de operadores ao vivo — KPIs em tempo real dos operadores online,
/// focada na sala de controle (Dashboard de Atendimento).
export async function getOperadoresAoVivo(setores?: SetorAtendimento[]): Promise<OperadorAoVivo[]> {
  return buscarKpisOperadoresAoVivo(setores);
}

/// Quantidade de atendimentos aguardando na fila agora (status='AG'),
/// separado da tabela de operadores porque um atendimento na fila ainda não
/// tem operador atribuído. Pedido real da gestora do Centro de Solução.
export async function getFilaAoVivo(setores?: SetorAtendimento[]): Promise<number> {
  return buscarFilaAoVivo(setores);
}

/// Indicador de jornada por operador (RH/gestão) num período configurável —
/// tempo produtivo/pausa/ausente e volume atendido, diferente de
/// getOperadoresAoVivo (que é só o status atual, sem histórico).
export async function getIndicadoresJornada(dateFrom: Date, dateTo: Date, setores?: SetorAtendimento[]): Promise<IndicadorJornadaOperador[]> {
  return buscarIndicadoresJornada(dateFrom, dateTo, setores);
}

/// Limites de jornada configurados pela gestão (Regras de Negócio, categoria
/// ATENDIMENTO) — pra a tabela de jornada destacar visualmente quem passou
/// do limite de indisponibilidade ou ficou abaixo da meta de eficiência.
export async function getConfigJornada(): Promise<ConfigJornada> {
  return buscarConfigJornada();
}

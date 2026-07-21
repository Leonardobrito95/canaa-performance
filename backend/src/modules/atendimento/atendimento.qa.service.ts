import prisma from '../../config/prisma';
import {
  CRITERIOS_QA, PENALIZACOES_QA, CRITERIO_ERRO_CRITICO, classificarPontuacaoMedia,
  RespostaCriterio, CriterioQa, ResultadoPontuacaoQa, MonitoriaQaInput, FiltrosMonitoriaQa,
  CriterioNaoConformeResumo, MotivoQaResumo, AgenteQaRanking, OrigemMonitoriaQa,
  ORIGENS_MONITORIA_OFICIAL,
} from './atendimento.qa.types';
import { AGENTES_QA_EXCLUIDOS_RANKING } from '../../config/atendimentoExcecoes';

/// Calcula a pontuação de uma monitoria a partir das respostas dos 22
/// critérios — porta 1:1 o `calcular_pontuacao()` do sistema legado
/// (Monitoria_Server.py, linhas 326-350). Começa em 10.0; se o critério
/// crítico ("Omissão de atendimento") for "Não Conforme", zera tudo e
/// ignora o resto; senão, subtrai o peso de cada "Não Conforme"; nunca fica
/// abaixo de 0. "itensAplicaveis" conta quantos critérios foram Conforme OU
/// Não Conforme (exclui "Não se aplica").
export function calcularPontuacaoQa(criterios: Partial<Record<CriterioQa, RespostaCriterio>>): ResultadoPontuacaoQa {
  if (criterios[CRITERIO_ERRO_CRITICO] === 'Não Conforme') {
    return { pontuacao: 0, itensAplicaveis: 0, erroCritico: true };
  }

  let pontuacao = 10.0;
  let itensAplicaveis = 0;

  for (const criterio of CRITERIOS_QA) {
    const resposta = criterios[criterio];
    if (resposta === 'Não Conforme') {
      pontuacao -= PENALIZACOES_QA[criterio];
    }
    if (resposta === 'Conforme' || resposta === 'Não Conforme') {
      itensAplicaveis++;
    }
  }

  return { pontuacao: Math.max(0, Math.round(pontuacao * 100) / 100), itensAplicaveis, erroCritico: false };
}

export interface SolicitanteQa {
  ixcUserId: string;
}

const httpError = (msg: string, status: number) =>
  Object.assign(new Error(msg), { status });

/// Réplica do `verificar_protocolo_duplicado` do legado — só que agora é
/// checagem em código, não constraint de banco (protocolo não é mais unique,
/// ver comentário do model no schema.prisma: existem 2 colisões reais nos
/// dados históricos migrados). Verifica contra qualquer origem OFICIAL
/// vigente (humana ou automática do CAIO) — não bloqueia por causa de dado
/// antigo migrado ('legado'). Cobre duplicidade nos dois sentidos: CAIO não
/// sobrescreve uma monitoria que um humano já fez, humano não duplica uma
/// que o CAIO já criou sozinho.
export async function protocoloJaMonitorado(protocolo: string, excludeId?: string): Promise<boolean> {
  const existente = await prisma.atendimentoMonitoriaQa.findFirst({
    where: {
      protocolo,
      origem: { in: ORIGENS_MONITORIA_OFICIAL },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return !!existente;
}

function paraDadosPersistencia(input: MonitoriaQaInput, resultado: ResultadoPontuacaoQa) {
  return {
    protocolo:           input.protocolo,
    data_atendimento:    input.dataAtendimento,
    data_monitoria:       input.dataMonitoria,
    nome_agente:          input.nomeAgente,
    equipe:               input.equipe,
    motivo_atendimento:   input.motivoAtendimento ?? null,
    monitoria_zero:       input.monitoriaZero ?? null,
    avaliacao_atd:        input.avaliacaoAtd ?? null,
    observacoes:          input.observacoes ?? null,
    criterios:            input.criterios,
    pontuacao:            resultado.pontuacao,
    itens_aplicaveis:     resultado.itensAplicaveis,
    erro_critico:         resultado.erroCritico,
  };
}

export async function criarMonitoriaQa(
  input: MonitoriaQaInput,
  solicitante: SolicitanteQa,
  origem: OrigemMonitoriaQa = 'canaa_performance',
) {
  const resultado = calcularPontuacaoQa(input.criterios);
  return prisma.atendimentoMonitoriaQa.create({
    data: {
      ...paraDadosPersistencia(input, resultado),
      origem,
      avaliado_por:  solicitante.ixcUserId,
    },
  });
}

export async function atualizarMonitoriaQa(id: string, input: MonitoriaQaInput) {
  const resultado = calcularPontuacaoQa(input.criterios);
  return prisma.atendimentoMonitoriaQa.update({
    where: { id },
    data: paraDadosPersistencia(input, resultado),
  });
}

export async function buscarMonitoriaQaPorId(id: string) {
  return prisma.atendimentoMonitoriaQa.findUnique({ where: { id } });
}

function whereDeFiltros(filtros: FiltrosMonitoriaQa) {
  return {
    nome_agente:      filtros.agente || undefined,
    equipe:           filtros.equipe || undefined,
    origem:           filtros.origem || undefined,
    data_atendimento: (filtros.dateFrom || filtros.dateTo) ? {
      gte: filtros.dateFrom,
      lte: filtros.dateTo,
    } : undefined,
  };
}

export async function listarMonitoriasQa(filtros: FiltrosMonitoriaQa) {
  return prisma.atendimentoMonitoriaQa.findMany({
    where: whereDeFiltros(filtros),
    orderBy: { data_atendimento: 'desc' },
    take: 300,
  });
}

/// Equivalente ao `/api/criterios` do legado — quais critérios mais
/// reprovam, com os mesmos filtros da listagem.
export async function getResumoNaoConformesPorCriterio(filtros: FiltrosMonitoriaQa): Promise<CriterioNaoConformeResumo[]> {
  const registros = await prisma.atendimentoMonitoriaQa.findMany({
    where: whereDeFiltros(filtros),
    select: { criterios: true },
  });

  const contagem = new Map<CriterioQa, { naoConforme: number; total: number }>();
  for (const criterio of CRITERIOS_QA) contagem.set(criterio, { naoConforme: 0, total: 0 });

  for (const r of registros) {
    const criterios = r.criterios as Partial<Record<CriterioQa, RespostaCriterio>>;
    for (const criterio of CRITERIOS_QA) {
      const resposta = criterios[criterio];
      if (resposta !== 'Conforme' && resposta !== 'Não Conforme') continue;
      const acc = contagem.get(criterio)!;
      acc.total++;
      if (resposta === 'Não Conforme') acc.naoConforme++;
    }
  }

  return Array.from(contagem.entries())
    .filter(([, v]) => v.total > 0)
    .map(([criterio, v]) => ({
      criterio,
      naoConforme: v.naoConforme,
      total:       v.total,
      pct:         Math.round((v.naoConforme / v.total) * 1000) / 10,
    }))
    .sort((a, b) => b.naoConforme - a.naoConforme)
    .slice(0, 12);
}

/// Equivalente ao `/api/motivos` do legado — distribuição por motivo de
/// atendimento, com pontuação média de cada um.
export async function getDistribuicaoPorMotivo(filtros: FiltrosMonitoriaQa): Promise<MotivoQaResumo[]> {
  const registros = await prisma.atendimentoMonitoriaQa.findMany({
    where: whereDeFiltros(filtros),
    select: { motivo_atendimento: true, pontuacao: true },
  });

  const acc = new Map<string, { total: number; soma: number; qtdComNota: number }>();
  for (const r of registros) {
    const motivo = r.motivo_atendimento || 'Não informado';
    if (!acc.has(motivo)) acc.set(motivo, { total: 0, soma: 0, qtdComNota: 0 });
    const item = acc.get(motivo)!;
    item.total++;
    if (r.pontuacao !== null) { item.soma += r.pontuacao; item.qtdComNota++; }
  }

  return Array.from(acc.entries())
    .map(([motivo, v]) => ({
      motivo,
      total: v.total,
      media: v.qtdComNota ? Math.round((v.soma / v.qtdComNota) * 100) / 100 : null,
    }))
    .sort((a, b) => b.total - a.total);
}

/// Ranking de agentes pela nota REAL de QA humano (não mais amostra de IA) —
/// alimenta tanto o dashboard nativo quanto o contexto de gestão do C.A.I.O.
/// Exclui "APRIMORAR" (terceirizada agregada, não é 1 pessoa) e "TESTE".
export async function getRankingAgentesPorQualidade(filtros: FiltrosMonitoriaQa, minimoAvaliacoes = 15): Promise<AgenteQaRanking[]> {
  const registros = await prisma.atendimentoMonitoriaQa.findMany({
    where: {
      ...whereDeFiltros(filtros),
      nome_agente: { notIn: AGENTES_QA_EXCLUIDOS_RANKING },
      pontuacao: { not: null },
    },
    select: { nome_agente: true, equipe: true, pontuacao: true },
  });

  const acc = new Map<string, { equipe: string; soma: number; qtd: number }>();
  for (const r of registros) {
    if (!acc.has(r.nome_agente)) acc.set(r.nome_agente, { equipe: r.equipe, soma: 0, qtd: 0 });
    const item = acc.get(r.nome_agente)!;
    item.soma += r.pontuacao!;
    item.qtd++;
  }

  return Array.from(acc.entries())
    .filter(([, v]) => v.qtd >= minimoAvaliacoes)
    .map(([nomeAgente, v]) => {
      const pontuacaoMedia = Math.round((v.soma / v.qtd) * 100) / 100;
      return {
        nomeAgente,
        equipe: v.equipe,
        qtd: v.qtd,
        pontuacaoMedia,
        classificacao: classificarPontuacaoMedia(pontuacaoMedia),
      };
    })
    .sort((a, b) => b.pontuacaoMedia - a.pontuacaoMedia);
}

export async function listarAgentesAtivos() {
  return prisma.atendimentoAgenteQa.findMany({
    where: { status: 'Ativo' },
    orderBy: { nome: 'asc' },
  });
}

export async function listarEquipesQa(): Promise<string[]> {
  const agentes = await prisma.atendimentoAgenteQa.findMany({
    where: { status: 'Ativo' },
    select: { equipe: true },
    distinct: ['equipe'],
  });
  return agentes.map((a) => a.equipe).sort();
}

/// Resolve o próprio agente logado pelo `ixc_user_id` — base de toda a
/// checagem de identidade do fluxo de "ciência" (nunca confiar em nome vindo
/// do corpo da requisição, sempre partir do usuário autenticado).
export async function buscarAgenteQaPorIxcUserId(ixcUserId: string) {
  return prisma.atendimentoAgenteQa.findFirst({
    where: { ixc_user_id: ixcUserId, status: 'Ativo' },
  });
}

export async function listarMinhasAvaliacoes(nomeAgente: string) {
  return prisma.atendimentoMonitoriaQa.findMany({
    where: { nome_agente: nomeAgente },
    orderBy: { data_atendimento: 'desc' },
    take: 300,
  });
}

/// Registra a "ciência" do agente numa avaliação — só o próprio agente
/// avaliado pode dar ciência na própria nota (`nomeAgente` já resolvido a
/// partir do `ixc_user_id` autenticado, nunca de um id solto no path).
export async function darCienciaMonitoria(id: string, nomeAgente: string, comentario?: string) {
  const monitoria = await prisma.atendimentoMonitoriaQa.findUnique({ where: { id } });
  if (!monitoria) {
    throw httpError('Avaliação não encontrada.', 404);
  }
  if (monitoria.nome_agente !== nomeAgente) {
    throw httpError('Você só pode dar ciência na própria avaliação.', 403);
  }
  return prisma.atendimentoMonitoriaQa.update({
    where: { id },
    data: { comunicado_em: new Date(), comunicado_nota: comentario ?? null },
  });
}

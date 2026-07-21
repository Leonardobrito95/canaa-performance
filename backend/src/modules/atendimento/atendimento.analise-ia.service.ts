import prisma from '../../config/prisma';

/// Consultas + escrita leve sobre a camada analítica de IA
/// (atendimento_analise_ia) pro frontend. O processamento em si (chamar
/// Gemini, gravar o resultado da análise) fica em atendimento.analise-ia.ts,
/// mesma separação já usada no módulo de QA (atendimento.qa.service.ts =
/// consulta + escrita leve, atendimento.qa.ia.ts = IA).

export interface FiltrosAnaliseIa {
  setor?:     string;
  /// Grupo de setores (ex: SETORES_CENTRO_SOLUCAO) — usado pela tela de
  /// Monitoria de Qualidade pra não misturar setor de Comercial (VENDAS/
  /// POS_VENDAS) no dashboard/triagem, que hoje só cobre Centro de Solução.
  /// Sem isso, `atendimento_analise_ia` (que cobre os 9 setores) aparecia
  /// inteiro ali, incluindo VENDAS — mesma classe de mistura já corrigida no
  /// resumo de KPIs (ver atendimento.controller.ts).
  setores?:   string[];
  dateFrom?:  Date;
  dateTo?:    Date;
}

function whereDeFiltros(filtros: FiltrosAnaliseIa) {
  return {
    setor:            filtros.setores?.length ? { in: filtros.setores } : (filtros.setor || undefined),
    data_atendimento: (filtros.dateFrom || filtros.dateTo) ? {
      gte: filtros.dateFrom,
      lte: filtros.dateTo,
    } : undefined,
  };
}

/// Fila de triagem pro QA humano: só os casos flagados, piores primeiro
/// (adesão baixa e sentimento ruim no topo) — não é lista completa do
/// volume processado, é só o que merece olhar humano.
export async function getFilaDeTriagem(filtros: FiltrosAnaliseIa, limite = 50) {
  return prisma.atendimentoAnaliseIa.findMany({
    where: { ...whereDeFiltros(filtros), flag_triagem: true },
    orderBy: [{ adesao_script: 'asc' }, { indice_sentimento: 'asc' }],
    take: limite,
  });
}


export interface SentimentoPorSetor {
  setor:            string;
  qtd:              number;
  sentimentoMedio:  number | null;
  adesaoMedia:      number | null;
}

export interface MotivoIaResumo {
  motivo: string;
  qtd:    number;
}

/// Agregações pro dashboard — NÃO inclui TMA (isso já existe em
/// getResumoKpisAtendimento, atendimento.service.ts). O cruzamento TMA x
/// Sentimento é feito no frontend combinando as duas fontes, cada uma
/// mantida na sua origem em vez de duplicar a query de TMA aqui.
export async function getResumoPorSetor(filtros: FiltrosAnaliseIa): Promise<SentimentoPorSetor[]> {
  const registros = await prisma.atendimentoAnaliseIa.findMany({
    where: { ...whereDeFiltros(filtros), confianca_insuficiente: false },
    select: { setor: true, indice_sentimento: true, adesao_script: true },
  });

  const acc = new Map<string, { qtd: number; somaSentimento: number; qtdSentimento: number; somaAdesao: number; qtdAdesao: number }>();
  for (const r of registros) {
    if (!acc.has(r.setor)) acc.set(r.setor, { qtd: 0, somaSentimento: 0, qtdSentimento: 0, somaAdesao: 0, qtdAdesao: 0 });
    const item = acc.get(r.setor)!;
    item.qtd++;
    if (r.indice_sentimento !== null) { item.somaSentimento += r.indice_sentimento; item.qtdSentimento++; }
    if (r.adesao_script !== null) { item.somaAdesao += r.adesao_script; item.qtdAdesao++; }
  }

  return Array.from(acc.entries()).map(([setor, v]) => ({
    setor,
    qtd: v.qtd,
    sentimentoMedio: v.qtdSentimento ? Math.round((v.somaSentimento / v.qtdSentimento) * 100) / 100 : null,
    adesaoMedia:     v.qtdAdesao ? Math.round((v.somaAdesao / v.qtdAdesao) * 100) / 100 : null,
  }));
}

/// Ranking de motivos CLASSIFICADOS PELA IA — separado do ranking existente
/// vindo direto do OpaSuite (buscarMotivosAtendimento, atendimento.repository.ts),
/// não misturar as duas fontes.
export async function getRankingMotivosIa(filtros: FiltrosAnaliseIa, limite = 10): Promise<MotivoIaResumo[]> {
  const registros = await prisma.atendimentoAnaliseIa.findMany({
    where: { ...whereDeFiltros(filtros), motivo_classificado: { not: null } },
    select: { motivo_classificado: true },
  });

  const acc = new Map<string, number>();
  for (const r of registros) {
    const motivo = r.motivo_classificado!;
    acc.set(motivo, (acc.get(motivo) ?? 0) + 1);
  }

  return Array.from(acc.entries())
    .map(([motivo, qtd]) => ({ motivo, qtd }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, limite);
}

/// Alterna a flag de "revisão manual" — persistida (não é estado de sessão),
/// setada explicitamente pelo QA na fila de Triagem IA quando ele quer
/// avaliar sem viés da sugestão do CAIO (ver revisao_manual no
/// schema.prisma). O frontend (abrirAvaliacaoDeTriagem, MonitoriaQaView.vue)
/// respeita essa flag pra não chamar o copiloto.
export async function marcarRevisaoManual(id: string, valor: boolean) {
  return prisma.atendimentoAnaliseIa.update({
    where: { id },
    data: { revisao_manual: valor },
  });
}

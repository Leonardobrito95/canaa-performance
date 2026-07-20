import {
  buscarRankingVendedores,
  buscarEvolucaoVendas,
  buscarStatusPops,
} from './diagnostico.repository';
import { buscarPioresClientesHoje, ClienteDegradadoHoje } from '../otdr/otdr.service';
import { getResumoAuditoriaRetencao, getRetencao, ResumoAuditoriaRetencao, RetencaoKpis } from '../retencao/retencao.service';
import {
  getResumoKpisAtendimento,
  getRankingsAtendimento,
  getKpisAtendimentoHistorico,
  getIndicadoresJornada,
  RankingsAtendimento,
  KpiAtendimentoMensal,
} from '../atendimento/atendimento.service';
import { getResumoNaoConformesPorCriterio, getRankingAgentesPorQualidade } from '../atendimento/atendimento.qa.service';
import { CriterioNaoConformeResumo, AgenteQaRanking } from '../atendimento/atendimento.qa.types';
import { getResumoPorSetor, getRankingMotivosIa, SentimentoPorSetor, MotivoIaResumo } from '../atendimento/atendimento.analise-ia.service';
import { KpisAtendimento, IndicadorJornadaOperador, SetorAtendimento } from '../atendimento/atendimento.types';
import { getKpis as getPosAtivacaoKpis } from '../posativacao/posativacao.service';
import { PosAtivacaoKpis } from '../posativacao/posativacao.types';
import { buscarPendenciasAbertas } from '../vistoriaPop/vistoriaPop.repository';
import { VistoriaPendencia } from '../vistoriaPop/vistoriaPop.types';
import { listarAlertasHub } from '../alertasHub/alertasHub.service';
import { AlertaHubItem } from '../alertasHub/alertasHub.types';
import { RankingVendedorEntry, EvolucaoMensalEntry, PopStatusEntry, PiorSinalAgora } from './diagnostico.types';

/// Registry de fontes de dados do chat de gestão (C.A.I.O.) — mesmo princípio
/// já provado nesta sessão com SETORES_ATENDIMENTO (atendimento.types.ts):
/// cada fonte é 1 entrada autocontida (busca + formatação + fallback + regra
/// de prompt), iterada por gerarRespostaGestaoIndividual (diagnostico.service.ts)
/// e montarContextoGestaoTextual (diagnostico.prompt.ts) em vez de espalhada
/// num Promise.all + parâmetros posicionais + texto manual. Adicionar uma
/// fonte nova (ex: quando Campo/Estoque tiverem dado nativo) é 1 entrada
/// aqui, não editar 3-4 lugares em 2 arquivos.

export interface JanelaTemporalGestao {
  hoje: Date;
  inicioMes: Date;
  inicioUltimos3Meses: Date;
}

export interface DadosGestao {
  ranking:               RankingVendedorEntry[];
  evolucao:               EvolucaoMensalEntry[];
  statusRede:             { pops: PopStatusEntry[]; piorGeral: PiorSinalAgora | null };
  pioresClientes:         ClienteDegradadoHoje[];
  retencaoMes:             RetencaoKpis | null;
  auditoriaRetencao:       ResumoAuditoriaRetencao | null;
  kpisAtendimento:         KpisAtendimento[] | null;
  monitoriaAtendimento:    { criterios: CriterioNaoConformeResumo[]; ranking: AgenteQaRanking[] } | null;
  rankingsAtendimento:     RankingsAtendimento | null;
  historicoAtendimento:    KpiAtendimentoMensal[] | null;
  analiseIaAtendimento:    { porSetor: SentimentoPorSetor[]; motivos: MotivoIaResumo[] } | null;
  posAtivacaoKpis:         PosAtivacaoKpis | null;
  vistoriaPendencias:      VistoriaPendencia[];
  indicadoresJornada:      IndicadorJornadaOperador[] | null;
  alertasHub:              AlertaHubItem[] | null;
}

export interface FonteGestao<T = any> {
  chave:        keyof DadosGestao;
  buscar:       (janela: JanelaTemporalGestao) => Promise<T>;
  /// Default de formatação (quando a chave não veio em `dados`) E fallback
  /// de erro (quando `resiliente` está setado e `buscar` rejeita).
  valorVazio:   T;
  /// Presente = engole erro (logger.warn + valorVazio). Ausente = propaga
  /// (deixa a resposta inteira falhar) — hoje só ranking/evolução propagam,
  /// preservar essa distinção, não generalizar "sempre engolir erro".
  resiliente?:  { logErroMsg: string };
  /// Normalmente 1 bloco de texto por fonte; "statusRede" tem 2 (pops e
  /// piorGeral vêm de 1 fetch só, mas viram 2 seções no contexto).
  blocos:       { titulo: string; formatar: (dados: T) => string }[];
  /// Regra específica dessa fonte pro system prompt — regras COMPARATIVAS
  /// entre fontes diferentes ficam de fora daqui (ver REGRA_* no
  /// diagnostico.prompt.ts), pra não perder a moldura "não confunda X com Y".
  regraPrompt?: string;
  /// Extrai a parte tabular do dado dessa fonte pra virar planilha (ver
  /// diagnostico.relatorios.ts) — ausente = fonte não exporta em Excel (só
  /// PDF, que reaproveita `blocos` de graça pra qualquer fonte). Pra fontes
  /// compostas (objeto com mais de uma lista), escolhe a lista mais
  /// "relatório" das partes; pra objeto único de KPI, embrulha em array de
  /// 1 linha.
  paraExcel?:   (dados: T) => Record<string, any>[];
}

function fmtDuracao(ms: number | null): string {
  if (ms === null) return 'sem dado';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}min`;
}

/// Pra durações longas (jornada — pode passar de 1 dia), diferente de
/// fmtDuracao (pensado pra TMA/TME/TMR, sempre minutos/segundos) — mesma
/// lógica de formatarHoras em IndicadorJornadaTable.vue, duplicada aqui
/// porque uma é componente Vue (frontend) e essa é usada na exportação
/// (backend, Excel/PDF) — sem código compartilhável entre os dois hoje.
function fmtHorasLongas(ms: number): string {
  if (ms <= 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return `${h}h${m > 0 ? `${m}min` : ''}`;
  const d = Math.floor(h / 24);
  const hRestante = h % 24;
  return `${d}d${hRestante > 0 ? ` ${hRestante}h` : ''}`;
}

function formatarRankingVendedores(ranking: RankingVendedorEntry[]): string {
  if (!ranking.length) return 'Sem dados de vendedores nos snapshots disponíveis.';
  return ranking.map((r) =>
    `- ${r.mesReferencia} | ${r.nomeVendedor} | ${r.qtdContratos} contratos | ativos R$${r.valorAtivos.toFixed(2)} | liberado R$${r.valorLiberado.toFixed(2)}`
  ).join('\n');
}

function formatarEvolucaoVendas(evolucao: EvolucaoMensalEntry[]): string {
  if (!evolucao.length) return 'Sem dados de evolução de vendas nos snapshots disponíveis.';
  return evolucao.map((e) =>
    `- ${e.mesReferencia} | ${e.segmento} | ${e.qtdContratos} contratos | ativos R$${e.valorAtivos.toFixed(2)} | liberado R$${e.valorLiberado.toFixed(2)}`
  ).join('\n');
}

function formatarStatusPops(pops: PopStatusEntry[]): string {
  if (!pops.length) return 'Sem dados de POPs disponíveis agora.';
  return pops.map((p) => {
    const emAlerta = p.critico + p.foraDeOperacao;
    const pct = p.totalOnus > 0 ? ((emAlerta / p.totalOnus) * 100).toFixed(0) : '0';
    return `- ${p.pop} | ${p.totalOnus} ONUs | Em alerta (crítico + fora de operação): ${emAlerta} (${pct}%) | ` +
      `detalhe: Normal ${p.normal}, Atenção ${p.atencao}, Crítico ${p.critico}, Fora de operação ${p.foraDeOperacao}, Sem leitura ${p.semLeitura}` +
      (p.piorSinalRx !== null ? ` | Pior sinal: ${p.piorSinalRx.toFixed(2)}dBm` : '');
  }).join('\n');
}

function formatarPiorGeral(piorGeral: PiorSinalAgora | null): string {
  if (!piorGeral) return 'Sem leitura de sinal disponível agora.';
  return `${piorGeral.nome} (cliente #${piorGeral.clienteId}) | POP ${piorGeral.pop} | OLT ${piorGeral.olt} | ${piorGeral.sinalRx.toFixed(2)}dBm`;
}

function formatarPioresClientes(clientes: ClienteDegradadoHoje[]): string {
  if (!clientes.length) return 'Nenhum cliente com piora de sinal registrada hoje.';
  return clientes.map((c) =>
    `- ${c.nome} (cliente #${c.idCliente}) | OLT ${c.olt} | RX hoje ${c.rxHoje.toFixed(2)}dBm (era ${c.rxAnterior.toFixed(2)}dBm)`
  ).join('\n');
}

/// Volume operacional do mês em andamento (dia 1 até hoje) — quantas O.S. de
/// retenção foram tratadas/retidas, taxa de reversão, comissão gerada. Isso é
/// bruto do IXC (id_su_diagnostico), diferente da auditoria de qualidade abaixo.
///
/// Tratadas != Retidas + Não retidas: existe um 3º grupo ("sem interação do
/// cliente", diagnósticos tipo "FALTA DE INTERAÇÃO", ver NAO_RETIDO_IDS/
/// RETIDO_IDS em retencao.repository.ts) que conta em tratadas mas não entra
/// em nenhum dos dois — de propósito, já que não houve negociação real pra
/// classificar. Sem deixar esse 3º número explícito aqui, a IA (ou quem lê o
/// resumo) pode achar que os números "não fecham" (achado do usuário
/// 2026-07-14, ao ver 134 tratadas vs 20+98=118 num resumo diário).
function formatarRetencaoMes(kpis: RetencaoKpis | null): string {
  if (!kpis) return 'Sem dados de retenção disponíveis para o mês em andamento.';
  if (kpis.totalTratadas === 0) return 'Nenhuma O.S. de retenção tratada ainda neste mês.';
  const semInteracao = kpis.totalTratadas - kpis.totalRetidas - kpis.totalNaoRetidas;
  return [
    `Tratadas: ${kpis.totalTratadas} | Retidas: ${kpis.totalRetidas} | Não retidas: ${kpis.totalNaoRetidas} | ` +
    `Sem interação do cliente (não conta pra taxa): ${semInteracao} | ` +
    `Taxa de reversão: ${kpis.pctReversaoGeral}% (retidas ÷ tratadas) | Comissão gerada: R$${kpis.totalComissoes.toFixed(2)} | ` +
    `Operadoras que bateram meta: ${kpis.operadoresNaMeta}`,
  ].join('\n');
}

/// Auditoria de retenção é um trabalho de fundo incremental (script separado,
/// não roda a cada pergunta) — por isso o contexto sempre deixa claro quantas
/// O.S. já foram auditadas vs. quantas ainda faltam, pra IA nunca tratar a
/// amostra parcial como se fosse o total.
function formatarAuditoriaRetencao(auditoria: ResumoAuditoriaRetencao | null): string {
  if (!auditoria || auditoria.totalGeralClassificado === 0) {
    return 'Nenhuma O.S. de retenção auditada ainda (rotina de auditoria não rodou ou está no início).';
  }
  const linhas = auditoria.porOperador.map((o) =>
    `- ${o.nomeOperador} | auditadas: ${o.totalClassificado} | negociação real: ${o.negociacaoReal} | sem negociação: ${o.semNegociacao} | indefinido: ${o.indefinido} | divergências: ${o.divergencias}`
  );

  const linhasDivergencias = auditoria.divergenciasRecentes.length
    ? auditoria.divergenciasRecentes.map((d) =>
        `- O.S. #${d.idChamado} | ${d.nomeOperador} | IXC: ${d.resultadoIxc} | ${d.classificacao} | ${d.divergencia}`
      ).join('\n')
    : '(nenhuma divergência encontrada até agora)';

  return [
    `Total de O.S. de retenção no IXC: ${auditoria.totalGeralOsRetencao}. ` +
    `Já auditadas (classificadas por IA lendo a conversa, cruzada com o OpaSuite quando disponível): ${auditoria.totalGeralClassificado}. ` +
    `Ainda não auditadas: ${auditoria.totalGeralPendente} (a auditoria roda incrementalmente, não é o total ainda).`,
    ...linhas,
    '',
    'Divergências recentes entre a nota da O.S. (escrita pelo operador) e a conversa real do OpaSuite (até 10 mais recentes):',
    linhasDivergencias,
  ].join('\n');
}

function formatarKpisAtendimento(kpis: KpisAtendimento[] | null): string {
  if (!kpis || !kpis.length) return 'Sem dados de atendimento disponíveis para o mês em andamento.';
  return kpis.map((k) => {
    const nota = k.notaMediaSatisfacao !== null ? `${k.notaMediaSatisfacao}/5 (${k.qtdAvaliados} avaliações)` : 'sem avaliações suficientes';
    const escalonamento = k.setor === 'N1'
      ? ` | Escalonado pra N2: ${k.escalonamentos} (${k.pctEscalonamento ?? 0}%)`
      : '';
    // TME/TMA misturam chat+ligação no valor agregado — ligação tem espera
    // ~0 por definição (o atendente abre manualmente), então distorce pra
    // baixo quando o setor tem volume relevante de ligação. Só mostra a
    // quebra por canal quando há ligação de verdade no período.
    const quebraCanal = k.volumeLigacao > 0
      ? ` (chat: TME ${fmtDuracao(k.tmeMsChat)}, TMA ${fmtDuracao(k.tmaMsChat)} | ligação: TME ${fmtDuracao(k.tmeMsLigacao)}, TMA ${fmtDuracao(k.tmaMsLigacao)}, volume ${k.volumeChat} chat / ${k.volumeLigacao} ligação)`
      : '';
    return `- ${k.setor} | Volume: ${k.volume} | TMR (tempo que o atendente HUMANO demora pra responder uma mensagem do cliente NO CHAT, nunca conta URA/IZA — ligação não tem essa métrica): ${fmtDuracao(k.tmrMs)} | ` +
      `TME (espera em fila/URA/IZA até um humano assumir, chat+ligação): ${fmtDuracao(k.tmeMs)} | TMA (tempo com o atendente humano, chat+ligação): ${fmtDuracao(k.tmaMs)}${quebraCanal} | ` +
      `Satisfação: ${nota}${escalonamento}`;
  }).join('\n');
}

/// Monitoria de qualidade por QA HUMANO (incorporada do sistema legado,
/// 22 critérios ponderados) — fonte de verdade de qualidade, não é mais
/// amostra de IA solta. Cobre hoje só SAC/Suporte N2/Retenção (herança dos
/// dados migrados) — não inventar cobertura pros outros setores.
function formatarCriteriosNaoConformesQa(criterios: CriterioNaoConformeResumo[]): string {
  if (!criterios.length) return 'Sem avaliações de QA humano no período.';
  return criterios.map((c) => `- ${c.criterio}: ${c.naoConforme}/${c.total} (${c.pct}%) reprovados`).join('\n');
}

/// Ranking de agentes pela nota REAL de QA humano (0-10, ponderada por
/// critério) — diferente do ranking de atendentes por VOLUME (mais abaixo).
function formatarRankingQualidadeQa(ranking: AgenteQaRanking[]): string {
  if (!ranking.length) return 'Sem agentes com avaliações suficientes (mínimo 15) no período pra um ranking confiável.';
  return ranking.map((r, i) =>
    `${i + 1}. ${r.nomeAgente} (${r.equipe}) — nota média ${r.pontuacaoMedia}/10, classificação "${r.classificacao}", ${r.qtd} avaliações`
  ).join('\n');
}

/// Ranking de atendentes por VOLUME (não é nota de qualidade — não existe
/// cruzamento entre monitoria/satisfação e atendente individual hoje) e top
/// motivos de atendimento, somando os setores nos últimos meses.
function formatarRankingsAtendimento(rankings: RankingsAtendimento | null): string {
  if (!rankings || (!rankings.atendentes.length && !rankings.motivos.length)) {
    return 'Sem dados de ranking de atendentes/motivos disponíveis.';
  }
  const linhasAtendentes = rankings.atendentes.length
    ? rankings.atendentes.map((a, i) => `${i + 1}. ${a.nome} — ${a.qtd} atendimentos`).join('\n')
    : '(sem dados)';
  const linhasMotivos = rankings.motivos.length
    ? rankings.motivos.map((m, i) => `${i + 1}. ${m.motivo} — ${m.qtd} ocorrências`).join('\n')
    : '(sem dados)';
  return [
    'Atendentes com mais atendimentos (ranking por VOLUME, não é ranking de qualidade/nota):',
    linhasAtendentes,
    '',
    'Motivos de atendimento mais frequentes:',
    linhasMotivos,
  ].join('\n');
}

/// Camada analítica de IA em massa (Motivo/Adesão ao Script/Sentimento) —
/// processa quase todo o volume de TEXTO (não amostra), mas é SINAL DE
/// TRIAGEM gerado por IA que ninguém revisou ainda, nunca confundir com a
/// nota real de QA humano (fonte "monitoriaAtendimento" acima).
function formatarAnaliseIaPorSetor(porSetor: SentimentoPorSetor[]): string {
  if (!porSetor.length) return 'Sem dado da análise de IA em massa no período (job noturno ainda não rodou ou não há atendimento de texto processado).';
  return porSetor.map((s) =>
    `- ${s.setor}: sentimento médio do cliente ${s.sentimentoMedio ?? 'sem dado'} (escala -1 a 1), adesão média ao script do atendente ${s.adesaoMedia ?? 'sem dado'}/10, ${s.qtd} atendimento(s) analisados`
  ).join('\n');
}

function formatarMotivosIa(motivos: MotivoIaResumo[]): string {
  if (!motivos.length) return 'Sem motivos classificados pela IA no período.';
  return motivos.map((m, i) => `${i + 1}. ${m.motivo} — ${m.qtd} ocorrências`).join('\n');
}

/// Indicador de qualidade de instalação/campo — % de clientes que abriram
/// ticket de suporte nos primeiros 30 dias após ativar o contrato. Portado
/// do sistema Pós-Ativação (porta 5009, ver posativacao.repository.ts).
function formatarPosAtivacaoKpis(kpis: PosAtivacaoKpis | null): string {
  if (!kpis) return 'Sem dado de pós-ativação disponível.';
  const deltaTxt = kpis.deltaPct !== null
    ? ` (${kpis.deltaPct >= 0 ? '+' : ''}${kpis.deltaPct} p.p. vs período anterior equivalente)`
    : '';
  return `${kpis.total} clientes ativaram contrato (instalação ou mudança de endereço) nos últimos ` +
    `${kpis.janela} dias. Desses, ${kpis.comContato} (${kpis.pct}%) abriram pelo menos 1 ticket de ` +
    `suporte dentro de 30 dias da ativação${deltaTxt}. Tempo médio até o 1º contato: ${kpis.mediaDias} dia(s).`;
}

/// Pendências abertas da Vistoria de POP (porta 5002, ver
/// vistoriaPop.repository.ts) — checklist de inspeção técnica (rack,
/// gerador, baterias, ar-condicionado, extintor). NÃO cruzado com saúde de
/// rede (STATUS DE POPS AGORA, fonte statusRede) — o nome do POP não bate
/// entre os dois sistemas de forma direta (ex: OTDR usa "POP AGUAS CLARAS",
/// Vistoria usa "aguas-claras", e a Vistoria tem 1 POP a mais que nunca
/// apareceu no OTDR) — checado empiricamente 2026-07-13, não tratar como o
/// mesmo POP sem confirmar o nome primeiro.
function formatarVistoriaPendencias(pendencias: VistoriaPendencia[]): string {
  if (!pendencias.length) return 'Nenhuma pendência de vistoria em aberto.';
  const porPop = new Map<string, VistoriaPendencia[]>();
  for (const p of pendencias) {
    if (!porPop.has(p.popName)) porPop.set(p.popName, []);
    porPop.get(p.popName)!.push(p);
  }
  return Array.from(porPop.entries()).map(([pop, itens]) =>
    `- POP ${pop}: ${itens.length} pendência(s) — ` +
    itens.map((i) => `${i.categoria} (${i.diasAberta ?? '?'}d aberta)`).join(', ')
  ).join('\n');
}

/// Tendência histórica mensal — snapshot pré-calculado (AtendimentoKpiMensal),
/// só cobre meses JÁ FECHADOS. O mês corrente vem à parte, nos "KPIS BRUTOS
/// DO MES EM ANDAMENTO", sempre ao vivo.
function formatarHistoricoAtendimento(historico: KpiAtendimentoMensal[] | null): string {
  if (!historico || !historico.length) {
    return 'Sem histórico mensal consolidado ainda (rollup roda no dia 1 de cada mês, cobrindo o mês anterior).';
  }
  return historico.map((k) => {
    const nota = k.notaMediaSatisfacao !== null ? `${k.notaMediaSatisfacao}/5` : 'sem avaliações suficientes';
    const escalonamento = k.setor === 'N1' ? ` | Escalonado pra N2: ${k.escalonamentos} (${k.pctEscalonamento ?? 0}%)` : '';
    return `- ${k.mesReferencia} | ${k.setor} | Volume: ${k.volume} | TMR: ${fmtDuracao(k.tmrMs)} | ` +
      `TME: ${fmtDuracao(k.tmeMs)} | TMA: ${fmtDuracao(k.tmaMs)} | Satisfação: ${nota}${escalonamento}`;
  }).join('\n');
}

/// Jornada por operador (tempo produtivo/pausa/ausente + eficiência), mês em
/// andamento, TODOS os setores. Resume por setor (senão a lista de dezenas de
/// operadores estouraria o contexto) e destaca os 10 com maior % de ausência,
/// que é o sinal mais acionável pra gestão saber com quem conversar. Cobre
/// qualquer operador ativo no OpaSuite, inclusive equipe terceirizada.
function formatarIndicadoresJornada(indicadores: IndicadorJornadaOperador[] | null): string {
  if (!indicadores || !indicadores.length) {
    return 'Sem dados de jornada disponíveis para o mês em andamento.';
  }

  const porSetor = new Map<SetorAtendimento, { volume: number; produtivoMs: number; logadoMs: number; ausenteMs: number }>();
  for (const op of indicadores) {
    if (!porSetor.has(op.setor)) porSetor.set(op.setor, { volume: 0, produtivoMs: 0, logadoMs: 0, ausenteMs: 0 });
    const s = porSetor.get(op.setor)!;
    s.volume += op.volumeAtendimentos;
    s.produtivoMs += op.tempoProdutivoMs;
    s.logadoMs += op.tempoLogadoMs;
    s.ausenteMs += op.tempoAusenteMs;
  }

  const linhasSetor = Array.from(porSetor.entries()).map(([setor, s]) => {
    const pctProdutivo = s.logadoMs > 0 ? Math.round((s.produtivoMs / s.logadoMs) * 1000) / 10 : null;
    const pctAusente = s.logadoMs > 0 ? Math.round((s.ausenteMs / s.logadoMs) * 1000) / 10 : null;
    const eficiencia = s.produtivoMs > 0 ? Math.round((s.volume / (s.produtivoMs / 3600000)) * 10) / 10 : null;
    return `- ${setor} | ${s.volume} atendimentos | produtivo ${pctProdutivo ?? 'sem dado'}% | ` +
      `ausente ${pctAusente ?? 'sem dado'}% | eficiência ${eficiencia ?? 'sem dado'}/h`;
  });

  const top10Ausentes = [...indicadores]
    .filter((op) => op.pctAusente !== null && op.pctAusente > 0)
    .sort((a, b) => (b.pctAusente ?? 0) - (a.pctAusente ?? 0))
    .slice(0, 10)
    .map((op) => `- ${op.nome} (${op.setor}) | ausente ${op.pctAusente}% | produtivo ${op.pctProdutivo}%`);

  return [
    'Resumo por setor:',
    ...linhasSetor,
    '',
    'Operadores com maior % de tempo ausente no período (top 10, sinal mais direto de quem precisa de atenção):',
    ...(top10Ausentes.length ? top10Ausentes : ['(nenhum registro de ausência no período)']),
  ].join('\n');
}

/// Alertas operacionais abertos AGORA (Hub de Alertas: Atendimento + Vistoria
/// de POP): feed em tempo real, não histórico. Lista os críticos
/// individualmente porque é o que a gestão mais precisa saber na hora.
function formatarAlertasHub(itens: AlertaHubItem[] | null): string {
  if (!itens || !itens.length) return 'Nenhum alerta operacional aberto agora (Atendimento + Vistoria de POP).';

  const criticos = itens.filter((i) => i.severidade === 'CRITICO');
  const avisos = itens.filter((i) => i.severidade === 'AVISO');
  const porAtendimento = itens.filter((i) => i.origem === 'atendimento').length;
  const porVistoria = itens.filter((i) => i.origem === 'vistoria').length;

  const linhas = [
    `Total abertos: ${itens.length} (${criticos.length} crítico(s), ${avisos.length} aviso(s)) | ` +
    `Atendimento: ${porAtendimento} | Vistoria de POP: ${porVistoria}`,
  ];
  if (criticos.length) {
    linhas.push('', 'Críticos abertos agora:');
    linhas.push(...criticos.map((a) => `- [${a.origem}] ${a.titulo}${a.contexto ? ` (${a.contexto})` : ''}`));
  }
  return linhas.join('\n');
}

export const FONTES_GESTAO: FonteGestao[] = [
  {
    chave: 'ranking',
    buscar: () => buscarRankingVendedores(),
    valorVazio: [] as RankingVendedorEntry[],
    blocos: [{ titulo: 'RANKING DE VENDEDORES POR MES (snapshots mensais)', formatar: formatarRankingVendedores }],
    paraExcel: (r) => r,
    regraPrompt: `- Cada mês tem seu próprio líder de vendedores — isso NÃO é uma competição contínua entre
  pessoas. Nunca diga que o líder de um mês "superou", "ultrapassou" ou "supera" o líder de OUTRO
  mês — os números de meses diferentes não são comparáveis dessa forma (ex: não diga "Fulano
  liderou maio superando Beltrano que liderou abril com R$X", isso mistura números de períodos
  diferentes e pode soar como uma comparação que nem sempre é verdadeira). Se for comparar
  desempenho de vendedores entre meses, compare o MESMO vendedor no tempo (ex: "Fulano caiu de
  R$X em abril para R$Y em maio") ou compare vendedores dentro do MESMO mês.`,
  },
  {
    chave: 'evolucao',
    buscar: () => buscarEvolucaoVendas(),
    valorVazio: [] as EvolucaoMensalEntry[],
    blocos: [{ titulo: 'EVOLUCAO DE VENDAS POR MES E SEGMENTO', formatar: formatarEvolucaoVendas }],
    paraExcel: (e) => e,
  },
  {
    chave: 'statusRede',
    buscar: () => buscarStatusPops(),
    valorVazio: { pops: [] as PopStatusEntry[], piorGeral: null as PiorSinalAgora | null },
    resiliente: { logErroMsg: 'Falha ao buscar status de POPs para o chat de gestão' },
    blocos: [
      { titulo: 'STATUS DE POPS AGORA (ao vivo)', formatar: (d: { pops: PopStatusEntry[] }) => formatarStatusPops(d.pops) },
      { titulo: 'PIOR SINAL DA REDE AGORA (ao vivo, o cliente com a leitura mais fraca neste momento)', formatar: (d: { piorGeral: PiorSinalAgora | null }) => formatarPiorGeral(d.piorGeral) },
    ],
    paraExcel: (d) => d.pops,
    regraPrompt: `- O status de POP é AO VIVO (consultado no momento da pergunta, não é histórico) — cada POP
  agrupa várias OLTs. Se perguntarem por um POP específico, procure pelo nome mesmo que não bata
  exatamente (ex: "aguas claras" deve encontrar "AGUAS CLARAS").
- Ao falar de POPs "críticos"/"em alerta"/"com problema", use sempre o número "Em alerta (crítico
  + fora de operação)" fornecido para cada POP, não só o campo "Crítico" isolado — esse é o mesmo
  número que aparece no painel visual, e citar só o "Crítico" isolado gera uma contagem menor que
  destoa do que a pessoa vê na tela. Só cite "Crítico" e "Fora de operação" separadamente se a
  pergunta pedir essa distinção especificamente.`,
  },
  {
    chave: 'pioresClientes',
    buscar: () => buscarPioresClientesHoje(5),
    valorVazio: [] as ClienteDegradadoHoje[],
    resiliente: { logErroMsg: 'Falha ao buscar piores sinais de hoje para o chat de gestão' },
    blocos: [{ titulo: 'CLIENTES QUE PIORARAM HOJE (eventos de degradação dia-a-dia, pode ficar defasado se a ingestão atrasar)', formatar: formatarPioresClientes }],
    paraExcel: (c) => c,
  },
  {
    chave: 'retencaoMes',
    buscar: (janela) => getRetencao('gestor', '', {
      dateFrom: `${janela.inicioMes.getFullYear()}-${String(janela.inicioMes.getMonth() + 1).padStart(2, '0')}-01`,
      dateTo: janela.hoje.toISOString().slice(0, 10),
    }).then((r) => r.kpis),
    valorVazio: null as RetencaoKpis | null,
    resiliente: { logErroMsg: 'Falha ao buscar desempenho de retenção do mês para o chat de gestão' },
    blocos: [{ titulo: 'DESEMPENHO DE RETENÇÃO DO MES EM ANDAMENTO (volume bruto do IXC, dia 1 até hoje)', formatar: formatarRetencaoMes }],
    paraExcel: (k) => (k ? [k] : []),
  },
  {
    chave: 'auditoriaRetencao',
    buscar: () => getResumoAuditoriaRetencao(),
    valorVazio: null as ResumoAuditoriaRetencao | null,
    resiliente: { logErroMsg: 'Falha ao buscar auditoria de retenção para o chat de gestão' },
    blocos: [{ titulo: 'AUDITORIA DE RETENÇÃO (negociação real vs. classificação genérica do IXC)', formatar: formatarAuditoriaRetencao }],
    paraExcel: (a) => a?.porOperador ?? [],
    regraPrompt: `- A AUDITORIA DE RETENÇÃO é um relatório, não muda comissão: a classificação do IXC (RETIDO/
  NAO_RETIDO) só olha um campo genérico de diagnóstico, sem checar se o operador realmente
  negociou algo (desconto, isenção, novo plano) e o cliente aceitou por causa disso — a auditoria
  lê o texto da conversa (cruzando com a conversa real do OpaSuite quando o protocolo é
  encontrado) e reclassifica em NEGOCIACAO_REAL, SEM_NEGOCIACAO ou INDEFINIDO. É incremental
  (roda aos poucos, não cobre todas as O.S. de uma vez) — SEMPRE informe quantas já foram
  auditadas e quantas ainda faltam quando responder sobre isso, para não passar a impressão de
  que os números são o total definitivo. Isso NÃO altera o valor de comissão pago hoje — é uma
  divergência a ser avaliada pela gestão, não uma correção automática.
- Você TEM acesso ao conteúdo real das divergências (não só a contagem) na lista "Divergências
  recentes" do contexto abaixo — se perguntarem "quais foram as divergências" ou algo do tipo,
  cite os casos específicos (O.S., operador, o que a nota alegava vs. o que a conversa real
  mostrou), não responda só com um número. Se a lista estiver vazia, diga que não há divergência
  encontrada até agora, não invente exemplo.`,
  },
  {
    chave: 'kpisAtendimento',
    buscar: (janela) => getResumoKpisAtendimento(janela.inicioMes, janela.hoje),
    valorVazio: null as KpisAtendimento[] | null,
    resiliente: { logErroMsg: 'Falha ao buscar KPIs de atendimento para o chat de gestão' },
    blocos: [{ titulo: 'ATENDIMENTO — KPIS BRUTOS DO MES EM ANDAMENTO (SAC / SUPORTE N1 / SUPORTE N2 / COBRANÇA / VENDAS / RETENÇÃO / PÓS-VENDAS / BACKOFFICE)', formatar: formatarKpisAtendimento }],
    paraExcel: (k: KpisAtendimento[] | null) => (k ?? []).map((x) => ({
      setor: x.setor, volume: x.volume,
      tmr: fmtDuracao(x.tmrMs), tme: fmtDuracao(x.tmeMs), tma: fmtDuracao(x.tmaMs),
      escalonamentos: x.escalonamentos, pctEscalonamento: x.pctEscalonamento,
      notaMediaSatisfacao: x.notaMediaSatisfacao, qtdAvaliados: x.qtdAvaliados,
    })),
    regraPrompt: `- Os KPIs brutos de atendimento têm TRÊS métricas de tempo diferentes, não confunda. Todo
  atendimento (exceto ligação) passa primeiro pela URA/IZA (a IA de atendimento que faz a
  triagem inicial) antes de qualquer fila ou humano — NENHUMA das três métricas conta tempo
  de resposta da URA/IZA como se fosse resposta humana:
  TMR (resposta) é quanto tempo o atendente HUMANO demora pra responder depois que o CLIENTE
  manda uma mensagem — medido mensagem a mensagem dentro da conversa, não é um número por
  atendimento. Se a URA/IZA responder, isso NÃO conta como resposta pro TMR (o "relógio"
  continua rodando até um humano de fato responder); se o atendente manda mensagem por conta
  própria (sem o cliente ter escrito nada antes), isso também não conta. TME (espera) é o
  tempo em fila/URA/IZA até um atendente HUMANO de verdade assumir o atendimento pela primeira
  vez — aqui SIM a URA/IZA conta, porque TME é exatamente sobre esse período de triagem
  automática + fila (é a única coisa que TME mede). TMA (atendimento) é só o tempo que o
  humano passou de fato com o cliente, sem contar a URA/IZA.
  Se perguntarem "tempo de resposta" ou "quanto tempo o atendente demora pra responder", use
  TMR. Se perguntarem "tempo de espera" ou "quanto tempo o cliente espera até ser atendido",
  use TME. Se perguntarem "tempo de atendimento" isolado, use TMA.`,
  },
  {
    chave: 'monitoriaAtendimento',
    buscar: async (janela) => {
      const [criterios, ranking] = await Promise.all([
        getResumoNaoConformesPorCriterio({ dateFrom: janela.inicioUltimos3Meses, dateTo: janela.hoje }),
        getRankingAgentesPorQualidade({ dateFrom: janela.inicioUltimos3Meses, dateTo: janela.hoje }),
      ]);
      return { criterios, ranking };
    },
    valorVazio: { criterios: [] as CriterioNaoConformeResumo[], ranking: [] as AgenteQaRanking[] },
    resiliente: { logErroMsg: 'Falha ao buscar monitoria de qualidade (QA) para o chat de gestão' },
    blocos: [
      { titulo: 'ATENDIMENTO — QA HUMANO: CRITÉRIOS MAIS REPROVADOS (últimos 3 meses)', formatar: (d) => formatarCriteriosNaoConformesQa(d.criterios) },
      { titulo: 'ATENDIMENTO — QA HUMANO: RANKING DE QUALIDADE POR AGENTE (últimos 3 meses)', formatar: (d) => formatarRankingQualidadeQa(d.ranking) },
    ],
    paraExcel: (d) => d.ranking,
  },
  {
    chave: 'rankingsAtendimento',
    buscar: (janela) => getRankingsAtendimento(janela.inicioUltimos3Meses, janela.hoje),
    valorVazio: null as RankingsAtendimento | null,
    resiliente: { logErroMsg: 'Falha ao buscar ranking de atendentes para o chat de gestão' },
    blocos: [{ titulo: 'ATENDIMENTO — RANKING DE ATENDENTES E MOTIVOS (últimos 3 meses)', formatar: formatarRankingsAtendimento }],
    paraExcel: (d) => d?.atendentes ?? [],
  },
  {
    chave: 'historicoAtendimento',
    buscar: () => getKpisAtendimentoHistorico(6),
    valorVazio: null as KpiAtendimentoMensal[] | null,
    resiliente: { logErroMsg: 'Falha ao buscar histórico mensal de atendimento para o chat de gestão' },
    blocos: [{ titulo: 'ATENDIMENTO — HISTÓRICO MENSAL (meses fechados, snapshot pré-calculado)', formatar: formatarHistoricoAtendimento }],
    paraExcel: (h: KpiAtendimentoMensal[] | null) => (h ?? []).map((x) => ({
      mes: x.mesReferencia, setor: x.setor, volume: x.volume,
      tmr: fmtDuracao(x.tmrMs), tme: fmtDuracao(x.tmeMs), tma: fmtDuracao(x.tmaMs),
      escalonamentos: x.escalonamentos, pctEscalonamento: x.pctEscalonamento,
      notaMediaSatisfacao: x.notaMediaSatisfacao, qtdAvaliados: x.qtdAvaliados,
    })),
  },
  {
    chave: 'analiseIaAtendimento',
    buscar: async (janela) => {
      const range = { dateFrom: janela.inicioUltimos3Meses, dateTo: janela.hoje };
      const [porSetor, motivos] = await Promise.all([
        getResumoPorSetor(range),
        getRankingMotivosIa(range),
      ]);
      return { porSetor, motivos };
    },
    valorVazio: { porSetor: [] as SentimentoPorSetor[], motivos: [] as MotivoIaResumo[] },
    resiliente: { logErroMsg: 'Falha ao buscar análise de IA em massa de atendimento para o chat de gestão' },
    blocos: [
      { titulo: 'ATENDIMENTO — ANÁLISE DE IA EM MASSA: SENTIMENTO E ADESÃO POR SETOR (últimos 3 meses, sinal de triagem)', formatar: (d) => formatarAnaliseIaPorSetor(d.porSetor) },
      { titulo: 'ATENDIMENTO — ANÁLISE DE IA EM MASSA: MOTIVOS CLASSIFICADOS (últimos 3 meses)', formatar: (d) => formatarMotivosIa(d.motivos) },
    ],
    paraExcel: (d) => d.porSetor,
  },
  {
    chave: 'indicadoresJornada',
    buscar: (janela) => getIndicadoresJornada(janela.inicioMes, janela.hoje),
    valorVazio: null as IndicadorJornadaOperador[] | null,
    resiliente: { logErroMsg: 'Falha ao buscar indicadores de jornada para o chat de gestão' },
    blocos: [{ titulo: 'ATENDIMENTO — JORNADA E PRODUTIVIDADE DO MES EM ANDAMENTO (todos os setores, inclusive equipe terceirizada)', formatar: formatarIndicadoresJornada }],
    paraExcel: (i: IndicadorJornadaOperador[] | null) => (i ?? []).map((op) => ({
      nome: op.nome, setor: op.setor, atendimentos: op.volumeAtendimentos,
      tempoLogado: fmtHorasLongas(op.tempoLogadoMs), tempoProdutivo: fmtHorasLongas(op.tempoProdutivoMs),
      tempoPausa: fmtHorasLongas(op.tempoPausaMs), tempoAusente: fmtHorasLongas(op.tempoAusenteMs),
      pctProdutivo: op.pctProdutivo, pctPausa: op.pctPausa, pctAusente: op.pctAusente,
    })),
    regraPrompt: `- "JORNADA E PRODUTIVIDADE" é sobre COMO o tempo do operador foi gasto (produtivo, pausa,
  ausente) e eficiência (atendimentos por hora produtiva) — DIFERENTE dos "KPIS BRUTOS DO MES EM
  ANDAMENTO" (fonte 1 de atendimento), que é sobre a CONVERSA (volume/TME/TMA/TMR), não sobre a
  jornada do operador. "Ausente" é tempo fora do sistema durante o expediente sem ser pausa
  formal — é o sinal mais direto de quem precisa de uma conversa da gestão. Eficiência varia MUITO
  entre setores (TMA diferente por setor), nunca compare a eficiência de um operador de um setor
  com a de outro de setor diferente. Cobre todo operador ativo no sistema de atendimento,
  inclusive equipe terceirizada (ex: Aprimorar) — trate como qualquer colaborador, sem
  distinção. LIMITAÇÃO CONHECIDA (confirmada pelo usuário 2026-07-13): atendimento por ligação
  (telefone) ainda tem medição incompleta de volume, só TMA e TME são confiáveis para esse canal.
  Volume e eficiência baixos podem refletir essa lacuna de medição, não necessariamente baixo
  desempenho real — não afirme que um operador "trabalhou pouco" ou está com problema de
  produtividade só por volume/eficiência baixos, mencione essa limitação como possível causa
  alternativa. O setor mostrado já reflete o time real do operador: prioriza o roster curado de
  RH/QA quando existe, e só usa inferência por volume de tickets pra quem não está nesse roster —
  não é mais "o atendimento mais recente processado" (corrigido 2026-07-14).`,
  },
  {
    chave: 'posAtivacaoKpis',
    buscar: () => getPosAtivacaoKpis({}),
    valorVazio: null as PosAtivacaoKpis | null,
    resiliente: { logErroMsg: 'Falha ao buscar KPIs de pós-ativação para o chat de gestão' },
    blocos: [{ titulo: 'PÓS-ATIVAÇÃO — CLIENTES QUE CONTATARAM O SUPORTE APÓS INSTALAR (janela de 30 dias)', formatar: formatarPosAtivacaoKpis }],
    paraExcel: (k) => (k ? [k] : []),
    regraPrompt: `- "Pós-ativação" é sobre contato do cliente NOS PRIMEIROS 30 DIAS após ativar o contrato
  (instalação ou mudança de endereço) — é um indicador de qualidade de instalação/campo, DIFERENTE
  do volume geral de atendimento (que cobre todo mundo, não só quem acabou de ativar). Não misture
  os dois números.`,
  },
  {
    chave: 'vistoriaPendencias',
    buscar: () => buscarPendenciasAbertas(),
    valorVazio: [] as VistoriaPendencia[],
    resiliente: { logErroMsg: 'Falha ao buscar pendências de vistoria de POP para o chat de gestão' },
    blocos: [{ titulo: 'VISTORIA DE POP — PENDÊNCIAS ABERTAS (checklist de inspeção técnica: rack, gerador, baterias, ar-condicionado, extintor)', formatar: formatarVistoriaPendencias }],
    paraExcel: (p) => p,
    regraPrompt: `- Pendências de Vistoria de POP são achados de checklist físico (ex: extintor ausente,
  gerador precisando de manutenção) — NÃO é a mesma coisa que "status de POP agora" (fonte
  STATUS DE POPS AGORA, que é sobre sinal/rede ao vivo). O nome do POP nas duas fontes pode não
  bater exatamente (convenções diferentes entre os dois sistemas) — não assuma que é o mesmo POP
  sem o nome corresponder claramente, e não cruze as duas fontes como se fossem uma coisa só.`,
  },
  {
    chave: 'alertasHub',
    buscar: () => listarAlertasHub(),
    valorVazio: [] as AlertaHubItem[],
    resiliente: { logErroMsg: 'Falha ao buscar alertas operacionais do Hub para o chat de gestão' },
    blocos: [{ titulo: 'ALERTAS OPERACIONAIS ABERTOS AGORA (Hub de Alertas: Atendimento + Vistoria de POP)', formatar: formatarAlertasHub }],
    paraExcel: (a) => a ?? [],
    regraPrompt: `- "ALERTAS OPERACIONAIS ABERTOS AGORA" é feed em TEMPO REAL (o estado agora, não histórico) —
  cobre só Atendimento (conversa parada, SLA de fila, agente ausente, fila acumulada) e Vistoria
  de POP (checklist físico: extintor, gerador, baterias). NÃO inclui os alertas por e-mail
  (assinatura pendente, fatura em aberto, metas de retenção), que são um sistema separado,
  fire-and-forget, sem conceito de aberto/resolvido — não confunda os dois.`,
  },
];

// ── Regras comparativas (cross-fonte) — não pertencem a 1 fonte só, existem
// porque o modelo já confundiu essas fontes em produção nesta sessão. Ficam
// à parte do registry de propósito, pra não perder a moldura "não confunda
// X com Y" fragmentando cada uma no regraPrompt de uma fonte isolada.

export const REGRA_SINAL_DUAS_FONTES = `- Há DUAS fontes diferentes sobre sinal de cliente, não confunda uma com a outra:
  (1) "PIOR SINAL DA REDE AGORA" é uma leitura AO VIVO, sempre atual — é a resposta certa para
  perguntas como "qual cliente tem o pior sinal?", "quem está com o sinal mais fraco?" (sem
  menção a "hoje"/"piorou"). É o mesmo número que aparece no painel como "pior sinal" da rede.
  (2) "CLIENTES QUE PIORARAM HOJE" rastreia degradação dia-a-dia e pode ficar defasado (a fonte
  às vezes atrasa a ingestão) — é a resposta certa só quando perguntarem especificamente quem
  "piorou"/"degradou" hoje/no dia. Se essa lista vier vazia, diga que não há registro de piora
  hoje na fonte de degradação diária (não diga que não há dado de sinal nenhum — a leitura ao
  vivo da fonte (1) pode continuar disponível).
- Se perguntarem por um cliente específico que não aparece em nenhuma das duas listas, diga que
  ele não está entre os casos monitorados agora e sugira o modo Consulta para um diagnóstico
  completo dele.`;

export const REGRA_RETENCAO_DESEMPENHO_VS_AUDITORIA = `- "DESEMPENHO DE RETENÇÃO DO MÊS" é uma coisa DIFERENTE da "AUDITORIA DE RETENÇÃO" acima, não
  confunda as duas: o desempenho é o VOLUME operacional do mês em andamento (quantas O.S. de
  retenção foram tratadas, quantas retidas/não retidas, taxa de reversão, comissão gerada,
  quantas operadoras bateram meta) — é a contagem bruta do IXC, sem passar por auditoria de
  qualidade. A auditoria (acima) é sobre SE a retenção foi uma negociação real ou não. Se
  perguntarem "quantos retivemos esse mês" ou "estamos batendo a meta de retenção", use o
  desempenho do mês; se perguntarem sobre qualidade/veracidade da negociação, use a auditoria.
  O período do desempenho do mês é sempre do dia 1 até hoje (mês corrente em andamento).`;

export const REGRA_ATENDIMENTO_SETE_FONTES = `- Atendimento cobre 8 setores (SAC, Suporte N1, Suporte N2, Cobrança, Vendas, Retenção,
  Pós-Vendas, Backoffice) e tem SETE fontes diferentes, não confunda:
  (1) "KPIS BRUTOS DO MES EM ANDAMENTO" é volume/tempo (TME/TMA/TMR)/satisfação cru do mês
  corrente, calculado AO VIVO, sem avaliação de qualidade — responde "quantos atendimentos
  tivemos ESTE MÊS", "qual o tempo de espera/atendimento/resolução agora".
  (2) "QA HUMANO" é avaliação de qualidade feita por revisor humano (não por IA), numa rubrica
  de 22 critérios binários (Conforme/Não Conforme/Não se aplica — ex: Script, Sondagem, Tom de
  voz, Transferencia Indevida, Erro de procedimento, Omissão de atendimento) com pontuação
  ponderada 0-10. O C.A.I.O. só atua como COPILOTO nesse processo (sugere preenchimento pro
  humano confirmar antes de salvar) — a decisão final é sempre humana, isso NUNCA é avaliação
  automática de IA. A cobertura HOJE é só SAC, Suporte N2 e Retenção (herança do histórico já
  avaliado) — se perguntarem sobre qualidade de outro setor (N1, Cobrança, Vendas, Pós-Vendas,
  Backoffice), diga que ainda não há avaliação de QA nesse setor, não invente número.
  "CRITÉRIOS MAIS REPROVADOS" responde "o que está dando errado no atendimento" (ex: "quais
  atendimentos foram transferidos indevidamente" = olhar o critério "Transferencia Indevida").
  "RANKING DE QUALIDADE POR AGENTE" responde "quais atendentes se destacam" ou "quem atende
  melhor" com a nota REAL de QA (0-10) — só entram agentes com pelo menos 15 avaliações no
  período, pra não ranquear com base em amostra pequena demais.
  (3) Auditoria pontual de 1 atendimento específico (protocolo) não está nos dados abaixo —
  isso é feito sob demanda em outro lugar do sistema, não aqui no chat de gestão; se
  perguntarem sobre um protocolo específico, diga que esse chat cobre visão agregada, não
  atendimento individual.
  (4) "RANKING DE ATENDENTES E MOTIVOS" cobre os últimos 3 meses. O ranking de atendentes aí é
  por VOLUME de atendimentos (quem mais atendeu), uma coisa DIFERENTE do "RANKING DE QUALIDADE
  POR AGENTE" da fonte (2) (que é por NOTA de QA, não por quantidade). Se perguntarem "quais
  atendentes se destacam" prefira o ranking de QUALIDADE (fonte 2) — é o que responde de fato
  "quem trabalha bem"; só use o ranking por volume se a pergunta for especificamente sobre quem
  atendeu mais ou se o agente perguntado não tiver avaliações de QA suficientes (aí deixe claro
  que está mostrando volume, não qualidade, por falta de dado de QA).
  (5) "HISTÓRICO MENSAL" cobre meses JÁ FECHADOS (snapshot pré-calculado, atualizado 1x/mês no
  dia 1) — use isso pra perguntas tipo "como estão os indicadores nos últimos meses" ou
  "evolução do atendimento". Combine com os KPIS BRUTOS DO MES EM ANDAMENTO (fonte 1, sempre
  ao vivo) quando a pergunta pedir o período completo até hoje (ex: "últimos 3 meses" =
  histórico dos meses fechados + mês corrente ao vivo). Se o histórico vier vazio ou faltando
  algum mês, diga que o rollup mensal ainda não cobre esse período, não invente número.
  (6) "ANÁLISE DE IA EM MASSA" (sentimento/adesão por setor + motivos classificados) é sinal de
  TRIAGEM gerado por IA, processando quase todo o volume de TEXTO (não é amostra), mas SEM
  revisão humana no momento em que é gerado — NUNCA é avaliação oficial de QA, não confunda com
  a fonte (2) "QA HUMANO" (que é sempre confirmada por um humano). Cobre só canal de texto
  (WhatsApp/Instagram), ligação fica de fora por enquanto. "Sentimento médio" é como o CLIENTE
  pareceu se sentir (-1 muito insatisfeito a 1 muito satisfeito), "adesão ao script" é sobre o
  ATENDENTE (0-10). Os "MOTIVOS CLASSIFICADOS" dessa fonte são DIFERENTES dos "Motivos de
  atendimento" da fonte (4) — a fonte (4) vem de tipificação manual no OpaSuite (só ~42% dos
  atendimentos têm isso preenchido), a fonte (6) é inferida pela IA em cima da conversa; se
  perguntarem "quais os principais motivos de atendimento" prefira mencionar as duas se ambas
  tiverem dado, deixando claro qual é qual.
  (7) "JORNADA E PRODUTIVIDADE" é sobre COMO o operador gastou o tempo (produtivo, pausa,
  ausente) e sua eficiência (atendimentos por hora produtiva) — DIFERENTE da fonte (1), que é
  sobre a CONVERSA em si (volume/TME/TMA/TMR), não sobre a jornada do operador. Um operador pode
  ter TMA ótimo na fonte (1) e ainda assim passar boa parte do tempo ausente na fonte (7) — são
  medidas independentes, não derive uma da outra.
  Escalonamento (N1->N2) só existe pro setor N1 — não invente esse número pros outros setores.
  ATENÇÃO: o setor de atendimento "Retenção" (KPIs/QA/ranking/análise de IA acima) é uma coisa
  DIFERENTE da "AUDITORIA DE RETENÇÃO" e "DESEMPENHO DE RETENÇÃO DO MÊS" (mais abaixo neste
  contexto) — o setor de atendimento mede a qualidade da CONVERSA no departamento Retenção do
  OpaSuite; a auditoria/desempenho de retenção mede se houve NEGOCIAÇÃO REAL numa O.S. do IXC.
  São eixos independentes sobre o mesmo assunto de negócio, não a mesma fonte com nomes
  diferentes.`;

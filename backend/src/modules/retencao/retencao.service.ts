import {
  fetchRetencao,
  fetchRetencaoDetalhe,
  upsertNegociacao,
  deleteNegociacao,
  RetencaoRecord,
  RetencaoFilters,
  NegociacaoInput,
  getComissaoRetencao,
  contarChamadosRetencaoTotal,
  resumoAuditoriaPorOperador,
  ResumoAuditoriaOperador,
  buscarDivergenciasRecentes,
  DivergenciaRecente,
} from './retencao.repository';

export interface RetencaoKpis {
  totalTratadas:    number;
  totalRetidas:     number;
  totalNaoRetidas:  number;
  pctReversaoGeral: number;
  totalComissoes:   number;
  operadoresNaMeta: number;
}

export interface RetencaoResult {
  kpis:       RetencaoKpis;
  operadores: RetencaoRecord[];
}

export async function getRetencao(
  perfil:   string,
  userName: string,
  filters:  { dateFrom?: string; dateTo?: string; operador?: string },
): Promise<RetencaoResult> {
  // consultor: filtra pelo próprio nome | gestor/cs: vê todos (cs é dono do setor de retenção)
  const operadorFilter = perfil === 'consultor' ? userName : (filters.operador || undefined);

  const operadores = await fetchRetencao({
    dateFrom:     filters.dateFrom,
    dateTo:       filters.dateTo,
    operadorNome: operadorFilter,
  });

  const totalTratadas    = operadores.reduce((s, o) => s + o.qtd_tratadas,    0);
  const totalRetidas     = operadores.reduce((s, o) => s + o.qtd_retidas,     0);
  const totalNaoRetidas  = operadores.reduce((s, o) => s + o.qtd_nao_retidas, 0);
  const totalComissoes   = operadores.reduce((s, o) => s + o.comissao,        0);
  const operadoresNaMeta = operadores.filter((o) => o.comissao > 0).length;

  return {
    kpis: {
      totalTratadas,
      totalRetidas,
      totalNaoRetidas,
      pctReversaoGeral: totalTratadas > 0
        ? Math.round((totalRetidas / totalTratadas) * 1000) / 10
        : 0,
      totalComissoes,
      operadoresNaMeta,
    },
    operadores,
  };
}

export async function getRetencaoDetalhe(
  perfil:   string,
  userName: string,
  filters:  { dateFrom?: string; dateTo?: string; operador?: string },
) {
  const operadorFilter = perfil === 'consultor' ? userName : (filters.operador || undefined);

  const detalhes = await fetchRetencaoDetalhe({
    dateFrom:     filters.dateFrom,
    dateTo:       filters.dateTo,
    operadorNome: operadorFilter,
  });

  // A auditoria completa (justificativa, divergência com o OpaSuite) é
  // informação de gestão sobre qualidade do atendimento — mostrar pra
  // colaboradora o que foi flagado como suspeito ensinaria a burlar a
  // auditoria em vez de melhorar o atendimento. Ela só vê o lado positivo
  // (negociação confirmada), como reforço construtivo, nunca o negativo.
  if (perfil !== 'gestor') {
    return detalhes.map((d) => ({
      ...d,
      auditoria: d.auditoria?.classificacao === 'NEGOCIACAO_REAL'
        ? { classificacao: 'NEGOCIACAO_REAL' as const, justificativa: '', negociacao_detectada: null, divergencia_nota_os: null }
        : null,
    }));
  }
  return detalhes;
}

export async function saveNegociacao(input: NegociacaoInput) {
  return upsertNegociacao(input);
}

export async function removeNegociacao(idChamado: string) {
  return deleteNegociacao(idChamado);
}

export interface ResumoAuditoriaRetencao {
  porOperador:            ResumoAuditoriaOperador[];
  totalGeralClassificado: number;
  totalGeralOsRetencao:   number;
  totalGeralPendente:     number;
  divergenciasRecentes:   DivergenciaRecente[];
}

/// Auditoria de negociação real (cruza O.S. + atendimento) — não muda o
/// cálculo de comissão, só reporta a divergência entre a classificação
/// genérica do IXC e o que de fato aconteceu na conversa com o cliente.
export async function getResumoAuditoriaRetencao(): Promise<ResumoAuditoriaRetencao> {
  const [porOperador, totalGeralOsRetencao, divergenciasRecentes] = await Promise.all([
    resumoAuditoriaPorOperador(),
    contarChamadosRetencaoTotal(),
    buscarDivergenciasRecentes(10),
  ]);

  const totalGeralClassificado = porOperador.reduce((s, o) => s + o.totalClassificado, 0);

  return {
    porOperador,
    totalGeralClassificado,
    totalGeralOsRetencao,
    totalGeralPendente: Math.max(0, totalGeralOsRetencao - totalGeralClassificado),
    divergenciasRecentes,
  };
}

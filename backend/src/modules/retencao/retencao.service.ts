import {
  fetchRetencao,
  fetchRetencaoDetalhe,
  upsertNegociacao,
  deleteNegociacao,
  RetencaoRecord,
  RetencaoFilters,
  NegociacaoInput,
  getComissaoRetencao,
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

  return fetchRetencaoDetalhe({
    dateFrom:     filters.dateFrom,
    dateTo:       filters.dateTo,
    operadorNome: operadorFilter,
  });
}

export async function saveNegociacao(input: NegociacaoInput) {
  return upsertNegociacao(input);
}

export async function removeNegociacao(idChamado: string) {
  return deleteNegociacao(idChamado);
}

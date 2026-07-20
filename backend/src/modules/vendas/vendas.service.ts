import { fetchContracts, ContractRecord } from './vendas.repository';
import { metaB2CParaMes, META_B2B } from './vendas.metas';

export interface ContractKpis {
  totalContratos: number;
  faturamentoMensal: number;
  comissoesLiberadas: number;
  comissoesBloqueadas: number;
  comissoesPendentes: number;
  valorAtivado: number;          // todos os contratos — base da meta
  valorLiberado: number;         // só liberados — base da comissão
  valorBloqueado: number;
  valorComissaoLiberada: number;
  metaAlvo: number;
  b2c: number;
  b2b: number;
  cortesias: number;
}

export interface ContractsResult {
  contracts: ContractRecord[];
  kpis: ContractKpis;
}

export async function getContracts(
  perfil: string,
  userName: string,
  filters: { dateFrom?: string; dateTo?: string; vendedor?: string }
): Promise<ContractsResult> {
  // consultor e cs: filtram pelo próprio nome | gestor: vê todos (ou filtra por query)
  const vendedorFilter =
    perfil === 'consultor' || perfil === 'cs'
      ? userName
      : filters.vendedor || undefined;

  const contracts = await fetchContracts({
    dateFrom:     filters.dateFrom,
    dateTo:       filters.dateTo,
    vendedorNome: vendedorFilter,
  });

  const liberadas  = contracts.filter((c) => c.status_comissao === 'Liberada');
  const bloqueadas = contracts.filter((c) => c.status_comissao.startsWith('Bloqueada'));
  const pendentes  = contracts.filter((c) => c.status_comissao.startsWith('Pendente'));
  const qtdB2b     = contracts.filter((c) => c.segmento === 'B2B').length;

  const kpis: ContractKpis = {
    totalContratos:        contracts.length,
    faturamentoMensal:     contracts.reduce((s, c) => s + c.valor_mensal, 0),
    comissoesLiberadas:    liberadas.length,
    comissoesBloqueadas:   bloqueadas.length,
    comissoesPendentes:    pendentes.length,
    valorAtivado:          contracts.reduce((s, c) => s + c.valor_mensal, 0), // todos — base meta
    valorLiberado:         liberadas.reduce((s, c) => s + c.valor_mensal, 0), // só liberados — base comissão
    valorBloqueado:        [...bloqueadas, ...pendentes].reduce((s, c) => s + c.valor_mensal, 0),
    valorComissaoLiberada: liberadas.reduce((s, c) => s + c.comissao, 0),
    // Heurística existente (maioria B2B no filtro atual) + meta B2C mês-dependente
    // (ver vendas.metas.ts) — dateFrom só dá o mês certo quando o filtro é de um
    // mês só; fora disso cai no padrão, mesmo comportamento de antes da mudança.
    metaAlvo:              qtdB2b > contracts.length / 2 ? META_B2B : metaB2CParaMes(filters.dateFrom?.slice(0, 7)),
    b2c:                   contracts.filter((c) => c.segmento === 'B2C').length,
    b2b:                   qtdB2b,
    cortesias:             contracts.filter((c) => c.cortesia === 'SIM').length,
  };

  return { contracts, kpis };
}

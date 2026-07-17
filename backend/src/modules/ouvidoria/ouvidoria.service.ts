import * as repo from './ouvidoria.repository';
import {
  OuvidoriaFiltros,
  ResumoVolumeReclamacoes,
  ResumoDesfecho,
  CruzamentoInadimplencia,
  CruzamentoRetencao,
} from './ouvidoria.types';

export interface ResumoOuvidoria {
  volume: ResumoVolumeReclamacoes;
  desfecho: ResumoDesfecho;
  inadimplencia: CruzamentoInadimplencia;
  retencao: CruzamentoRetencao[];
  percentualEntrouEmRetencao: number;
}

export async function getResumoOuvidoria(filtros: OuvidoriaFiltros): Promise<ResumoOuvidoria> {
  const [porCategoria, porDesfecho, inadimplencia, retencao] = await Promise.all([
    repo.buscarVolumePorCategoria(filtros),
    repo.buscarDesfechoPorCategoria(filtros),
    repo.buscarCruzamentoInadimplencia(filtros),
    repo.buscarCruzamentoRetencao(filtros),
  ]);

  // "totalReclamacoes" exclui elogio de propósito, ver ResumoVolumeReclamacoes
  const totalReclamacoes = porCategoria
    .filter((c) => c.categoria !== 'elogio')
    .reduce((soma, c) => soma + c.qtd, 0);

  const totalDesfechos = porDesfecho.reduce((soma, d) => soma + d.qtd, 0);
  const clienteAtivo = porDesfecho.find((d) => d.desfecho === 'cliente_ativo')?.qtd ?? 0;
  const percentualReclamouEContinua = totalDesfechos > 0 ? (clienteAtivo / totalDesfechos) * 100 : 0;

  const qtdEntrouRetencao = retencao.filter((r) => r.entrouEmFluxoRetencao).length;
  const percentualEntrouEmRetencao = retencao.length > 0 ? (qtdEntrouRetencao / retencao.length) * 100 : 0;

  return {
    volume: { porCategoria, totalReclamacoes },
    desfecho: { porDesfecho, percentualReclamouEContinua },
    inadimplencia,
    retencao,
    percentualEntrouEmRetencao,
  };
}

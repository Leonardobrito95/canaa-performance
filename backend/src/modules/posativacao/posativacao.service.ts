import {
  buscarKpis, buscarMotivos, buscarDistribuicao, buscarTendencia, buscarChurn, buscarTecnicos,
  buscarClientes, buscarClientesExport, buscarContatosCliente,
  buscarBairros, buscarCanais, buscarResolucaoSla,
} from './posativacao.repository';
import { FiltrosPosAtivacao, FiltrosClientesPosAtivacao } from './posativacao.types';

/// Camada fina — a lógica de negócio (janelas, exclusões de assunto, fix do
/// sentinela de churn) já está inteira no repository, portada do sistema
/// original. O service só existe pra manter o mesmo padrão dos outros
/// módulos (controller nunca chama repository direto).

export const getKpis         = buscarKpis;
export const getMotivos      = buscarMotivos;
export const getDistribuicao = buscarDistribuicao;
export const getTendencia    = buscarTendencia;
export const getChurn        = buscarChurn;
export const getTecnicos     = buscarTecnicos;
export const getClientes     = buscarClientes;
export const getClientesExport = buscarClientesExport;
export const getContatosCliente = buscarContatosCliente;
export const getBairros      = buscarBairros;
export const getCanais       = buscarCanais;
export const getResolucaoSla = buscarResolucaoSla;

export type { FiltrosPosAtivacao, FiltrosClientesPosAtivacao };

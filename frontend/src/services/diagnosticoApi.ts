import axios from 'axios';

const TOKEN_KEY = 'bdr_token';

const api = axios.create({
  baseURL: '/bdr/api/v1/diagnostico',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) { localStorage.removeItem(TOKEN_KEY); window.location.reload(); }
    return Promise.reject(err);
  },
);

// ── Types ─────────────────────────────────────────────────────

export interface DiagnosticoResultado {
  diagnostico: string;
  erro: string;
  sugestao: string;
  textoCompleto: string;
  estruturado: boolean;
  consultaId: string;
}

export type TipoFeedback = 'POSITIVO' | 'NEGATIVO';

export interface DiagnosticoHistoricoItem {
  id: string;
  pergunta: string | null;
  resposta: string;
  ixc_username: string;
  criado_em: string;
}

export interface DiagnosticoAgregadoItem {
  chave: string;
  dimensao: string;
  periodo_ini: string;
  periodo_fim: string;
  metricas_json: Record<string, unknown>;
  narrativa: string | null;
  atualizado_em: string;
}

export interface ClienteCandidato {
  id: number;
  nome: string;
  cpfCnpj: string;
  endereco: string;
}

export type CategoriaRegra = 'VENDAS' | 'RETENCAO' | 'REDE' | 'COMISSAO' | 'ATENDIMENTO';

export interface RegraNegocio {
  chave: string;
  valor: string;
  descricao: string;
  categoria: CategoriaRegra;
  atualizado_em: string;
  atualizado_por: string;
}

export interface RegraNegocioInput {
  chave: string;
  valor: string;
  descricao: string;
  categoria: CategoriaRegra;
}

export interface RankingVendedorEntry {
  nomeVendedor: string;
  mesReferencia: string;
  qtdContratos: number;
  valorAtivos: number;
  valorLiberado: number;
}

export interface EvolucaoMensalEntry {
  mesReferencia: string;
  segmento: string;
  qtdContratos: number;
  valorAtivos: number;
  valorLiberado: number;
}

export interface PopStatusEntry {
  pop: string;
  totalOnus: number;
  normal: number;
  atencao: number;
  critico: number;
  foraDeOperacao: number;
  semLeitura: number;
  piorSinalRx: number | null;
}

export interface ClienteDegradadoHojeEntry {
  idCliente: number;
  nome: string;
  sn: string;
  olt: string;
  rxHoje: number;
  rxAnterior: number;
}

export interface PiorSinalAgoraEntry {
  clienteId: number;
  nome: string;
  pop: string;
  olt: string;
  sinalRx: number;
}

export interface ResumoAuditoriaOperadorEntry {
  nomeOperador: string;
  totalClassificado: number;
  negociacaoReal: number;
  semNegociacao: number;
  indefinido: number;
}

export interface ResumoAuditoriaRetencaoEntry {
  porOperador: ResumoAuditoriaOperadorEntry[];
  totalGeralClassificado: number;
  totalGeralOsRetencao: number;
  totalGeralPendente: number;
}

export interface RetencaoKpisEntry {
  totalTratadas: number;
  totalRetidas: number;
  totalNaoRetidas: number;
  pctReversaoGeral: number;
  totalComissoes: number;
  operadoresNaMeta: number;
}

export interface ResumoGestao {
  ranking: RankingVendedorEntry[];
  evolucao: EvolucaoMensalEntry[];
  pops: PopStatusEntry[];
  piorGeral: PiorSinalAgoraEntry | null;
  piores: ClienteDegradadoHojeEntry[];
  auditoriaRetencao: ResumoAuditoriaRetencaoEntry | null;
  retencaoMes: RetencaoKpisEntry | null;
}

// ── Chamadas ─────────────────────────────────────────────────────

export const buscarCliente = (termo: string) =>
  api.get<ClienteCandidato[]>('/cliente', { params: { termo } }).then((r) => r.data);

export interface HistoricoTurnoConversa {
  pergunta: string;
  resposta: string;
}

export const consultarDiagnostico = (
  id_cliente: number,
  pergunta?: string,
  historico?: HistoricoTurnoConversa[],
) =>
  api.post<DiagnosticoResultado>('/consulta', { id_cliente, pergunta, historico }).then((r) => r.data);

export const buscarHistoricoConsultas = (id_cliente: number) =>
  api.get<DiagnosticoHistoricoItem[]>(`/consulta/${id_cliente}/historico`).then((r) => r.data);

export const buscarAgregados = (dimensao?: string) =>
  api.get<DiagnosticoAgregadoItem[]>('/agregado', { params: dimensao ? { dimensao } : {} }).then((r) => r.data);

export const buscarResumoGestao = () =>
  api.get<ResumoGestao>('/gestao/resumo').then((r) => r.data);

export const consultarGestao = (pergunta: string, historico?: HistoricoTurnoConversa[]) =>
  api.post<{ resposta: string; consultaId: string }>('/gestao/consulta', { pergunta, historico }).then((r) => r.data);

export const enviarFeedback = (consultaId: string, feedback: TipoFeedback, comentario?: string) =>
  api.post<{ success: boolean }>(`/consulta/${consultaId}/feedback`, { feedback, comentario }).then((r) => r.data);

export const listarRegras = () =>
  api.get<RegraNegocio[]>('/regras').then((r) => r.data);

export const criarRegra = (regra: RegraNegocioInput) =>
  api.post<RegraNegocio>('/regras', regra).then((r) => r.data);

export const editarRegra = (chave: string, regra: Omit<RegraNegocioInput, 'chave'>) =>
  api.put<RegraNegocio>(`/regras/${chave}`, regra).then((r) => r.data);

export const excluirRegra = (chave: string) =>
  api.delete<{ success: boolean }>(`/regras/${chave}`).then((r) => r.data);

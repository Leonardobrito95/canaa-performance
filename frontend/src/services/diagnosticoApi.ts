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
}

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

// ── Chamadas ─────────────────────────────────────────────────────

export const consultarDiagnostico = (id_cliente: number, pergunta?: string) =>
  api.post<DiagnosticoResultado>('/consulta', { id_cliente, pergunta }).then((r) => r.data);

export const buscarHistoricoConsultas = (id_cliente: number) =>
  api.get<DiagnosticoHistoricoItem[]>(`/consulta/${id_cliente}/historico`).then((r) => r.data);

export const buscarAgregados = (dimensao?: string) =>
  api.get<DiagnosticoAgregadoItem[]>('/agregado', { params: dimensao ? { dimensao } : {} }).then((r) => r.data);

import axios from 'axios';

const TOKEN_KEY = 'bdr_token';

const api = axios.create({
  baseURL: '/bdr/api/v1/vistoria-pop',
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

// ── Tipos ─────────────────────────────────────────────────────
// Lê public.vistoria_pop/vistoria_pendencias (porta 5002, sistema externo,
// mesma instância Postgres) — ver vistoriaPop.repository.ts (backend).

export interface VistoriaResumoPop {
  popName:           string;
  ultimaVistoria:    string | null;
  inspetor:          string | null;
  diasDesde:         number | null;
  pendenciasAbertas: number;
}

export interface VistoriaPendencia {
  id:                number;
  popName:           string;
  categoria:         string;
  descricao:         string;
  dataIdentificacao: string | null;
  status:            string;
  observacoes:       string | null;
  diasAberta:        number | null;
}

export interface VistoriaHistoricoItem {
  submissionId:   number;
  popName:        string;
  inspectorName:  string;
  submissionTime: string | null;
  formData:       Record<string, unknown>;
  photos:         string[];
}

export interface VistoriaAlerta {
  id:           string;
  tipo:         string;
  severidade:   'AVISO' | 'CRITICO';
  titulo:       string;
  descricao:    string;
  pop_name:     string;
  pendencia_id: string;
  status:       string;
  criado_em:    string;
  resolvido_em: string | null;
}

// ── Chamadas ─────────────────────────────────────────────────────

export const vistoriaPopApiClient = {
  getLink: (): Promise<{ url: string }> =>
    api.get('/link').then((r) => r.data),

  getResumo: (): Promise<{ pops: VistoriaResumoPop[]; pendencias: VistoriaPendencia[] }> =>
    api.get('/resumo').then((r) => r.data),

  getHistoricoPop: (popName: string): Promise<{ itens: VistoriaHistoricoItem[] }> =>
    api.get(`/pop/${encodeURIComponent(popName)}/historico`).then((r) => r.data),

  getAlertas: (): Promise<{ itens: VistoriaAlerta[] }> =>
    api.get('/alertas').then((r) => r.data),

  resolverAlerta: (id: string): Promise<VistoriaAlerta> =>
    api.post(`/alertas/${id}/resolver`).then((r) => r.data),
};

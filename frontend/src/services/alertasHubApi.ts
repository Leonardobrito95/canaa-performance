import axios from 'axios';

const alertasHubApi = axios.create({
  baseURL: '/bdr/api/v1/alertas-hub',
  headers: { 'Content-Type': 'application/json' },
});

alertasHubApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('bdr_token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

alertasHubApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) { localStorage.removeItem('bdr_token'); window.location.reload(); }
    return Promise.reject(err);
  }
);

export interface AlertaHubItem {
  id: string;
  origem: 'atendimento' | 'vistoria';
  tipo: string;
  severidade: string;
  titulo: string;
  descricao: string;
  contexto: string | null;
  criado_em: string;
  resolvido_em: string | null;
  status: string;
}

export interface AlertaHubResumo {
  itens: AlertaHubItem[];
  contagem: {
    critico: number;
    aviso: number;
    porOrigem: {
      atendimento: number;
      vistoria: number;
    };
  };
}

export async function fetchAlertasHub(): Promise<AlertaHubResumo> {
  const { data } = await alertasHubApi.get<AlertaHubResumo>('/resumo');
  return data;
}

export async function resolverAlertaHub(origem: 'atendimento' | 'vistoria', id: string): Promise<void> {
  await alertasHubApi.post(`/${origem}/${id}/resolver`);
}

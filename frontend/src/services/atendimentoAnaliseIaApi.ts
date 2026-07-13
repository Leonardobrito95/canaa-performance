import axios from 'axios';

const TOKEN_KEY = 'bdr_token';

const api = axios.create({
  baseURL: '/bdr/api/v1/atendimento/analise-ia',
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
// Camada analítica de IA em massa (Motivo/Adesão ao Script/Sentimento) — NÃO
// é a monitoria de QA humano (atendimentoQaApi.ts). É sinal de triagem que
// nenhum humano revisou ainda, nunca "nota oficial". Ver comentário do
// model AtendimentoAnaliseIa no schema.prisma (backend).

export type SentimentoCategoria = 'muito_negativo' | 'negativo' | 'neutro' | 'positivo' | 'muito_positivo';

/// Espelha o retorno cru do Prisma (snake_case), mesmo padrão de MonitoriaQa.
export interface AtendimentoAnaliseIa {
  id:                       string;
  opasuite_atendimento_id:  string;
  protocolo:                string;
  setor:                    string;
  canal:                    string;
  data_atendimento:         string;
  motivo_classificado:      string | null;
  adesao_script:            number | null;
  indice_sentimento:        number | null;
  sentimento_categoria:     SentimentoCategoria | null;
  justificativa:            string | null;
  confianca_insuficiente:   boolean;
  flag_triagem:             boolean;
  modelo_usado:             string | null;
  processado_em:            string;
}

export interface SentimentoPorSetor {
  setor:            string;
  qtd:              number;
  sentimentoMedio:  number | null;
  adesaoMedia:      number | null;
}

export interface MotivoIaResumo {
  motivo: string;
  qtd:    number;
}

export interface FiltrosAnaliseIa {
  setor?:     string;
  /// Grupo de setores (ex: SETORES_CENTRO_SOLUCAO de atendimentoApi.ts) — sem
  /// isso, o dashboard/triagem mostra os 8 setores juntos, incluindo VENDAS/
  /// POS_VENDAS (Comercial), mesmo numa tela que só cobre Centro de Solução.
  setores?:   string[];
  dateFrom?:  string;
  dateTo?:    string;
  /// true = todos os lançamentos do período; omitido/false = só a fila de
  /// triagem (flag_triagem=true, ordenada por pior sinal).
  todos?:     boolean;
}

// ── Chamadas ─────────────────────────────────────────────────────

function serializar(params: FiltrosAnaliseIa) {
  return { ...params, setores: params.setores?.join(',') };
}

export const atendimentoAnaliseIaApiClient = {
  getTriagem: (params: FiltrosAnaliseIa): Promise<{ itens: AtendimentoAnaliseIa[] }> =>
    api.get('/triagem', { params: serializar(params) }).then((r) => r.data),

  getDashboard: (params: FiltrosAnaliseIa): Promise<{ porSetor: SentimentoPorSetor[]; motivos: MotivoIaResumo[] }> =>
    api.get('/dashboard', { params: serializar(params) }).then((r) => r.data),
};

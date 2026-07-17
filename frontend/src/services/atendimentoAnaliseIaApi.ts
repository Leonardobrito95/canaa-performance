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
  /// Por que foi pra triagem. 'analise_leve' = sinal original (baixa adesão/
  /// sentimento ruim). Os demais só existem quando a Monitoria Automática
  /// pesada do CAIO escalou depois de já ter avaliado os 22 critérios.
  motivo_triagem:           'analise_leve' | 'identidade_nao_resolvida' | 'conversa_curta' | 'erro_critico' | 'nota_baixa' | null;
  /// Raciocínio completo do CAIO quando a Monitoria Automática pesada
  /// avaliou e escalou — os 22 critérios sugeridos com justificativa
  /// individual (mesmo formato de SugestaoCriterioQa em atendimentoQaApi.ts)
  /// e a observação geral. null quando a triagem veio só da análise leve.
  qa_ia_pontuacao_sugerida: number | null;
  qa_ia_criterios_sugeridos: { criterio: string; sugestao: string; justificativa: string }[] | null;
  qa_ia_observacoes:        string | null;
  /// Marcado pelo QA na fila pra pedir avaliação manual, sem sugestão do
  /// CAIO (ver marcarRevisaoManual no backend) — persistido, não é estado
  /// de sessão local.
  revisao_manual:           boolean;
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

  marcarRevisaoManual: (id: string, valor: boolean): Promise<AtendimentoAnaliseIa> =>
    api.post(`/${id}/revisao-manual`, { valor }).then((r) => r.data),
};

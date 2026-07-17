import axios from 'axios';

const TOKEN_KEY = 'bdr_token';

const api = axios.create({
  baseURL: '/bdr/api/v1/atendimento/qa',
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
// Rubrica de 22 critérios portada fielmente do sistema legado (ver
// backend/src/modules/atendimento/atendimento.qa.types.ts) — duplicada aqui
// porque frontend/backend não compartilham pacote de tipos neste monorepo
// (mesmo padrão já usado pra SetorAtendimento em atendimentoApi.ts). Critério
// novo precisa ser adicionado nos dois lados.

export type RespostaCriterio = 'Conforme' | 'Não Conforme' | 'Não se aplica';

export const CRITERIOS_QA = [
  'Script', 'Sondagem', 'Conhecimento técnico', 'Vícios de linguagem', 'Tom de voz',
  'Cordialidade', 'Controle de Objeção', 'Comunicação e Linguagem', 'Retorno ao cliente', 'Ação de retenção',
  'Confirmação de dados', 'Transferencia Indevida', 'Uso do Mute', 'Erro de procedimento',
  'Negociação e venda', 'Agilidade', 'Prontidão', 'Tabulação', 'Resolução do conflito',
  'Personalização', 'Omissão de atendimento', 'Inf. Protocolo?',
] as const;

export type CriterioQa = typeof CRITERIOS_QA[number];

export const PENALIZACOES_QA: Record<CriterioQa, number> = {
  'Omissão de atendimento':       10.00,
  'Confirmação de dados':          5.00,
  'Erro de procedimento':          5.00,
  'Inf. Protocolo?':               5.00,
  'Conhecimento técnico':          2.50,
  'Vícios de linguagem':           2.50,
  'Comunicação e Linguagem':       2.50,
  'Transferencia Indevida':        2.50,
  'Prontidão':                     2.50,
  'Tabulação':                     2.50,
  'Script':                        2.50,
  'Cordialidade':                  2.00,
  'Ação de retenção':              2.00,
  'Resolução do conflito':         1.50,
  'Sondagem':                      1.00,
  'Tom de voz':                    1.00,
  'Controle de Objeção':           1.00,
  'Retorno ao cliente':            1.00,
  'Uso do Mute':                   1.00,
  'Negociação e venda':            1.00,
  'Agilidade':                     1.00,
  'Personalização':                0.50,
};

export const CRITERIO_ERRO_CRITICO: CriterioQa = 'Omissão de atendimento';

/// Cálculo local só pra feedback visual instantâneo enquanto o QA preenche o
/// formulário — o servidor recalcula com a mesma fórmula e é a fonte de
/// verdade real no salvar (ver calcularPontuacaoQa no backend).
export function calcularPontuacaoLocal(criterios: Partial<Record<CriterioQa, RespostaCriterio>>): { pontuacao: number; itensAplicaveis: number; erroCritico: boolean } {
  if (criterios[CRITERIO_ERRO_CRITICO] === 'Não Conforme') {
    return { pontuacao: 0, itensAplicaveis: 0, erroCritico: true };
  }
  let pontuacao = 10.0;
  let itensAplicaveis = 0;
  for (const criterio of CRITERIOS_QA) {
    const resposta = criterios[criterio];
    if (resposta === 'Não Conforme') pontuacao -= PENALIZACOES_QA[criterio];
    if (resposta === 'Conforme' || resposta === 'Não Conforme') itensAplicaveis++;
  }
  return { pontuacao: Math.max(0, Math.round(pontuacao * 100) / 100), itensAplicaveis, erroCritico: false };
}

export function classificarPontuacao(media: number): string {
  if (media >= 9.0) return 'Ótimo';
  if (media >= 7.0) return 'Bom';
  return 'Não Conforme';
}

/// Espelha o retorno cru do Prisma (snake_case) — os endpoints de leitura
/// (GET /qa, GET /qa/:id) devolvem o registro direto, sem transformar pra
/// camelCase. POST/PUT já esperam camelCase no corpo (ver MonitoriaQaInput).
export interface MonitoriaQa {
  id:                   string;
  id_legado:             number | null;
  protocolo:             string;
  data_atendimento:      string | null;
  data_monitoria:        string | null;
  nome_agente:            string;
  equipe:                 string;
  motivo_atendimento:     string | null;
  monitoria_zero:         string | null;
  avaliacao_atd:          number | null;
  erro_critico:           boolean;
  itens_aplicaveis:       number | null;
  pontuacao:              number | null;
  observacoes:            string | null;
  ofensa_verbal_legado:   string | null;
  criterios:              Partial<Record<CriterioQa, RespostaCriterio>>;
  /// 'caio_automatico' = criada sozinha pelo copiloto, sem revisão humana (só pra casos de
  /// baixo risco — ver atendimento.monitoria-automatica.ts no backend).
  origem:                 'legado' | 'canaa_performance' | 'caio_automatico';
  avaliado_por:           string | null;
  /// "Ciência" do agente avaliado — null enquanto ele não confirmou ter visto a nota.
  comunicado_em:          string | null;
  comunicado_nota:        string | null;
  criado_em:              string;
  atualizado_em:          string;
}

export interface MonitoriaQaInput {
  protocolo:          string;
  dataAtendimento:     string;
  dataMonitoria:       string;
  nomeAgente:          string;
  equipe:              string;
  motivoAtendimento?:  string;
  monitoriaZero?:      string;
  avaliacaoAtd?:       number;
  observacoes?:        string;
  criterios:           Partial<Record<CriterioQa, RespostaCriterio>>;
}

export interface CriterioNaoConformeResumo {
  criterio:     CriterioQa;
  naoConforme:  number;
  total:        number;
  pct:          number;
}

export interface MotivoQaResumo {
  motivo:  string;
  total:   number;
  media:   number | null;
}

export interface AgenteQaRanking {
  nomeAgente:      string;
  equipe:          string;
  qtd:             number;
  pontuacaoMedia:  number;
  classificacao:   string;
}

export interface AgenteQa {
  id:         string;
  nome:       string;
  equipe:     string;
  status:     'Ativo' | 'Inativo';
  criado_em:  string;
}

export interface SugestaoCriterioQa {
  criterio:       CriterioQa;
  sugestao:       RespostaCriterio;
  justificativa:  string;
}

export interface SugestaoMonitoriaQa {
  criterios:     SugestaoCriterioQa[];
  observacoes:   string;
  aviso?:        string;
}

export interface DashboardQa {
  criterios:      CriterioNaoConformeResumo[];
  motivos:        MotivoQaResumo[];
  ranking:        AgenteQaRanking[];
  agentesAtivos:  AgenteQa[];
  equipes:        string[];
}

export interface FiltrosQa {
  agente?:    string;
  equipe?:    string;
  dateFrom?:  string;
  dateTo?:    string;
  /// Filtra por quem avaliou — usado pra separar a lista de "Monitorados
  /// pelo Agente" (origem='caio_automatico') das demais.
  origem?:    'legado' | 'canaa_performance' | 'caio_automatico';
}

// ── Chamadas ─────────────────────────────────────────────────────

export const atendimentoQaApiClient = {
  getDashboard: (params: FiltrosQa): Promise<DashboardQa> =>
    api.get('/dashboard', { params }).then((r) => r.data),

  listar: (params: FiltrosQa): Promise<{ monitorias: MonitoriaQa[] }> =>
    api.get('', { params }).then((r) => r.data),

  buscarPorId: (id: string): Promise<MonitoriaQa> =>
    api.get(`/${id}`).then((r) => r.data),

  criar: (input: MonitoriaQaInput): Promise<MonitoriaQa> =>
    api.post('', input).then((r) => r.data),

  atualizar: (id: string, input: MonitoriaQaInput): Promise<MonitoriaQa> =>
    api.put(`/${id}`, input).then((r) => r.data),

  /// Copiloto do CAIO — só sugere, nunca grava. O QA humano confirma/edita e
  /// envia via criar()/atualizar() normalmente, como se tivesse preenchido à mão.
  sugestao: (protocolo: string): Promise<{ sugestao: SugestaoMonitoriaQa; metricas: unknown }> =>
    api.get(`/sugestao/${protocolo}`).then((r) => r.data),

  /// Autoatendimento do agente — só as próprias avaliações (identidade
  /// resolvida no backend pelo ixc_user_id do login, não por parâmetro).
  minhasAvaliacoes: (): Promise<{ agente: { nome: string; equipe: string }; monitorias: MonitoriaQa[] }> =>
    api.get('/minhas-avaliacoes').then((r) => r.data),

  darCiencia: (id: string, comentario?: string): Promise<MonitoriaQa> =>
    api.post(`/${id}/comunicar`, { comentario }).then((r) => r.data),
};

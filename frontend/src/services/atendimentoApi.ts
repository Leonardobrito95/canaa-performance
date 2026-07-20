import axios from 'axios';

const TOKEN_KEY = 'bdr_token';

const api = axios.create({
  baseURL: '/bdr/api/v1/atendimento',
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

/// Espelha SETORES_ATENDIMENTO do backend (atendimento.types.ts) — setor
/// novo precisa ser adicionado nos dois lados (frontend/backend não
/// compartilham pacote de tipos neste monorepo), mas só aqui no frontend,
/// não espalhado pelas views.
export type SetorAtendimento = 'SAC' | 'N1' | 'N2' | 'COBRANCA' | 'VENDAS' | 'RETENCAO' | 'POS_VENDAS' | 'BACKOFFICE';

export const SETORES_ATENDIMENTO_ORDEM: SetorAtendimento[] = ['SAC', 'N1', 'N2', 'COBRANCA', 'VENDAS', 'RETENCAO', 'POS_VENDAS', 'BACKOFFICE'];

/// Vendas e Pós-Vendas são departamentos do Comercial, não do Centro de
/// Solução — cada grupo de navegação vê só os seus setores nessa página de
/// atendimento (ver AtendimentoResumoPanel.vue). O chat de gestão do C.A.I.O.
/// continua vendo os 8 juntos (não usa essas constantes).
export const SETORES_CENTRO_SOLUCAO: SetorAtendimento[] = ['SAC', 'N1', 'N2', 'COBRANCA', 'RETENCAO', 'BACKOFFICE'];
export const SETORES_COMERCIAL: SetorAtendimento[]      = ['VENDAS', 'POS_VENDAS'];

export const NOMES_SETOR: Record<SetorAtendimento, string> = {
  SAC:        'SAC',
  N1:         'Suporte N1',
  N2:         'Suporte N2',
  COBRANCA:   'Cobrança',
  VENDAS:     'Vendas',
  RETENCAO:   'Retenção',
  POS_VENDAS: 'Pós-Vendas',
  BACKOFFICE: 'Backoffice',
};

/// Mesma paleta usada em ChartRanking.vue — reaproveitada aqui pra manter
/// cor consistente do mesmo setor em gráficos diferentes.
export const CORES_SETOR: Record<SetorAtendimento, string> = {
  SAC:        '#00f0ff',
  N1:         '#c7ff00',
  N2:         '#a855f7',
  COBRANCA:   '#f59e0b',
  VENDAS:     '#f472b6',
  RETENCAO:   '#34d399',
  POS_VENDAS: '#60a5fa',
  BACKOFFICE: '#fb923c',
};

export interface KpisAtendimento {
  setor:               SetorAtendimento;
  volume:              number;
  /// Agregado (chat + ligação) — ver *Chat/*Ligacao pra quebra por canal.
  tmaMs:               number | null;
  tmeMs:               number | null;
  /// Só canal=chat — ligação não tem "tempo de resposta" (é atendida ou não).
  tmrMs:               number | null;
  volumeChat:          number;
  volumeLigacao:       number;
  tmaMsChat:           number | null;
  tmeMsChat:           number | null;
  tmaMsLigacao:        number | null;
  tmeMsLigacao:        number | null;
  escalonamentos:      number;
  pctEscalonamento:    number | null;
  notaMediaSatisfacao: number | null;
  qtdAvaliados:        number;
}

export interface RankingAtendenteEntry {
  nome: string;
  qtd:  number;
}

export interface RankingAvaliacaoEntry {
  nome: string;
  notaMedia: number;
  qtdAvaliacoes: number;
}

export interface MotivoAtendimentoEntry {
  motivo: string;
  qtd:    number;
}

export interface RankingsAtendimento {
  atendentes: RankingAtendenteEntry[];
  avaliacoes: RankingAvaliacaoEntry[];
  motivos:    MotivoAtendimentoEntry[];
}

/// Alerta operacional em tempo real (conversa parada, SLA de fila, agente
/// ausente, fila acumulada) — feed interno, não confundir com os alertas
/// agregados de volume/escalonamento que vão por e-mail.
export interface AlertaOperacional {
  id:                       string;
  tipo:                     'CONVERSA_PARADA' | 'SLA_FILA' | 'AGENTE_AUSENTE' | 'FILA_ACUMULADA';
  severidade:               'AVISO' | 'CRITICO';
  titulo:                   string;
  descricao:                string;
  setor:                    string;
  opasuite_atendimento_id:  string;
  agente_nome:              string;
  status:                   'ABERTO' | 'RESOLVIDO';
  criado_em:                string;
  resolvido_em:             string | null;
}

export interface OperadorAoVivo {
  nome: string;
  setor: string;
  status: 'on' | 'au' | 'pause';
  tempoStatusMs: number;
  volumeHoje: number;
  tmaMs: number | null;
  tmeMs: number | null;
  /// Só canal=chat — ligação não tem "tempo de resposta" (é atendida ou não).
  tmrMs: number | null;
  volumeChat: number;
  volumeLigacao: number;
  tmaMsChat: number | null;
  tmeMsChat: number | null;
  tmaMsLigacao: number | null;
  tmeMsLigacao: number | null;
}

/// Indicador de jornada por operador (RH/gestão) num período configurável —
/// diferente de OperadorAoVivo (status atual, sem histórico).
export interface IndicadorJornadaOperador {
  nome: string;
  setor: SetorAtendimento;
  volumeAtendimentos: number;
  tempoLogadoMs: number;
  tempoProdutivoMs: number;
  tempoPausaMs: number;
  tempoAusenteMs: number;
  pctProdutivo: number | null;
  pctPausa: number | null;
  pctAusente: number | null;
}

/// Limites de jornada configurados pela gestão via Regras de Negócio
/// (categoria ATENDIMENTO) — só pra destaque visual da tabela.
export interface ConfigJornada {
  limiteIndisponibilidadePct: number;
  metasEficienciaPorSetor: Partial<Record<SetorAtendimento, number>>;
}

// ── Chamadas ─────────────────────────────────────────────────────

export const atendimentoApiClient = {
  getResumo: (params: { dateFrom?: string; dateTo?: string; setores?: SetorAtendimento[] }): Promise<{ kpis: KpisAtendimento[]; rankings: RankingsAtendimento }> =>
    api.get('/resumo', { params: { ...params, setores: params.setores?.join(',') } }).then((r) => r.data),

  auditarPontual: (protocolo: string, pergunta?: string): Promise<{ texto: string; consultaId: string }> =>
    api.post(`/auditoria/${protocolo}`, { pergunta }).then((r) => r.data),

  getAlertasOperacionais: (): Promise<{ itens: AlertaOperacional[] }> =>
    api.get('/alertas-operacionais').then((r) => r.data),

  resolverAlertaOperacional: (id: string): Promise<AlertaOperacional> =>
    api.post(`/alertas-operacionais/${id}/resolver`).then((r) => r.data),

  getOperadoresAoVivo: (setores?: SetorAtendimento[]): Promise<{ operadores: OperadorAoVivo[] }> =>
    api.get('/operadores-ao-vivo', { params: { setores: setores?.join(',') } }).then((r) => r.data),

  getIndicadoresJornada: (params: { dateFrom?: string; dateTo?: string; setores?: SetorAtendimento[] }): Promise<{ indicadores: IndicadorJornadaOperador[] }> =>
    api.get('/indicadores-jornada', { params: { ...params, setores: params.setores?.join(',') } }).then((r) => r.data),

  getConfigJornada: (): Promise<ConfigJornada> =>
    api.get('/config-jornada').then((r) => r.data),
};

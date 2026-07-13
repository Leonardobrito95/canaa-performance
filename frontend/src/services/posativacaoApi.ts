import axios from 'axios';

const TOKEN_KEY = 'bdr_token';

const api = axios.create({
  baseURL: '/bdr/api/v1/posativacao',
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
// Portado do sistema Flask original (/home/canaa/Campo/app.py, porta 5009) —
// indicador de qualidade de instalação/campo (cliente que contata o suporte
// logo após ativar o contrato).

export type Janela = 30 | 60 | 90;

export interface FiltrosPosAtivacao {
  janela?: Janela;
}

export interface FiltrosClientesPosAtivacao extends FiltrosPosAtivacao {
  page?:       number;
  soContato?:  boolean;
  busca?:      string;
  assunto?:    string;
  minTickets?: number;
}

export interface PosAtivacaoKpis {
  total:          number;
  instalacoes:    number;
  mudancas:       number;
  comContato:     number;
  semContato:     number;
  pct:            number;
  totalContatos:  number;
  mediaDias:      number;
  janela:         number;
  deltaTotal:     number | null;
  deltaPct:       number | null;
  deltaTickets:   number | null;
  prevTotal:      number;
  prevPct:        number;
}

export interface PosAtivacaoMotivo {
  assunto: string;
  qtd:     number;
}

export interface PosAtivacaoDistribuicaoFaixa {
  faixa: string;
  qtd:   number;
}

export interface PosAtivacaoTendenciaSemana {
  semana:     string;
  inicio:     string;
  ativacoes:  number;
  comContato: number;
  taxa:       number;
}

export interface PosAtivacaoChurn {
  comContatoTotal:    number;
  comContatoCancelou: number;
  semContatoTotal:    number;
  semContatoCancelou: number;
  taxaChurnCom:       number;
  taxaChurnSem:       number;
}

export interface PosAtivacaoTecnico {
  tecnico:  string;
  clientes: number;
  qtd:      number;
}

export interface PosAtivacaoClienteResumo {
  contratoId:      number;
  idCliente:       number;
  nome:            string;
  telefone:        string | null;
  dataAtivacao:    string | null;
  motivoInclusao:  string;
  totalContatos:   number;
  primeiroContato: string | null;
  diasPrimeiro:    number | null;
}

export interface PosAtivacaoClientesPagina {
  linhas: PosAtivacaoClienteResumo[];
  total:  number;
  page:   number;
  pages:  number;
}

export interface PosAtivacaoContato {
  ticketId:    number;
  dataCriacao: string | null;
  status:      string | null;
  statusLabel: string;
  protocolo:   string | null;
  assunto:     string;
  diasApos:    number;
  ticketMsg:   string | null;
  osId:        number | null;
  osAssunto:   string | null;
  osStatus:    string | null;
  osMsg:       string | null;
  osResposta:  string | null;
}

export interface PosAtivacaoBairro {
  bairro: string;
  qtd:    number;
}

export interface PosAtivacaoCanal {
  canal: string;
  qtd:   number;
}

export interface PosAtivacaoSlaFaixa {
  faixa: string;
  qtd:   number;
}

// ── Chamadas ─────────────────────────────────────────────────────

function toParams(f: FiltrosClientesPosAtivacao) {
  return {
    janela:      f.janela,
    page:        f.page,
    so_contato:  f.soContato ? '1' : undefined,
    busca:       f.busca || undefined,
    assunto:     f.assunto || undefined,
    min_tickets: f.minTickets || undefined,
  };
}

export const posativacaoApiClient = {
  getKpis: (f: FiltrosPosAtivacao): Promise<PosAtivacaoKpis> =>
    api.get('/kpis', { params: f }).then((r) => r.data),

  getMotivos: (f: FiltrosPosAtivacao): Promise<PosAtivacaoMotivo[]> =>
    api.get('/motivos', { params: f }).then((r) => r.data),

  getDistribuicao: (f: FiltrosPosAtivacao): Promise<PosAtivacaoDistribuicaoFaixa[]> =>
    api.get('/distribuicao', { params: f }).then((r) => r.data),

  getTendencia: (f: FiltrosPosAtivacao): Promise<PosAtivacaoTendenciaSemana[]> =>
    api.get('/tendencia', { params: f }).then((r) => r.data),

  getChurn: (): Promise<PosAtivacaoChurn> =>
    api.get('/churn').then((r) => r.data),

  getTecnicos: (f: FiltrosPosAtivacao): Promise<PosAtivacaoTecnico[]> =>
    api.get('/tecnicos', { params: f }).then((r) => r.data),

  getBairros: (f: FiltrosPosAtivacao): Promise<PosAtivacaoBairro[]> =>
    api.get('/bairros', { params: f }).then((r) => r.data),

  getCanais: (f: FiltrosPosAtivacao): Promise<PosAtivacaoCanal[]> =>
    api.get('/canais', { params: f }).then((r) => r.data),

  getResolucaoSla: (f: FiltrosPosAtivacao): Promise<PosAtivacaoSlaFaixa[]> =>
    api.get('/resolucao-sla', { params: f }).then((r) => r.data),

  getClientes: (f: FiltrosClientesPosAtivacao): Promise<PosAtivacaoClientesPagina> =>
    api.get('/clientes', { params: toParams(f) }).then((r) => r.data),

  getContatosCliente: (idCliente: number, f: FiltrosPosAtivacao): Promise<PosAtivacaoContato[]> =>
    api.get(`/clientes/${idCliente}/contatos`, { params: f }).then((r) => r.data),

  /// Download exige o header Authorization (rota autenticada) — por isso
  /// busca como blob via axios em vez de um <a href> direto, e devolve o
  /// Blob pronto pra disparar o download no componente.
  exportarClientesCsv: (f: FiltrosClientesPosAtivacao): Promise<Blob> =>
    api.get('/clientes/export', { params: toParams(f), responseType: 'blob' }).then((r) => r.data),
};

import axios from 'axios';

const TOKEN_KEY = 'bdr_token';

function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return q.toString();
}

// ── BDR ──────────────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: '/bdr/api/v1/bdr',
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
  }
);

export interface ContractData {
  id_contrato:  string;
  nome_cliente: string;
  plano_atual:  string;
  valor_atual:  number;
}

export interface Commission {
  id: string;
  id_contrato: string;
  nome_cliente: string;
  vendedor: string;
  tipo_negociacao: 'Upgrade' | 'Downgrade' | 'Refidelizacao';
  plano_atual:     string | null;
  plano_novo:      string | null;
  valor_atual:     string;
  valor_novo:      string | null;
  valor_comissao:  string;
  data_registro:   string;
}

export interface Adjustment {
  id:             string;
  vendedor:       string;
  descricao:      string;
  valor:          string;
  registrado_por: string;
  data_registro:  string;
}

export const bdrApi = {
  getPlans:            (): Promise<string[]>    => api.get('/plans').then((r) => r.data),
  getConsultants:      (): Promise<string[]>    => api.get('/consultants').then((r) => r.data),
  refreshConsultants:  (): Promise<{ consultants: string[]; total: number }> => api.post('/consultants/refresh').then((r) => r.data),
  getContract: (id: string): Promise<ContractData> => api.get(`/contracts/${id}`).then((r) => r.data),
  registerCommission: (p: { id_contrato: string; vendedor: string; tipo_negociacao: 'Upgrade' | 'Downgrade' | 'Refidelizacao'; plano_novo?: string; valor_novo?: number }): Promise<Commission> =>
    api.post('/commissions', p).then((r) => r.data),
  listCommissions: (p?: { dateFrom?: string; dateTo?: string }): Promise<Commission[]> =>
    api.get(`/commissions?${buildQuery({ dateFrom: p?.dateFrom, dateTo: p?.dateTo })}`).then((r) => r.data),
  listAdjustments: (): Promise<Adjustment[]> => api.get('/adjustments').then((r) => r.data),
  createAdjustment: (p: { vendedor: string; descricao: string; valor: number }): Promise<Adjustment> =>
    api.post('/adjustments', p).then((r) => r.data),
  deleteAdjustment: (id: string): Promise<void> => api.delete(`/adjustments/${id}`).then((r) => r.data),
};

// ── Vendas ────────────────────────────────────────────────────────────────────

const vendasApi = axios.create({
  baseURL: '/bdr/api/v1/vendas',
  headers: { 'Content-Type': 'application/json' },
});

vendasApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

vendasApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) { localStorage.removeItem(TOKEN_KEY); window.location.reload(); }
    return Promise.reject(err);
  }
);

export interface ContractRecord {
  id_contrato: string;
  id_cliente: string;
  nome_cliente: string;
  plano: string;
  data_ativacao: string;
  status_contrato: string;
  status_internet: string;
  valor_mensal: number;
  nome_vendedor: string;
  tipo_venda: string;
  segmento: string;
  cortesia: string;
  vencimento: string;
  assinatura_zapsign: string;
  status_comissao: string;
  motivo_bloqueio: string | null;
  comissao: number;
}

export interface ContractKpis {
  totalContratos: number;
  faturamentoMensal: number;
  comissoesLiberadas: number;
  comissoesBloqueadas: number;
  comissoesPendentes: number;
  valorAtivado: number;          // todos os contratos — base da meta
  valorLiberado: number;         // só liberados — base da comissão
  valorBloqueado: number;
  valorComissaoLiberada: number;
  metaAlvo: number;
  b2c: number;
  b2b: number;
  cortesias: number;
}

export interface ContractsResult { contracts: ContractRecord[]; kpis: ContractKpis; }

export interface SaleRecord {
  id_alteracao: string;
  id_contrato: string;
  data_hora_alteracao: string;
  valor_atual: number;
  valor_novo: number | null;
  diferenca_valor: number | null;
  tipo_alteracao: 'Upgrade' | 'Downgrade' | 'Refidelizacao';
  nome_vendedor: string | null;
  contrato_atual: string | null;
  contrato_novo: string | null;
  cliente: string | null;
  id_os: string | null;
  comissao_bdr: number;
}

export interface ComissoesMesResult {
  source:            'snapshot' | 'live';
  mes_referencia:    string;
  enviado_pagamento: boolean;
  data_envio:        string | null;
  enviado_por:       string | null;
  data_snapshot:     string | null;
  contracts:         ContractRecord[];
}

export interface RelatorioEnvioStatus {
  comercial:  { enviado: boolean; em?: string; por?: string };
  financeiro: { enviado: boolean; em?: string; por?: string };
}

export const vendasApiClient = {
  getContracts: (p: { dateFrom?: string; dateTo?: string; vendedor?: string }): Promise<ContractsResult> =>
    vendasApi.get(`/contracts?${buildQuery(p)}`).then((r) => r.data),

  getComissoesMes: (mes: string, vendedor?: string): Promise<ComissoesMesResult> =>
    vendasApi.get(`/comissoes/${mes}${vendedor ? `?vendedor=${encodeURIComponent(vendedor)}` : ''}`).then((r) => r.data),

  gerarSnapshot: (mes: string): Promise<{ total: number; liberadas: number; bloqueadas: number }> =>
    vendasApi.post(`/snapshots/${mes}`).then((r) => r.data),

  enviarParaPagamento: (mes: string): Promise<{ enviados: number; mes_referencia: string }> =>
    vendasApi.post(`/snapshots/${mes}/pagar`).then((r) => r.data),

  refreshZapSign: (): Promise<{ message: string; zapsign: number; gov: number; financeiro: number }> =>
    vendasApi.post('/contracts/zapsign/refresh').then((r) => r.data),

  debugZapSign: (contractId: string): Promise<{ contractId: string; status: string; cacheSize: number; cacheExpiresAt: string }> =>
    vendasApi.get(`/contracts/zapsign/debug/${contractId}`).then((r) => r.data),

  getStatusRelatorio: (mes: string): Promise<RelatorioEnvioStatus> =>
    vendasApi.get(`/relatorio/${mes}/status`).then((r) => r.data),

  enviarFinanceiro: (mes: string): Promise<{ message: string }> =>
    vendasApi.post(`/relatorio/${mes}/enviar-financeiro`).then((r) => r.data),
};

// ── Retenção ──────────────────────────────────────────────────────────────────

const retencaoApi = axios.create({
  baseURL: '/bdr/api/v1/retencao',
  headers: { 'Content-Type': 'application/json' },
});
retencaoApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});
retencaoApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) { localStorage.removeItem(TOKEN_KEY); window.location.reload(); }
    return Promise.reject(err);
  }
);

export interface RetencaoOperador {
  nome_operador:   string;
  qtd_tratadas:    number;
  qtd_retidas:     number;
  qtd_nao_retidas: number;
  pct_reversao:    number;
  comissao:        number;
  faixa:           string;
}

export interface RetencaoKpis {
  totalTratadas:    number;
  totalRetidas:     number;
  totalNaoRetidas:  number;
  pctReversaoGeral: number;
  totalComissoes:   number;
  operadoresNaMeta: number;
}

export interface RetencaoResult {
  kpis:       RetencaoKpis;
  operadores: RetencaoOperador[];
}

export interface NegociacaoData {
  valor_original:  number;
  valor_negociado: number;
  descricao:       string | null;
  registrado_por:  string;
  data_registro:   string;
}

export interface AuditoriaData {
  classificacao:        'NEGOCIACAO_REAL' | 'SEM_NEGOCIACAO' | 'INDEFINIDO';
  justificativa:        string;
  negociacao_detectada: string | null;
  divergencia_nota_os:  string | null;
}

export interface RetencaoDetalhe {
  id_chamado:       string;
  data_abertura:    string;
  nome_operador:    string;
  nome_cliente:     string;
  valor_mensal:     number;
  id_diagnostico:   number | null;
  desc_diagnostico: string;
  resultado:        'RETIDO' | 'NAO_RETIDO' | 'PENDENTE';
  negociacao:       NegociacaoData | null;
  auditoria:        AuditoriaData | null;
}

export interface MensagemOpaSuite {
  data:  string | null;
  texto: string;
}

export interface ConversaOpaSuite {
  protocolo: string;
  mensagens: MensagemOpaSuite[];
  /// 'pabx' = ligação — mensagens são só o roteiro automático da URA, não a
  /// conversa real com o atendente (que só existe como gravação de áudio).
  canal: string | null;
}

export const retencaoApiClient = {
  get: (p: { dateFrom?: string; dateTo?: string; operador?: string }): Promise<RetencaoResult> =>
    retencaoApi.get(`/?${buildQuery(p)}`).then((r) => r.data),

  getDetalhe: (p: { dateFrom?: string; dateTo?: string; operador?: string }): Promise<RetencaoDetalhe[]> =>
    retencaoApi.get(`/detalhe?${buildQuery(p)}`).then((r) => r.data),

  registerNegociacao: (p: { id_chamado: string; valor_original: number; valor_negociado: number; descricao?: string }): Promise<NegociacaoData> =>
    retencaoApi.post('/negociacao', p).then((r) => r.data),

  deleteNegociacao: (id_chamado: string): Promise<void> =>
    retencaoApi.delete(`/negociacao/${id_chamado}`).then((r) => r.data),

  getConversaOpaSuite: (id_chamado: string): Promise<{ conversas: ConversaOpaSuite[] }> =>
    retencaoApi.get(`/auditoria/${id_chamado}/conversa`).then((r) => r.data),
};

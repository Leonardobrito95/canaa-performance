// ============================================================
// POS-ATIVACAO — Tipos do módulo de acompanhamento pós-instalação
// Portado do sistema Flask original (/home/canaa/Campo/app.py, porta 5009)
// ============================================================

export interface FiltrosPosAtivacao {
  /// Janela de dias desde a ativação — só aceita 30/60/90 (mesma regra do
  /// sistema original, p_janela()).
  janela?: 30 | 60 | 90;
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
  /// Comparação com a janela equivalente imediatamente anterior — null
  /// quando não há base de comparação (período anterior sem ativação).
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
  contratoId:       number;
  idCliente:        number;
  nome:             string;
  telefone:         string | null;
  dataAtivacao:     string | null;
  motivoInclusao:   string;
  totalContatos:    number;
  primeiroContato:  string | null;
  diasPrimeiro:     number | null;
}

export interface PosAtivacaoClientesPagina {
  linhas: PosAtivacaoClienteResumo[];
  total:  number;
  page:   number;
  pages:  number;
}

/// Rótulos de status de su_ticket — mesma tabela TICKET_STATUS do sistema original.
export const TICKET_STATUS_LABEL: Record<string, string> = {
  T:    'Triagem',
  C:    'Cancelado',
  F:    'Finalizado',
  EX:   'Em Execução',
  OSAB: 'OS Aberta',
  OSAG: 'OS Agendada',
  OSEX: 'OS Execução',
};

export interface PosAtivacaoContato {
  ticketId:     number;
  dataCriacao:  string | null;
  status:       string | null;
  statusLabel:  string;
  protocolo:    string | null;
  assunto:      string;
  diasApos:     number;
  ticketMsg:    string | null;
  osId:         number | null;
  osAssunto:    string | null;
  osStatus:     string | null;
  osMsg:        string | null;
  osResposta:   string | null;
}

/// Fato resumido de pós-ativação para UM cliente — usado pelo Diagnóstico
/// (contexto por cliente) e pelo CAIO, não pelo dashboard próprio.
export interface PosAtivacaoFatoCliente {
  dataAtivacao:   string;
  totalContatos:  number;
  diasPrimeiro:   number | null;
  motivos:        string[];
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

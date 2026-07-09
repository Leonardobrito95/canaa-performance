// ============================================================
// DIAGNOSTICO — Tipos do contexto coletado para a IA
// ============================================================

export interface HistoricoSinalEntry {
  snapshotData:   Date;
  pop:            string;
  ponDescricao:   string;
  sinalRx:        number;
  sinalTx:        number;
  nivelSinal:     string;
  diasDegradado:  number;
  scoreUrgencia:  number;
}

export interface OsEntry {
  idOssChamado:  number;
  mensagem:      string;
  mensagemResposta: string | null;
  status:        string;
  dataAbertura:  Date | null;
  dataFechamento: Date | null;
  tecnicoId:     number | null;
  endereco:      string | null;
}

export interface OsMensagemEntry {
  data:      Date | null;
  status:    string;
  historico: string;
  mensagem:  string;
  colaborador: string | null;
}

export interface OsArquivoEntry {
  dataEnvio:      Date | null;
  nomeArquivo:    string;
  descricao:      string;
  classificacao:  string;
  localArquivo:   string;
}

export interface ContextoComercial {
  vendas: {
    idContrato:    string;
    plano:         string;
    statusComissao: string;
    motivoBloqueio: string | null;
    valorMensal:   number;
  }[];
  comissoesBdr: {
    tipoNegociacao: string;
    dataRegistro:   Date;
    valorComissao:  number;
  }[];
  retencaoNegociacoes: {
    idChamado:      string;
    valorOriginal:  number;
    valorNegociado: number;
    descricao:      string | null;
    dataRegistro:   Date;
  }[];
}

export interface ContextoClienteDiagnostico {
  idCliente:       number;
  historicoSinal:  HistoricoSinalEntry[];
  ordensServico:   OsEntry[];
  osMensagens:     Record<number, OsMensagemEntry[]>; // por idOssChamado
  osArquivos:      Record<number, OsArquivoEntry[]>;  // por idOssChamado
  comercial:       ContextoComercial;
  regrasNegocio:   Record<string, string>;
}

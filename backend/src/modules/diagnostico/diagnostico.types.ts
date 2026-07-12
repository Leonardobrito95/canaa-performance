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
  tecnicoNome:   string | null;
  endereco:      string | null;
}

/// "Atendimento" (su_ticket) é um conceito diferente de O.S. (su_oss_chamado)
/// no IXC — tickets de suporte/solicitação, cada um com seu próprio
/// responsável (su_ticket.id_responsavel_tecnico), que resolve via a mesma
/// tabela funcionarios usada para o técnico da O.S.
export interface AtendimentoEntry {
  id:            number;
  titulo:        string;
  status:        string | null;
  dataCriacao:   Date | null;
  responsavelNome: string | null;
}

export interface OsMensagemEntry {
  data:      Date | null;
  status:    string;
  historico: string;
  mensagem:  string;
  colaborador: string | null;
}

export interface OsArquivoEntry {
  id:             number;
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
    /// Mês de referência do snapshot (ex: "2026-04") e quando ele foi gerado.
    /// O snapshot é imutável (cron do dia 19) — status/motivoBloqueio refletem
    /// a situação EXATA daquele mês e nunca são recalculados depois, mesmo que
    /// o cliente pague em um mês seguinte.
    mesReferencia: string;
    dataSnapshot:  Date;
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

/// Degradação recorrente do sinal (últimos 30 dias), resolvida e calculada
/// pelo próprio OTDR via /api/consulta_cliente (mesma correlação SN <-> cliente
/// que a tela de Consulta de Cliente do OTDR já usa) — não recalculado aqui.
export interface OscilacaoRede {
  sn:            string;
  rxHoje:        number | null;
  nivelHoje:     string;
  statusHoje:    string;
  recorrente: {
    diasDegradado: number;
    piorRx:        number | null;
    mediaRx:       number | null;
    primeiraData:  string | null;
    ultimaData:    string | null;
  } | null;
  piora: {
    dataQueda:    string;
    rxNaQueda:    number;
    dataAnterior: string;
    rxAnterior:   number;
  } | null;
  veredito:  string;
  gravidade: string;
}

export interface EquipamentoAtual {
  descricao:   string;
  numeroSerie: string;
}

/// Status granular da ONU vindo do SmartOLT (otdr.historico_smartolt) — cobre
/// só ~60% do fleet (o que já teve algum problema), por isso é sempre opcional.
/// Diferencia "Power fail" (queda de energia no local do cliente, não é
/// problema de fibra/rede) de "LOS" (perda de sinal óptico, rompimento de
/// fibra) — o nível_sinal do OTDR (historicoSinal) trata os dois como "Fora
/// de Operação" igual, sem essa distinção de causa.
export interface StatusSmartOlt {
  sn:                  string;
  statusOnu:           string;
  signalClass:         string | null;
  nivelSinal:          string | null;
  diasDegradado:       number | null;
  sinalRx:             number | null;
  ultimaMudancaStatus: Date | null;
  snapshotData:        Date | null;
}

// ============================================================
// PAINEL DE GESTÃO — agregados sem cliente específico
// ============================================================

export interface RankingVendedorEntry {
  nomeVendedor:   string;
  mesReferencia:  string;
  qtdContratos:   number;
  valorAtivos:    number;
  valorLiberado:  number;
}

export interface EvolucaoMensalEntry {
  mesReferencia:  string;
  segmento:       string;
  qtdContratos:   number;
  valorAtivos:    number;
  valorLiberado:  number;
}

/// Um POP agrupa várias OLTs (ex: "AGUAS CLARAS-1/2/3" -> POP AGUAS CLARAS) —
/// nome derivado removendo o sufixo numérico/N da OLT, não vem pronto da API.
export interface PopStatusEntry {
  pop:            string;
  totalOnus:      number;
  normal:         number;
  atencao:        number;
  critico:        number;
  foraDeOperacao: number;
  semLeitura:     number;
  piorSinalRx:    number | null;
}

/// O ONU com pior sinal AGORA em toda a rede (leitura ao vivo de /api/onus,
/// não confundir com "piora hoje" — que é evento de degradação dia-a-dia e
/// vem de uma fonte diferente, com possível defasagem de ingestão).
export interface PiorSinalAgora {
  clienteId: number;
  nome:      string;
  pop:       string;
  olt:       string;
  sinalRx:   number;
}

export interface StatusRedeAgora {
  pops:      PopStatusEntry[];
  piorGeral: PiorSinalAgora | null;
}

export interface ContextoClienteDiagnostico {
  idCliente:       number;
  equipamentoAtual: EquipamentoAtual[];
  historicoSinal:  HistoricoSinalEntry[];
  oscilacaoRede:   OscilacaoRede | null;
  statusSmartOlt:  StatusSmartOlt | null;
  ordensServico:   OsEntry[];
  osMensagens:     Record<number, OsMensagemEntry[]>; // por idOssChamado
  osArquivos:      Record<number, OsArquivoEntry[]>;  // por idOssChamado
  atendimentos:    AtendimentoEntry[];
  comercial:       ContextoComercial;
  regrasNegocio:   Record<string, string>;
}

export interface ImagemAnexo {
  buffer:      Buffer;
  mimeType:    string;
  /// Descrição/legenda original do anexo no IXC (ex: pergunta do checklist
  /// que a foto deveria responder) — ajuda a IA a saber o que cada foto
  /// deveria mostrar, para poder apontar quando o que está na foto não
  /// corresponde ao que era esperado (ou quando falta uma foto essencial).
  descricao:   string;
}

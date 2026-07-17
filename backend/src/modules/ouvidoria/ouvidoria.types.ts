/// Ouvidoria não é Backoffice (Backoffice aqui na empresa = conformidade). Esse
/// assunto cruza três áreas: a reclamação em si (IXC), a Monitoria de QA do
/// Atendimento (módulo `atendimento`, AtendimentoMonitoriaQa — pra saber se o
/// atendente que tratou o cliente antes/depois da reclamação foi bem avaliado) e
/// a Retenção (módulo `retencao` — pra saber se o cliente que reclamou também
/// entrou em fluxo de retenção). Por isso mora no próprio módulo, não dentro de
/// nenhum dos três.

/// Categorias reais de reclamação no IXC (su_oss_assunto.assunto, ligadas via
/// su_oss_chamado.id_assunto). Validado em produção IXC em 2026-07-16: "reclamacao"
/// soma dois ids com o mesmo nome "04 - Reclamação" (220 e 304) — tratar como uma
/// categoria só na agregação. PROCON e "Qualidade do Cliente"/"Processo de Qualidade
/// (chat)" existem como assunto mas têm 0 registros até hoje — não incluir como
/// categoria com dado real ainda.
///
/// "PREVENÇÃO DE INSATISFAÇÃO" (id 744, criada em 13/07/2026) fica de fora por
/// decisão explícita do usuário — não mexer nessa iniciativa.
export type CategoriaReclamacao =
  | 'reclamacao'          // ids 220+304 "04 - Reclamação" — maior volume
  | 'reclamacao_interna'  // id 197 "RECLAMACOES INTERNAS"
  | 'reclame_aqui'        // id 195 "RECLAME AQUI"
  | 'anatel'              // id 193 "ANATEL"
  | 'elogio';             // id 221 "1.1.2 ELOGIO" — contraponto positivo, baixo volume

export interface VolumePorCategoria {
  categoria: CategoriaReclamacao;
  qtd: number;
}

export interface ResumoVolumeReclamacoes {
  porCategoria: VolumePorCategoria[];
  totalReclamacoes: number; // soma só as categorias negativas (exclui elogio)
}

/// Desfecho do cliente após a reclamação: cruza su_oss_chamado.id_contrato_kit com
/// cliente_contrato.status. Mapeamento validado em 2026-07-16:
/// status='A' → cliente_ativo (1.226 casos na amostra)
/// status='I' → cliente_cancelado (1.057 casos)
/// status em ('N','P','D') → outro (326 casos) — semântica exata desses 3 códigos
/// ainda não confirmada, não assumir que são todos "ativo" nem todos "cancelado".
export interface ReclamacaoPorDesfecho {
  desfecho: 'cliente_ativo' | 'cliente_cancelado' | 'outro';
  qtd: number;
}

export interface ResumoDesfecho {
  porDesfecho: ReclamacaoPorDesfecho[];
  // O ponto central pedido pela gestão: reclamação não é só sobre quem cancelou.
  percentualReclamouEContinua: number; // cliente_ativo / total
}

/// Cruzamento reclamação x inadimplência (fn_areceber, status='A' = em aberto),
/// por id_cliente. Validado em 2026-07-16: de 1.356 clientes que reclamaram, 738
/// (54%) estavam inadimplentes no momento da consulta — hipótese de que grande
/// parte da insatisfação vem de atrito de cobrança, não de problema técnico.
export interface CruzamentoInadimplencia {
  totalClientesReclamaram: number;
  qtdTambemInadimplentes: number;
  percentualInadimplentes: number;
}

/// Cruzamento com Monitoria de QA (módulo `atendimento`, AtendimentoMonitoriaQa):
/// nota média do(s) atendente(s) que atenderam esse cliente na janela antes da
/// reclamação. Ajuda a responder "é erro interno?" sem precisar de um fluxo de
/// classificação novo — se a nota de QA já era baixa, é forte indício de falha de
/// atendimento; se era alta, aponta pra causa fora do atendimento (rede, cobrança,
/// produto). Ainda não implementado — depende de juntar `su_oss_chamado.id_cliente`
/// com os atendimentos do mesmo cliente na Monitoria de QA por data.
export interface CruzamentoMonitoriaQa {
  idChamado: string;
  notaMediaAtendimentoAnterior: number | null; // null = sem atendimento avaliado na janela
}

/// Cruzamento com Retenção (módulo `retencao`): se o cliente que reclamou também
/// passou por uma negociação/fluxo de retenção depois. Sinaliza os casos em que a
/// reclamação virou risco de cancelamento e o time de Retenção já está atuando (ou
/// deveria estar).
export interface CruzamentoRetencao {
  idChamado: string;
  entrouEmFluxoRetencao: boolean;
  negociacaoConfirmadaPelaAuditoria: boolean | null; // null = sem auditoria ainda
}

/// Validação humana da reclamação — ainda não existe no IXC (não há campo de
/// "procedente"/"causa interna" em su_oss_chamado para os assuntos de reclamação).
/// Isso precisaria de uma tela/fluxo novo, semelhante ao QA humano do Atendimento
/// ou à Auditoria de Retenção: alguém da gestão classifica cada reclamação depois
/// que ela é aberta. Enquanto não existir, `avaliada` fica sempre false.
export interface ReclamacaoClassificada {
  idChamado: string;
  categoria: CategoriaReclamacao;
  avaliada: boolean;
  procedente: boolean | null;      // null = ainda não avaliada
  causaInterna: boolean | null;    // null = ainda não avaliada
  observacao?: string;
}

export interface ResumoValidacao {
  totalReclamacoes: number;
  totalAvaliadas: number;
  totalProcedentes: number;
  totalCausaInterna: number;
}

/// Alerta de padrão — sugestão de abertura automática de O.S. de conformidade
/// (categoria de Backoffice, ex: id 571 "0.2.1 CONFORMIDADE DE INSTALACAO", id 647
/// "AUDITORIA DE CONFORMIDADE") quando um recorte de reclamações passa de um limiar.
/// Corte (ex: mesmo POP, mesmo técnico, mesma região) fica em aberto — decidir qual
/// dimensão faz sentido quando for desenhar a regra de verdade.
export interface AlertaPadraoReclamacao {
  recorte: string;      // ex: "POP Arniqueiras", "Técnico João", "Assunto ANATEL"
  qtdOcorrencias: number;
  janelaDias: number;
  sugestaoAcao: string; // ex: "Abrir O.S. de conformidade para investigar causa raiz"
}

export interface OuvidoriaFiltros {
  dateFrom?: string;
  dateTo?: string;
}

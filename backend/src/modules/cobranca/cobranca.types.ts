/// Faixa de atraso de um título em aberto (fn_areceber, status='A'), contado
/// a partir de data_vencimento até hoje. Sempre uma FOTO DE AGORA (não tem
/// filtro de período — atraso é sobre o que está em aberto neste momento,
/// não sobre quando o título foi criado).
export interface FaixaInadimplencia {
  faixa: 'em_dia' | '1-15' | '16-30' | '31-60' | '61-90' | '90+';
  qtd: number;
  valor: number;
}

export interface ResumoInadimplencia {
  faixas: FaixaInadimplencia[];
  totalTitulos: number;
  totalValor: number;
}

/// Acordo de renegociação (fn_renegociacao) por operador, num período (por
/// data_emissao). "Cumprido" = o(s) título(s) gerado(s) a partir do acordo
/// (fn_areceber.id_renegociacao) já foram recebidos (status='R'); "quebrado"
/// = voltaram a ficar em aberto/atraso ou foram cancelados. "Em andamento"
/// = ainda dentro do prazo, nem pago nem vencido de novo.
export interface AcordoPorOperador {
  nomeOperador: string;
  qtdGerados: number;
  qtdCumpridos: number;
  qtdQuebrados: number;
  qtdEmAndamento: number;
  valorTotalGerado: number;
}

export interface ResumoAcordos {
  porOperador: AcordoPorOperador[];
  totalGerados: number;
  totalCumpridos: number;
  totalQuebrados: number;
  totalEmAndamento: number;
}

/// Fila de acionamentos automáticos da régua de cobrança (regua_cobranca_*),
/// separando preventivo (antes do vencimento) de reativo (depois), com taxa
/// de sucesso de envio por canal.
export interface AcionamentoPorTipo {
  tipo: 'preventivo' | 'reativo';
  canal: string; // SMS, WhatsApp, E-mail, Carta — vem de regua_cobranca_envios.tipo_envio
  qtdEnviados: number;
  qtdFalhas: number;
}

export interface ResumoAcionamentos {
  porTipo: AcionamentoPorTipo[];
  totalEnviados: number;
  totalFalhas: number;
  totalNegativados: number;
}

export interface CobrancaFiltros {
  dateFrom?: string;
  dateTo?: string;
}

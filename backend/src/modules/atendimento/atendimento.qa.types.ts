/// Tipos e constantes da monitoria de qualidade por QA humano — portados
/// fielmente do sistema legado (Flask + SQLite, "Monitoria_Server.py",
/// linhas 17-73), incorporado ao Canaã Performance com os mesmos 22
/// critérios e o mesmo algoritmo de pontuação ponderada. Não inventar
/// critério nem peso novo aqui sem confirmar contra a fonte original.

export type RespostaCriterio = 'Conforme' | 'Não Conforme' | 'Não se aplica';

/// Os 22 critérios binários avaliados em cada monitoria — mesma ordem/nome
/// exato do YES_NO_FIELDS do sistema legado (os nomes viram chave de
/// `criterios` no banco, não mudar sem migrar dado existente).
export const CRITERIOS_QA = [
  'Script', 'Sondagem', 'Conhecimento técnico', 'Vícios de linguagem', 'Tom de voz',
  'Cordialidade', 'Controle de Objeção', 'Comunicação e Linguagem', 'Retorno ao cliente', 'Ação de retenção',
  'Confirmação de dados', 'Transferencia Indevida', 'Uso do Mute', 'Erro de procedimento',
  'Negociação e venda', 'Agilidade', 'Prontidão', 'Tabulação', 'Resolução do conflito',
  'Personalização', 'Omissão de atendimento', 'Inf. Protocolo?',
] as const;

export type CriterioQa = typeof CRITERIOS_QA[number];

/// Peso subtraído da pontuação (que começa em 10.0) quando o critério é
/// "Não Conforme" — cópia exata de PENALIZACOES no sistema legado.
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

/// Único critério que, se "Não Conforme", zera a pontuação inteira sozinho
/// (ignora todas as outras penalidades) — mesma regra de CRITICAL_ERRORS no
/// sistema legado.
export const CRITERIO_ERRO_CRITICO: CriterioQa = 'Omissão de atendimento';

/// Limiares de classificação da MÉDIA de pontuação de um agente — mesma
/// regra de CLASSIFICACAO_LIMIARES no legado.
export const CLASSIFICACAO_LIMIARES: [number, string][] = [
  [9.0, 'Ótimo'],
  [7.0, 'Bom'],
  [0.0, 'Não Conforme'],
];

export function classificarPontuacaoMedia(media: number): string {
  for (const [limiar, classificacao] of CLASSIFICACAO_LIMIARES) {
    if (media >= limiar) return classificacao;
  }
  return 'Não Conforme';
}

export interface ResultadoPontuacaoQa {
  pontuacao:        number;
  itensAplicaveis:  number;
  erroCritico:      boolean;
}

export interface MonitoriaQaInput {
  protocolo:          string;
  dataAtendimento:    Date;
  dataMonitoria:       Date;
  nomeAgente:          string;
  equipe:              string;
  motivoAtendimento?:  string;
  monitoriaZero?:      string;
  avaliacaoAtd?:       number;
  observacoes?:        string;
  criterios:           Partial<Record<CriterioQa, RespostaCriterio>>;
}

export interface MonitoriaQa extends MonitoriaQaInput, ResultadoPontuacaoQa {
  id:            string;
  origem:        'legado' | 'canaa_performance';
  avaliadoPor?:  string;
  criadoEm:      Date;
}

export interface FiltrosMonitoriaQa {
  agente?:    string;
  equipe?:    string;
  dateFrom?:  Date;
  dateTo?:    Date;
}

export interface CriterioNaoConformeResumo {
  criterio:      CriterioQa;
  naoConforme:   number;
  total:         number;
  pct:           number;
}

export interface MotivoQaResumo {
  motivo:  string;
  total:   number;
  media:   number | null;
}

export interface AgenteQaRanking {
  nomeAgente:    string;
  equipe:        string;
  qtd:           number;
  pontuacaoMedia: number;
  classificacao:  string;
}

/// Sugestão do C.A.I.O. pra um critério específico — o copiloto NUNCA grava
/// nada sozinho, só devolve isso pro QA humano revisar/confirmar/corrigir no
/// formulário antes de salvar.
export interface SugestaoCriterioQa {
  criterio:       CriterioQa;
  sugestao:       RespostaCriterio;
  justificativa:  string;
}

export interface SugestaoMonitoriaQa {
  criterios:      SugestaoCriterioQa[];
  observacoes:    string;
  aviso?:         string; // ex: ligação sem transcrição, conversa curta demais
}

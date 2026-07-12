/// Fonte única de verdade dos setores de atendimento — adicionar um setor
/// novo é adicionar 1 linha aqui, nada mais (o resto do módulo — KPIs,
/// ranking, monitoria, rollup, alertas, frontend — itera essa lista, não tem
/// mais setor hardcoded espalhado). `departamentoId` é o ObjectId do
/// departamento no OpaSuite (Mongo), confirmado empiricamente consultando a
/// coleção `departamentos`. `escalonaPara` só existe pra quem tem um
/// conceito real de escalonamento hierárquico (hoje só N1->N2 — os outros
/// setores não têm um "próximo nível" equivalente).
export const SETORES_ATENDIMENTO = [
  { codigo: 'SAC',        nome: 'SAC',         departamentoId: '613b6be1e07cf2665f7cd6d5', escalonaPara: undefined as string | undefined }, // 02 - 🎧 SAC
  { codigo: 'N1',         nome: 'Suporte N1',  departamentoId: '5bf73d1d186f7d2b0d647a61', escalonaPara: 'N2' as string | undefined }, // 03 - ⚙️ Suporte
  { codigo: 'N2',         nome: 'Suporte N2',  departamentoId: '68596bc21570ca514d4f9285', escalonaPara: undefined as string | undefined }, // Suporte N2
  { codigo: 'COBRANCA',   nome: 'Cobrança',    departamentoId: '614df1790c3ad8233abad7f6', escalonaPara: undefined as string | undefined }, // 07 - 💸 Cobrança
  { codigo: 'VENDAS',     nome: 'Vendas',      departamentoId: '5d1624085e74a002308aa25e', escalonaPara: undefined as string | undefined }, // 01 - 🛒 Vendas
  { codigo: 'RETENCAO',   nome: 'Retenção',    departamentoId: '614df007aeb48522ce5a8526', escalonaPara: undefined as string | undefined }, // 05 - 🤔 Retenção (departamento OpaSuite — NÃO é a auditoria de negociação de O.S. do módulo retencao/)
  { codigo: 'POS_VENDAS', nome: 'Pós-Vendas',  departamentoId: '614e2c4f754666225f58f5c0', escalonaPara: undefined as string | undefined }, // 09 - 💭 Pós-Vendas
  { codigo: 'BACKOFFICE', nome: 'Backoffice',  departamentoId: '5bf73d1d186f7d2b0d647a64', escalonaPara: undefined as string | undefined }, // 06 - 📊 Backoffice
] as const;

export type SetorAtendimento = typeof SETORES_ATENDIMENTO[number]['codigo'];

export const TODOS_SETORES: SetorAtendimento[] = SETORES_ATENDIMENTO.map((s) => s.codigo);

export function nomeSetorAtendimento(codigo: SetorAtendimento): string {
  return SETORES_ATENDIMENTO.find((s) => s.codigo === codigo)?.nome ?? codigo;
}

export function departamentoIdDoSetor(codigo: SetorAtendimento): string {
  const cfg = SETORES_ATENDIMENTO.find((s) => s.codigo === codigo);
  if (!cfg) throw new Error(`Setor de atendimento desconhecido: ${codigo}`);
  return cfg.departamentoId;
}

export function setorEscalonaPara(codigo: SetorAtendimento): SetorAtendimento | undefined {
  return SETORES_ATENDIMENTO.find((s) => s.codigo === codigo)?.escalonaPara as SetorAtendimento | undefined;
}

/// Rotas de transferência ESPERADAS entre setores, informadas pelo usuário
/// (2026-07-11) — usado pelo copiloto de QA (critério "Transferencia
/// Indevida") e pela análise de IA em massa (Adesão ao Script), pra não
/// confundir uma transferência normal do fluxo de atendimento com uma
/// transferência indevida de verdade. NÃO é uma lista exaustiva de toda
/// transferência possível — se a IA encontrar uma transferência fora dessa
/// lista, ela não deve presumir automaticamente que é indevida, só que essa
/// rota específica não está mapeada aqui (avaliar pelo contexto normal).
export interface RotaTransferenciaLegitima {
  motivoOrigem:  string;
  setorDestino:  string;
}

export const ROTAS_TRANSFERENCIA_LEGITIMAS: RotaTransferenciaLegitima[] = [
  { motivoOrigem: 'Cancelamento',                          setorDestino: 'Retenção (tentativa de reversão antes de efetivar o cancelamento)' },
  { motivoOrigem: 'Negociação de inadimplência',           setorDestino: 'Backoffice' },
  { motivoOrigem: 'Financeiro (2ª via, boleto, fatura)',    setorDestino: 'Backoffice' },
  { motivoOrigem: 'Venda de plano / upgrade',               setorDestino: 'Vendas' },
  { motivoOrigem: 'Auxílio no aplicativo (app)',            setorDestino: 'Suporte N1 ou N2' },
];

export function formatarRotasTransferenciaLegitimas(): string {
  return ROTAS_TRANSFERENCIA_LEGITIMAS.map((r) => `- ${r.motivoOrigem} → ${r.setorDestino}`).join('\n');
}

export interface KpisAtendimento {
  setor:               SetorAtendimento;
  volume:               number;
  /// TMA — Tempo Médio de Atendimento: tempo que um atendente HUMANO de
  /// verdade passou com o cliente (soma dos segmentos com atendimentoHumano
  /// = true; exclui triagem/encerramento por bot). Mediana, não média.
  tmaMs:                number | null;
  /// TME — Tempo Médio de Espera: do momento em que o atendimento é aberto
  /// até a operação 'primeiraInteracaoAtendente' (primeira vez que um
  /// humano de fato interage) — null quando o atendimento nunca chegou a
  /// ser atendido por um humano (resolvido só pelo bot, ou abandonado).
  tmeMs:                number | null;
  /// TMR — Tempo Médio de Resposta: quanto tempo um atendente HUMANO demora
  /// pra responder uma mensagem do cliente (nunca conta resposta da
  /// URA/IZA, nem mensagem que o atendente manda por conta própria).
  /// Calculado por par pergunta-resposta dentro da conversa, não por
  /// atendimento inteiro — ver calcularTemposRespostaHumana no repository.
  tmrMs:                number | null;
  /// Só tem sentido pra N1 (transferências pra N2) — nos outros setores vem 0.
  escalonamentos:       number;
  pctEscalonamento:     number | null;
  notaMediaSatisfacao:  number | null;
  /// Quantos dos atendimentos do período tiveram avaliação de satisfação
  /// preenchida — a nota é sempre amostra parcial, nunca 100% do volume.
  qtdAvaliados:         number;
}

export interface RankingAtendenteEntry {
  nome: string;
  qtd:  number;
}

export interface MotivoAtendimentoEntry {
  motivo: string;
  qtd:    number;
}

export interface AtendimentoParaMonitoria {
  protocolo:            string;
  setor:                SetorAtendimento;
  canal:                string;
  dataAtendimento:      Date;
  mensagens:            { data: Date | null; texto: string }[];
  /// _id do Mongo do OpaSuite — só preenchido quando o chamador precisa dele
  /// como chave de idempotência (ex: análise em massa por IA). protocolo
  /// não é confiável como chave única (ver AtendimentoMonitoriaQa.id_legado).
  opasuiteAtendimentoId?: string;
}

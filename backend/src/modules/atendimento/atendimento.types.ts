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
  { codigo: 'OUVIDORIA',    nome: 'Ouvidoria',     departamentoId: '67eadc472d93ff929c6010c0', escalonaPara: undefined as string | undefined }, // Ouvidoria (Centro de Solução, achado 2026-07-21 investigando pedido real de fila ao vivo)
] as const;
// Nota: "10 - 🚨 Falha Massiva" (id 614344a46996d363bcc5f562) foi cogitado e
// descartado, é do setor Campo, não Centro de Solução, e muito esporádico
// (2 atendimentos em 30 dias). Confirmado pelo usuário 2026-07-21.

export type SetorAtendimento = typeof SETORES_ATENDIMENTO[number]['codigo'];

export const TODOS_SETORES: SetorAtendimento[] = SETORES_ATENDIMENTO.map((s) => s.codigo);

/// Espelha SETORES_CENTRO_SOLUCAO do frontend (atendimentoApi.ts). Vendas e
/// Pós-Vendas são do Comercial, não entram aqui. Usado pelo alerta de fila
/// crítica por WhatsApp (atendimento.alerta-fila-whatsapp.ts), que soma a
/// fila do grupo inteiro, igual ao card "Na fila de espera" do dashboard.
export const SETORES_CENTRO_SOLUCAO: SetorAtendimento[] = ['SAC', 'N1', 'N2', 'COBRANCA', 'RETENCAO', 'BACKOFFICE', 'OUVIDORIA'];

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
  /// Agregado (chat + ligação), mantido por compatibilidade com o
  /// histórico mensal já salvo; pra comparar canais, ver tmaMsChat/tmaMsLigacao.
  tmaMs:                number | null;
  /// TME — Tempo Médio de Espera: do momento em que o atendimento é aberto
  /// até a operação 'primeiraInteracaoAtendente' (primeira vez que um
  /// humano de fato interage). Null quando o atendimento nunca chegou a
  /// ser atendido por um humano (resolvido só pelo bot, ou abandonado).
  /// Agregado (chat + ligação), ver tmeMsChat/tmeMsLigacao pro detalhe.
  tmeMs:                number | null;
  /// TMR — Tempo Médio de Resposta: quanto tempo um atendente HUMANO demora
  /// pra responder uma mensagem do cliente (nunca conta resposta da
  /// URA/IZA, nem mensagem que o atendente manda por conta própria).
  /// Calculado por par pergunta-resposta dentro da conversa, não por
  /// atendimento inteiro, ver calcularTemposRespostaHumana no repository.
  /// SÓ existe pra canal=chat: uma ligação não tem "tempo de resposta" (é
  /// atendida ou não) e as "mensagens" de uma ligação no Mongo são só log
  /// automático do sistema, não conversa real. Confirmado 2026-07-20.
  tmrMs:                number | null;
  /// Volume e TMA/TME quebrados por canal (canal='pabx' vira ligação, resto
  /// vira chat). Confirmado 2026-07-20 que misturar os dois distorce os
  /// números agregados: ligação é aberta manualmente pelo atendente, então
  /// tem espera ~0 por definição, puxando o TME misturado pra baixo (ex: N1
  /// com 21% de ligação mostrava TME de 13min quando o TME real de chat era
  /// 25min).
  volumeChat:           number;
  volumeLigacao:        number;
  tmaMsChat:            number | null;
  tmeMsChat:            number | null;
  tmaMsLigacao:         number | null;
  tmeMsLigacao:         number | null;
  /// Duração real da ligação telefônica, do PABX (call_records.duration),
  /// diferente de tmaMsLigacao (que só conta o trecho com atendente HUMANO
  /// na linha). Validado 2026-07-20: em várias ligações a IZA/bot segura a
  /// maior parte da chamada antes de passar pro humano, então tmaMsLigacao
  /// sozinho subestima bastante quanto tempo o cliente ficou na linha de
  /// verdade. Null quando não há ligação COMPLETED no período.
  duracaoRealLigacaoMs: number | null;
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

export interface RankingAvaliacaoEntry {
  nome: string;
  notaMedia: number;
  qtdAvaliacoes: number;
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
  /// _id (string) de cada atendente HUMANO distinto (atendimentoHumano===true)
  /// que tocou o atendimento — só populado por buscarAtendimentosParaAnaliseIa,
  /// usado pelo resolver de identidade (resolverIdentidadesAgentes). Mais de 1
  /// id distinto = transferência entre atendentes, tratado como identidade não
  /// resolvida (não dá pra saber quem "conta mais" pra fins de nota de QA).
  atendentesHumanoIds?: string[];
}

export interface OperadorAoVivo {
  nome: string;
  setor: string;
  /// 'call' é status próprio (agente literalmente em ligação agora),
  /// separado de 'on' desde 2026-07-20, pedido real da gestora do Centro
  /// de Solução, que precisava saber quantos estão em ligação neste instante.
  status: 'on' | 'call' | 'au' | 'pause';
  tempoStatusMs: number;
  volumeHoje: number;
  /// Agregado (chat + ligação), ver tmaMsChat/tmaMsLigacao pro detalhe.
  tmaMs: number | null;
  tmeMs: number | null;
  /// Só canal=chat, ligação não tem "tempo de resposta" (ver KpisAtendimento.tmrMs).
  tmrMs: number | null;
  volumeChat: number;
  volumeLigacao: number;
  tmaMsChat: number | null;
  tmeMsChat: number | null;
  tmaMsLigacao: number | null;
  tmeMsLigacao: number | null;
}

/// Indicador de jornada por operador num período configurável (RH/gestão do
/// Centro de Solução) — diferente de OperadorAoVivo (que é só o status ATUAL
/// em tempo real): aqui é histórico, somando o tempo real logado em cada
/// status ao longo do período inteiro. "Logado" = produtivo + pausa + ausente
/// (exclui "off", que é o operador fora do sistema — sem escala cadastrada
/// no sistema hoje, não dá pra saber se isso é fora do horário de trabalho
/// ou ausência durante o expediente).
export interface IndicadorJornadaOperador {
  nome: string;
  setor: SetorAtendimento;
  volumeAtendimentos: number;
  tempoLogadoMs: number;
  tempoProdutivoMs: number;
  tempoPausaMs: number;
  tempoAusenteMs: number;
  /// null quando tempoLogadoMs é 0 (sem nenhum registro de status no período)
  pctProdutivo: number | null;
  pctPausa: number | null;
  pctAusente: number | null;
}

/// Limites de jornada configuráveis pela gestão via Regras de Negócio
/// (categoria ATENDIMENTO, mesma tela/CRUD do resto do C.A.I.O., hoje restrita
/// a hub-admin), usados só pra destacar visualmente a tabela de jornada, não
/// alteram nenhum cálculo. limiteIndisponibilidadePct é único pra todos os
/// setores (ausente é comportamento, comparável entre áreas); metaEficiencia
/// é por setor porque TMA varia muito de área pra área (ex: Retenção demora
/// bem mais por atendimento que SAC): só entra no mapa quem tiver meta
/// configurada, os demais setores ficam sem comparação (não tem "bom" padrão
/// universal de atendimentos/hora).
export interface ConfigJornada {
  limiteIndisponibilidadePct: number;
  metasEficienciaPorSetor: Partial<Record<SetorAtendimento, number>>;
}

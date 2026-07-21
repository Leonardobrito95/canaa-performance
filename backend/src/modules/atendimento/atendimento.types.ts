import fs from 'fs';
import path from 'path';

/// O código de cada setor é fixo (union abaixo, "menu" que o produto
/// suporta), mas o ID do departamento no OpaSuite, o nome de exibição e o
/// escalonamento vêm de config/setores-atendimento.json, um arquivo por
/// instalação (2026-07-21: cada cliente tem seu próprio OpaSuite, com IDs
/// diferentes, essa era a última coisa hardcoded pra uma instalação
/// específica). Ver config/setores-atendimento.example.json pro formato.
/// Só setor presente nesse arquivo participa de KPIs/alertas/relatórios,
/// uma instalação sem "Ouvidoria", por exemplo, só deixa essa entrada de
/// fora, sem precisar mexer em código.
export type SetorAtendimento =
  'SAC' | 'N1' | 'N2' | 'COBRANCA' | 'VENDAS' | 'RETENCAO' | 'POS_VENDAS' | 'BACKOFFICE' | 'OUVIDORIA';

const CODIGOS_SUPORTADOS: SetorAtendimento[] =
  ['SAC', 'N1', 'N2', 'COBRANCA', 'VENDAS', 'RETENCAO', 'POS_VENDAS', 'BACKOFFICE', 'OUVIDORIA'];

interface SetorConfigArquivo {
  nome:          string;
  departamentoId: string;
  escalonaPara?: SetorAtendimento;
}

const CAMINHO_CONFIG = path.join(__dirname, '../../../config/setores-atendimento.json');

function carregarConfigSetores(): Record<string, SetorConfigArquivo> {
  if (!fs.existsSync(CAMINHO_CONFIG)) {
    throw new Error(
      `Arquivo de configuração não encontrado: ${CAMINHO_CONFIG}. Copie ` +
      `backend/config/setores-atendimento.example.json para ` +
      `backend/config/setores-atendimento.json e preencha com os IDs reais ` +
      `de departamento do OpaSuite desta instalação.`
    );
  }
  return JSON.parse(fs.readFileSync(CAMINHO_CONFIG, 'utf8'));
}

const configBruta = carregarConfigSetores();

export const SETORES_ATENDIMENTO: { codigo: SetorAtendimento; nome: string; departamentoId: string; escalonaPara?: SetorAtendimento }[] =
  CODIGOS_SUPORTADOS
    .filter((codigo) => configBruta[codigo])
    .map((codigo) => ({ codigo, ...configBruta[codigo] }));

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

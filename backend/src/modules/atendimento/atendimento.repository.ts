import { ObjectId } from 'mongodb';
import { getOpaSuiteDb } from '../../config/opasuiteMongo';
import { buscarMensagensAtendimento } from '../opasuite/opasuite.service';
import prisma from '../../config/prisma';
import {
  SetorAtendimento, KpisAtendimento, AtendimentoParaMonitoria, RankingAtendenteEntry, MotivoAtendimentoEntry, RankingAvaliacaoEntry,
  SETORES_ATENDIMENTO, TODOS_SETORES, setorEscalonaPara, OperadorAoVivo, IndicadorJornadaOperador, ConfigJornada,
} from './atendimento.types';

/// ObjectId do departamento no OpaSuite pra cada setor — derivado da config
/// central (SETORES_ATENDIMENTO em atendimento.types.ts), não hardcoded
/// aqui. Setor novo = 1 linha lá, nada muda neste arquivo.
export const DEPARTAMENTO_IDS: Record<SetorAtendimento, string> = Object.fromEntries(
  SETORES_ATENDIMENTO.map((s) => [s.codigo, s.departamentoId]),
) as Record<SetorAtendimento, string>;

export function resolverSetorPorObjectId(id: unknown): SetorAtendimento | null {
  if (!id) return null;
  const str = String(id);
  for (const [setor, deptId] of Object.entries(DEPARTAMENTO_IDS)) {
    if (deptId === str) return setor as SetorAtendimento;
  }
  return null;
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  return ordenado[Math.floor(ordenado.length / 2)];
}

/// Conta, dentre os atendimentos cujo departamento ATUAL é o destino
/// (abertos no período), quantos passaram pela origem em algum momento do
/// histórico de operações. Não dá pra contar isso filtrando por "setor =
/// origem": o campo `setor` do atendimento reflete o departamento ATUAL, não
/// a origem — um atendimento que escalou já aparece com setor=destino, então
/// filtrar por setor=origem nunca encontraria esses casos (confirmado
/// empiricamente com N1->N2: retornava sempre 0). Também não dá pra confiar
/// só no tipo de operação 'transferirDepartamento' com
/// departamento/departamentoDestino no mesmo elemento — o OpaSuite registra
/// a mesma jornada por vários tipos de operação (transferirAssistenteIA,
/// transferirUsuario, transferirAgenteVirtual...), nem sempre com os dois
/// lados preenchidos no mesmo evento. Por isso o critério é "setor atual =
/// destino E tocou na origem em qualquer operação" — mais robusto a essa
/// variação real dos dados. Parametrizado por origem/destino porque hoje só
/// N1->N2 tem esse conceito de escalonamento (ver setorEscalonaPara), mas a
/// query em si não é específica de N1/N2.
async function contarEscalonamentos(idOrigem: string, idDestino: string, dateFrom: Date, dateTo: Date): Promise<number> {
  const db = await getOpaSuiteDb();
  const origem = new ObjectId(idOrigem);
  const destino = new ObjectId(idDestino);
  return db.collection('atendimentos').countDocuments({
    setor: destino,
    date: { $gte: dateFrom, $lte: dateTo },
    $or: [
      { 'operacoes.departamento': origem },
      { 'operacoes.departamentoDestino': origem },
    ],
  });
}

/// Deriva TME/TMA de um atendimento a partir do histórico de operações e dos
/// segmentos de atendente. Confirmado empiricamente contra dado real (vários
/// atendimentos de N1 inspecionados um a um):
/// - TME (Tempo Médio de ESPERA): 'abertura' (doc.date) até a operação
///   'primeiraInteracaoAtendente' — cobre TUDO antes de um humano de
///   verdade assumir: a URA/IZA (a IA de atendimento que faz a triagem) E
///   a fila depois dela. É de propósito que TME inclua esse tempo — o
///   único conteúdo real de "espera" AQUI é justamente a URA/IZA + fila,
///   não tem uma parte "pura" de espera sem isso. Ausente (null) quando o
///   atendimento nunca chegou a ser pego por um humano.
/// - TMA (Tempo Médio de ATENDIMENTO): soma dos segmentos de `atendentes[]`
///   com atendimentoHumano=true — só o tempo de handling humano de
///   verdade, sem a URA/IZA (que aparece como segmentos com
///   atendimentoHumano=false).
/// TMR (Tempo Médio de RESPOSTA) NÃO é derivado daqui — é calculado à parte,
/// no nível de mensagem (ver calcularTemposRespostaHumana), porque é sobre
/// quanto tempo o COLABORADOR humano demora pra responder uma mensagem do
/// CLIENTE, não sobre o atendimento como um todo.
function calcularTme(doc: any): number | null {
  const operacoes = doc.operacoes ?? [];
  const t0 = doc.date ? new Date(doc.date).getTime() : null;
  const primeiraInteracao = operacoes.find((o: any) => o.tipo === 'primeiraInteracaoAtendente');
  return t0 && primeiraInteracao?.date
    ? new Date(primeiraInteracao.date).getTime() - t0
    : null;
}

function calcularTma(doc: any): number | null {
  return (doc.atendentes ?? [])
    .filter((a: any) => a.atendimentoHumano === true && typeof a.tempoDeAtendimento === 'number')
    .reduce((s: number, a: any) => s + a.tempoDeAtendimento, 0) || null;
}

/// Lista dos intervalos [inicio, fim] em que um atendente HUMANO de verdade
/// estava com o cliente, extraída de `atendentes[]` — usada pra classificar
/// se uma mensagem de saída (com id_atend) foi enviada por um humano ou
/// pela URA/IZA (bot), sem precisar resolver a identidade de cada id_atend.
function segmentosHumanos(doc: any): { inicio: number; fim: number }[] {
  return (doc.atendentes ?? [])
    .filter((a: any) => a.atendimentoHumano === true && a.inicio && a.fim)
    .map((a: any) => ({ inicio: new Date(a.inicio).getTime(), fim: new Date(a.fim).getTime() }));
}

/// TMR (Tempo Médio de RESPOSTA): quanto tempo o COLABORADOR humano demora
/// pra responder depois que o CLIENTE manda uma mensagem — NUNCA conta
/// resposta da URA/IZA, e NUNCA conta mensagem que o colaborador manda por
/// conta própria (sem o cliente ter mandado nada antes). Calculado por
/// mensagem, não por atendimento: cada troca cliente->humano dentro da
/// conversa vira uma amostra própria.
///
/// Como classificar quem mandou cada mensagem sem resolver identidade de
/// atendente: mensagem do cliente = tem `id_user` e não tem `id_atend`.
/// Mensagem de saída (atendente) = tem `id_atend` e `mensagem` é string
/// (exclui os passos internos de raciocínio da IZA, que usam `id_assistant`
/// e guardam um objeto, não texto). Pra saber se essa saída foi humana ou
/// da URA/IZA, comparamos o horário dela contra os intervalos em que um
/// atendente HUMANO estava ativo (`segmentosHumanos`) — evita ter que
/// resolver a identidade de cada `id_atend` um por um.
export function calcularTemposRespostaHumana(
  mensagens: { data: Date; ehCliente: boolean; ehSaida: boolean }[],
  segmentos: { inicio: number; fim: number }[],
): number[] {
  const amostras: number[] = [];
  let ultimaMensagemCliente: number | null = null;

  for (const m of mensagens) {
    const t = m.data.getTime();
    if (m.ehCliente) {
      ultimaMensagemCliente = t;
      continue;
    }
    if (!m.ehSaida || ultimaMensagemCliente === null) continue;

    const ehHumano = segmentos.some((s) => t >= s.inicio && t <= s.fim);
    if (ehHumano) {
      amostras.push(t - ultimaMensagemCliente);
      ultimaMensagemCliente = null;
    }
    // Resposta da URA/IZA: não conta, e não consome a mensagem pendente do
    // cliente — o "relógio" continua rodando até um humano responder de fato.
  }

  return amostras;
}

/// KPIs brutos (sem IA) de um setor num período — volume, TME/TMA (medianas,
/// não médias: a cauda longa de sessões esquecidas abertas por dias
/// distorce a média em ordens de grandeza — confirmado empiricamente),
/// TMR (mediana dos tempos de resposta humana por mensagem, ver
/// calcularTemposRespostaHumana), taxa de escalonamento (só computada pra
/// setores com setorEscalonaPara configurado — hoje só N1->N2) e nota média
/// de satisfação (Likert 1-5, sempre amostra parcial).
export async function buscarKpisAtendimento(
  setor: SetorAtendimento,
  dateFrom: Date,
  dateTo: Date,
): Promise<KpisAtendimento> {
  const db = await getOpaSuiteDb();
  const docs = await db.collection('atendimentos').find(
    { setor: new ObjectId(DEPARTAMENTO_IDS[setor]), date: { $gte: dateFrom, $lte: dateTo } },
    { projection: { date: 1, atendentes: 1, operacoes: 1, evaluations: 1 } },
  ).toArray();

  const tmas: number[] = [];
  const tmes: number[] = [];
  let somaNotas = 0;
  let qtdAvaliados = 0;

  // Mapa id_rota (string) -> segmentos humanos, pra cruzar com as mensagens
  // buscadas em lote logo abaixo (uma query só pro período inteiro, em vez
  // de 1 por atendimento — N1 sozinho tem milhares/mês).
  const segmentosPorAtendimento = new Map<string, { inicio: number; fim: number }[]>();

  for (const doc of docs) {
    const tmaMs = calcularTma(doc);
    const tmeMs = calcularTme(doc);
    if (tmaMs !== null) tmas.push(tmaMs);
    if (tmeMs !== null) tmes.push(tmeMs);
    segmentosPorAtendimento.set(doc._id.toString(), segmentosHumanos(doc));

    const likerts = (doc.evaluations ?? []).filter(
      (e: any) => e.metric === 'likert' && typeof e.likert?.rating === 'number',
    );
    if (likerts.length) {
      const mediaAtendimento = likerts.reduce((s: number, e: any) => s + e.likert.rating, 0) / likerts.length;
      somaNotas += mediaAtendimento;
      qtdAvaliados++;
    }
  }

  const tmrs = docs.length ? await buscarTemposRespostaEmLote(docs.map((d) => d._id), segmentosPorAtendimento) : [];
  const setorDestino = setorEscalonaPara(setor);
  const escalonamentos = setorDestino
    ? await contarEscalonamentos(DEPARTAMENTO_IDS[setor], DEPARTAMENTO_IDS[setorDestino], dateFrom, dateTo)
    : 0;

  return {
    setor,
    volume: docs.length,
    tmaMs: mediana(tmas),
    tmeMs: mediana(tmes),
    tmrMs: mediana(tmrs),
    escalonamentos,
    pctEscalonamento: setorDestino && docs.length ? Math.round((escalonamentos / docs.length) * 1000) / 10 : null,
    notaMediaSatisfacao: qtdAvaliados ? Math.round((somaNotas / qtdAvaliados) * 100) / 100 : null,
    qtdAvaliados,
  };
}

/// Busca as mensagens de texto (exclui os passos internos de raciocínio da
/// IZA, que não são texto) de vários atendimentos numa query só, e calcula
/// TMR (tempos de resposta humana) pra cada um usando os segmentos humanos
/// já calculados. Uma query em lote em vez de 1 por atendimento — essencial
/// pra N1, que tem milhares de atendimentos por mês.
async function buscarTemposRespostaEmLote(
  idsRota: ObjectId[],
  segmentosPorAtendimento: Map<string, { inicio: number; fim: number }[]>,
): Promise<number[]> {
  const db = await getOpaSuiteDb();
  const msgs = await db.collection('atendimentos_mensagens').find(
    { id_rota: { $in: idsRota }, tipo: 'texto' },
    { projection: { id_rota: 1, data: 1, id_user: 1, id_atend: 1, mensagem: 1 } },
  ).sort({ data: 1 }).toArray();

  const porAtendimento = new Map<string, { data: Date; ehCliente: boolean; ehSaida: boolean }[]>();
  for (const m of msgs) {
    if (!m.data) continue;
    const ehCliente = Boolean(m.id_user) && !m.id_atend;
    const ehSaida = Boolean(m.id_atend) && typeof m.mensagem === 'string';
    if (!ehCliente && !ehSaida) continue; // nem cliente nem saída de texto reconhecível — ignora

    const chave = m.id_rota.toString();
    if (!porAtendimento.has(chave)) porAtendimento.set(chave, []);
    porAtendimento.get(chave)!.push({ data: new Date(m.data), ehCliente, ehSaida });
  }

  const amostras: number[] = [];
  for (const [chave, mensagens] of porAtendimento) {
    const segmentos = segmentosPorAtendimento.get(chave) ?? [];
    if (!segmentos.length) continue; // nunca teve humano — não há resposta humana a medir
    amostras.push(...calcularTemposRespostaHumana(mensagens, segmentos));
  }
  return amostras;
}

/// Ranking de atendentes humanos por volume (quantos atendimentos cada um
/// cuidou) num período, somando os setores informados (todos os 8, se
/// `setores` não for passado). Conta segmentos com atendimentoHumano=true em
/// `atendentes[]` — se o mesmo atendente aparece mais de uma vez no mesmo
/// atendimento (raro, ex: reassumiu depois de uma escalada), cada segmento
/// conta como 1, então o número é uma aproximação de carga de trabalho, não
/// uma contagem exata de atendimentos únicos.
export async function buscarRankingAtendentes(dateFrom: Date, dateTo: Date, setores?: SetorAtendimento[], limite = 10): Promise<RankingAtendenteEntry[]> {
  const db = await getOpaSuiteDb();
  const deptIds = (setores ?? TODOS_SETORES).map((s) => new ObjectId(DEPARTAMENTO_IDS[s]));

  const rows = await db.collection('atendimentos').aggregate([
    { $match: { setor: { $in: deptIds }, date: { $gte: dateFrom, $lte: dateTo } } },
    { $unwind: '$atendentes' },
    { $match: { 'atendentes.atendimentoHumano': true } },
    { $group: { _id: '$atendentes.atendente', qtd: { $sum: 1 } } },
    { $sort: { qtd: -1 } },
    { $limit: limite },
  ]).toArray();

  if (!rows.length) return [];
  const ids = rows.map((r) => r._id).filter(Boolean);
  const usuarios = await db.collection('usuarios').find(
    { _id: { $in: ids } },
    { projection: { nome: 1 } },
  ).toArray();
  const nomesPorId = new Map(usuarios.map((u) => [u._id.toString(), u.nome as string]));

  return rows
    .map((r) => ({
      nome: nomesPorId.get(r._id.toString()) ?? 'Desconhecido',
      qtd:  r.qtd,
    }));
}

/// Ranking de atendentes por nota média de satisfação (CSAT).
/// Apenas atendentes que tiveram pelo menos 1 avaliação.
export async function buscarRankingAvaliacaoAtendentes(dateFrom: Date, dateTo: Date, setores?: SetorAtendimento[], limite = 10): Promise<RankingAvaliacaoEntry[]> {
  const db = await getOpaSuiteDb();
  const deptIds = (setores ?? TODOS_SETORES).map((s) => new ObjectId(DEPARTAMENTO_IDS[s]));

  const rows = await db.collection('atendimentos').aggregate([
    { $match: {
        setor: { $in: deptIds },
        date: { $gte: dateFrom, $lte: dateTo },
        'evaluations.metric': 'likert'
      }
    },
    { $unwind: '$atendentes' },
    { $match: { 'atendentes.atendimentoHumano': true } },
    { $unwind: '$evaluations' },
    { $match: { 'evaluations.metric': 'likert', 'evaluations.likert.rating': { $type: 'number' } } },
    { $group: { 
        _id: '$atendentes.atendente', 
        notaMedia: { $avg: '$evaluations.likert.rating' },
        qtdAvaliacoes: { $sum: 1 }
      } 
    },
    // Desempate: quem tem mais avaliações fica na frente se a nota for igual
    { $sort: { notaMedia: -1, qtdAvaliacoes: -1 } },
    { $limit: limite },
  ]).toArray();

  if (!rows.length) return [];
  const ids = rows.map((r) => r._id).filter(Boolean);
  const usuarios = await db.collection('usuarios').find(
    { _id: { $in: ids } },
    { projection: { nome: 1 } },
  ).toArray();
  const nomesPorId = new Map(usuarios.map((u) => [u._id.toString(), u.nome as string]));

  return rows
    .filter((r) => r._id)
    .map((r) => ({
      nome: nomesPorId.get(r._id.toString()) ?? 'Desconhecido',
      notaMedia: Math.round(r.notaMedia * 100) / 100,
      qtdAvaliacoes: r.qtdAvaliacoes,
    }));
}

/// Top motivos de atendimento (assunto/tipificação) num período, somando os
/// setores informados (todos os 8, se `setores` não for passado). `motivos[]`
/// no atendimento guarda só o id — o texto vem da coleção `motivo_atendimentos`.
export async function buscarMotivosAtendimento(dateFrom: Date, dateTo: Date, setores?: SetorAtendimento[], limite = 10): Promise<MotivoAtendimentoEntry[]> {
  const db = await getOpaSuiteDb();
  const deptIds = (setores ?? TODOS_SETORES).map((s) => new ObjectId(DEPARTAMENTO_IDS[s]));

  const rows = await db.collection('atendimentos').aggregate([
    { $match: { setor: { $in: deptIds }, date: { $gte: dateFrom, $lte: dateTo }, motivos: { $exists: true, $ne: [] } } },
    { $unwind: '$motivos' },
    { $group: { _id: '$motivos.idMotivo', qtd: { $sum: 1 } } },
    { $sort: { qtd: -1 } },
    { $limit: limite },
  ]).toArray();

  if (!rows.length) return [];
  const ids = rows.map((r) => r._id).filter(Boolean);
  const motivosDb = await db.collection('motivo_atendimentos').find(
    { _id: { $in: ids } },
    { projection: { motivo: 1 } },
  ).toArray();
  const nomesPorId = new Map(motivosDb.map((m) => [m._id.toString(), m.motivo as string]));

  return rows
    .filter((r) => r._id)
    .map((r) => ({
      motivo: nomesPorId.get(r._id.toString()) ?? 'Não classificado',
      qtd:    r.qtd,
    }));
}

/// Volume por dia de um setor num período — base pro alerta de "volume hoje
/// muito acima do normal" (compara o dia atual contra a média móvel dos
/// dias anteriores).
export async function buscarVolumeDiario(
  setor: SetorAtendimento,
  dateFrom: Date,
  dateTo: Date,
): Promise<{ dia: string; volume: number }[]> {
  const db = await getOpaSuiteDb();
  const rows = await db.collection('atendimentos').aggregate([
    { $match: { setor: new ObjectId(DEPARTAMENTO_IDS[setor]), date: { $gte: dateFrom, $lte: dateTo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'America/Sao_Paulo' } }, volume: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  return rows.map((r) => ({ dia: r._id, volume: r.volume }));
}

/// Pro modo de auditoria pontual: 1 atendimento completo por protocolo.
export async function buscarAtendimentoPorProtocolo(protocolo: string): Promise<AtendimentoParaMonitoria | null> {
  const db = await getOpaSuiteDb();
  const doc = await db.collection('atendimentos').findOne({ protocolo });
  if (!doc) return null;

  const setor = resolverSetorPorObjectId(doc.setor);
  if (!setor) return null; // não é um atendimento de nenhum setor coberto (SETORES_ATENDIMENTO)

  const mensagens = await buscarMensagensAtendimento(doc._id);
  return {
    protocolo,
    setor,
    canal:                 typeof doc.canal === 'string' ? doc.canal : 'desconhecido',
    dataAtendimento:       doc.date ? new Date(doc.date) : new Date(),
    mensagens,
    opasuiteAtendimentoId: doc._id.toString(),
  };
}

/// Candidatos pro job noturno de análise em massa por IA: atendimentos
/// FECHADOS (status 'F') de canal de TEXTO (exclui pabx — ligação não tem
/// conversa transcrita, mesmo motivo do copiloto de QA recusar avaliar
/// ligação) num período. Não busca mensagens aqui (barato, só metadados) —
/// quem chama resolve mensagem por item, no ritmo sequencial do próprio job.
export async function buscarAtendimentosParaAnaliseIa(dateFrom: Date, dateTo: Date): Promise<Omit<AtendimentoParaMonitoria, 'mensagens'>[]> {
  const db = await getOpaSuiteDb();
  const deptIds = Object.values(DEPARTAMENTO_IDS).map((id) => new ObjectId(id));

  const docs = await db.collection('atendimentos').find({
    setor: { $in: deptIds },
    date: { $gte: dateFrom, $lte: dateTo },
    status: 'F',
    canal: { $ne: 'pabx' },
  }).toArray();

  const candidatos: (Omit<AtendimentoParaMonitoria, 'mensagens'> | null)[] = docs.map((doc) => {
    const setor = resolverSetorPorObjectId(doc.setor);
    if (!setor) return null;
    return {
      protocolo:             doc.protocolo,
      setor,
      canal:                 typeof doc.canal === 'string' ? doc.canal : 'desconhecido',
      dataAtendimento:       doc.date ? new Date(doc.date) : new Date(),
      opasuiteAtendimentoId: doc._id.toString(),
    };
  });
  return candidatos.filter((a): a is Omit<AtendimentoParaMonitoria, 'mensagens'> => a !== null);
}

// AtendimentoAgenteQa.equipe guarda o nome do time em português, digitado
// por quem cadastrou o roster (ex: "Retenção"), não o código interno de
// SetorAtendimento (ex: "RETENCAO") — os dois só coincidem por acaso pra
// SAC/N1/N2. Sem essa tradução, o filtro por setor nunca casa pra Retenção/
// Cobrança/Backoffice mesmo com agente ativo no roster.
const EQUIPE_ROSTER_PARA_CODIGO: Record<string, SetorAtendimento> = {
  'SAC': 'SAC',
  'N1': 'N1',
  'Suporte N1': 'N1',
  'N2': 'N2',
  'Suporte N2': 'N2',
  'Cobrança': 'COBRANCA',
  'Vendas': 'VENDAS',
  'Retenção': 'RETENCAO',
  'Pós-Vendas': 'POS_VENDAS',
  'Backoffice': 'BACKOFFICE',
};

// Status reais observados em user_status (OpaSuite): on/off/call/oc/pause/au.
// 'call' (em ligação) e 'oc' (ocupado) contam como presente/online — só
// 'off' é de fato ausente do sistema.
const STATUS_PARA_UI: Record<string, 'on' | 'au' | 'pause'> = {
  on: 'on', call: 'on', oc: 'on', pause: 'pause', au: 'au',
};

export async function buscarKpisOperadoresAoVivo(setores?: SetorAtendimento[]): Promise<OperadorAoVivo[]> {
  const db = await getOpaSuiteDb();

  const hojeInicio = new Date();
  hojeInicio.setHours(0, 0, 0, 0);
  const hojeFim = new Date();
  hojeFim.setHours(23, 59, 59, 999);

  // 1. Achar agentes do roster (QA) para os setores solicitados
  const agentes = await prisma.atendimentoAgenteQa.findMany({
    where: { status: 'Ativo', nome: { notIn: ['APRIMORAR', 'TESTE'] } },
    select: { nome: true, equipe: true },
  });

  const agentesRoster = setores
    ? agentes.filter((a) => {
        const codigo = EQUIPE_ROSTER_PARA_CODIGO[a.equipe];
        return codigo && setores.includes(codigo);
      })
    : agentes;
  
  // 2. Achar operadores que tocaram em atendimentos dos setores hoje (cobre Vendas/Pós-Vendas que não estão no QA)
  const deptIds = (setores ?? TODOS_SETORES).map((s) => new ObjectId(DEPARTAMENTO_IDS[s]));
  
  const atendimentosHoje = await db.collection('atendimentos').find(
    { setor: { $in: deptIds }, date: { $gte: hojeInicio, $lte: hojeFim } },
    { projection: { date: 1, setor: 1, atendentes: 1, operacoes: 1 } }
  ).toArray();

  const idsOperadoresHoje = new Set<string>();
  const setorPorIdOpaSuite = new Map<string, SetorAtendimento>();

  for (const doc of atendimentosHoje) {
    const setorAtendimento = resolverSetorPorObjectId(doc.setor);
    if (!setorAtendimento) continue;
    for (const a of (doc.atendentes || [])) {
      if (a.atendimentoHumano && a.atendente) {
        const idStr = a.atendente.toString();
        idsOperadoresHoje.add(idStr);
        setorPorIdOpaSuite.set(idStr, setorAtendimento); // guarda o setor do último atendimento processado
      }
    }
  }

  // 3. Buscar os nomes no Mongo para cruzar
  const nomesDoRoster = agentesRoster.map(a => a.nome);
  const idsDoOpa = Array.from(idsOperadoresHoje).map(id => new ObjectId(id));
  
  const queryUsuarios: any = {};
  if (nomesDoRoster.length && idsDoOpa.length) {
    queryUsuarios.$or = [{ nome: { $in: nomesDoRoster } }, { _id: { $in: idsDoOpa } }];
  } else if (nomesDoRoster.length) {
    queryUsuarios.nome = { $in: nomesDoRoster };
  } else if (idsDoOpa.length) {
    queryUsuarios._id = { $in: idsDoOpa };
  } else {
    return []; // Ninguém no roster e nenhum atendimento hoje
  }

  const usuarios = await db.collection('usuarios').find(
    queryUsuarios,
    { projection: { nome: 1 } }
  ).toArray();

  const opsMap = new Map<string, OperadorAoVivo & { _userId: string }>();

  for (const u of usuarios) {
    const uid = u._id.toString();
    const nome = (u.nome as string) || 'Desconhecido';
    
    // Descobrir o setor: prioriza o roster, senão usa o setor do atendimento
    const noRoster = agentesRoster.find(a => a.nome === nome);
    let setor = noRoster ? EQUIPE_ROSTER_PARA_CODIGO[noRoster.equipe] : setorPorIdOpaSuite.get(uid);
    
    // Se ainda não tiver setor, pula
    if (!setor) continue;
    
    opsMap.set(uid, {
      nome,
      setor,
      status: 'on', // placeholder
      tempoStatusMs: 0,
      volumeHoje: 0,
      tmaMs: null,
      tmeMs: null,
      tmrMs: null,
      _userId: uid
    });
  }

  if (opsMap.size === 0) return [];

  // 4. Pegar o último status de cada um (coleção user_status) e filtrar os offline.
  // user_status.userId é ObjectId, não string — comparar com a string do uid
  // nunca bate e derrubava a lista inteira (todo mundo virava "offline").
  const idsParaDeletar = [];
  for (const [uid, op] of opsMap) {
    const ultimoStatusArr = await db.collection('user_status')
      .find({ userId: new ObjectId(uid) }).sort({ startAt: -1 }).limit(1).toArray();

    if (!ultimoStatusArr.length) { idsParaDeletar.push(uid); continue; }

    const ultimoStatus = ultimoStatusArr[0];
    const statusUi = STATUS_PARA_UI[ultimoStatus.status];
    if (!statusUi) { idsParaDeletar.push(uid); continue; }

    op.status = statusUi;
    op.tempoStatusMs = ultimoStatus.startAt ? (Date.now() - new Date(ultimoStatus.startAt).getTime()) : 0;
  }
  
  for (const uid of idsParaDeletar) opsMap.delete(uid);
  if (opsMap.size === 0) return [];

  const idsAtivosStr = Array.from(opsMap.keys());
  
  // 5. Pegar KPIs do dia para esses operadores (usando os atendimentos já buscados + filtrando para esses IDs ativos)
  const tmasPorOp = new Map<string, number[]>();
  const tmesPorOp = new Map<string, number[]>();
  const volumePorOp = new Map<string, Set<string>>();
  const segmentosPorAtendimento = new Map<string, { inicio: number; fim: number }[]>();
  const atendimentosValidos = [];

  for (const doc of atendimentosHoje) {
    const docId = doc._id.toString();
    const tme = calcularTme(doc);
    const opIdsNoAtendimento = new Set<string>();
    let teveAtivo = false;

    for (const a of (doc.atendentes || [])) {
      if (a.atendimentoHumano && a.atendente) {
        const opId = a.atendente.toString();
        if (opsMap.has(opId)) {
          teveAtivo = true;
          opIdsNoAtendimento.add(opId);
          
          if (!volumePorOp.has(opId)) volumePorOp.set(opId, new Set());
          volumePorOp.get(opId)!.add(docId);

          if (typeof a.tempoDeAtendimento === 'number') {
            if (!tmasPorOp.has(opId)) tmasPorOp.set(opId, []);
            tmasPorOp.get(opId)!.push(a.tempoDeAtendimento);
          }
        }
      }
    }

    if (teveAtivo) {
      if (tme !== null) {
        for (const opId of opIdsNoAtendimento) {
          if (!tmesPorOp.has(opId)) tmesPorOp.set(opId, []);
          tmesPorOp.get(opId)!.push(tme);
        }
      }
      segmentosPorAtendimento.set(docId, segmentosHumanos(doc));
      atendimentosValidos.push(doc);
    }
  }

  // TMR
  const tmrsPorOp = new Map<string, number[]>();
  if (atendimentosValidos.length) {
    const msgs = await db.collection('atendimentos_mensagens').find(
      { id_rota: { $in: atendimentosValidos.map((d) => d._id) }, tipo: 'texto' },
      { projection: { id_rota: 1, data: 1, id_user: 1, id_atend: 1, mensagem: 1 } }
    ).sort({ data: 1 }).toArray();

    const porAtendimento = new Map<string, { data: Date; ehCliente: boolean; ehSaida: boolean; idAtend?: string }[]>();
    for (const m of msgs) {
      if (!m.data) continue;
      const ehCliente = Boolean(m.id_user) && !m.id_atend;
      const ehSaida = Boolean(m.id_atend) && typeof m.mensagem === 'string';
      if (!ehCliente && !ehSaida) continue;

      const chave = m.id_rota.toString();
      if (!porAtendimento.has(chave)) porAtendimento.set(chave, []);
      porAtendimento.get(chave)!.push({ 
        data: new Date(m.data), 
        ehCliente, 
        ehSaida, 
        idAtend: m.id_atend?.toString() 
      });
    }

    for (const [chave, mensagens] of porAtendimento) {
      const segmentos = segmentosPorAtendimento.get(chave) ?? [];
      if (!segmentos.length) continue;

      let ultimaMensagemCliente: number | null = null;
      for (const m of mensagens) {
        const t = m.data.getTime();
        if (m.ehCliente) {
          ultimaMensagemCliente = t;
          continue;
        }
        if (!m.ehSaida || ultimaMensagemCliente === null) continue;

        const ehHumano = segmentos.some((s) => t >= s.inicio && t <= s.fim);
        if (ehHumano && m.idAtend) {
          if (!tmrsPorOp.has(m.idAtend)) tmrsPorOp.set(m.idAtend, []);
          tmrsPorOp.get(m.idAtend)!.push(t - ultimaMensagemCliente);
          ultimaMensagemCliente = null;
        }
      }
    }
  }

  // Montar resposta final
  const opsFinal: OperadorAoVivo[] = [];
  for (const [uid, op] of opsMap) {
    op.volumeHoje = volumePorOp.get(uid)?.size ?? 0;
    op.tmaMs = mediana(tmasPorOp.get(uid) ?? []);
    op.tmeMs = mediana(tmesPorOp.get(uid) ?? []);
    op.tmrMs = mediana(tmrsPorOp.get(uid) ?? []);
    const { _userId, ...cleanOp } = op;
    opsFinal.push(cleanOp);
  }

  return opsFinal;
}

/// Indicador de jornada por operador num PERÍODO configurável (RH/gestão do
/// Centro de Solução) — diferente de buscarKpisOperadoresAoVivo, que só olha
/// o status ATUAL de agora. Mesma descoberta de candidatos (roster QA ∪ quem
/// atendeu no período), mas soma o tempo real gasto em cada status ao longo
/// de todo o período, não só o mais recente.
export async function buscarIndicadoresJornada(
  dateFrom: Date,
  dateTo: Date,
  setores?: SetorAtendimento[],
): Promise<IndicadorJornadaOperador[]> {
  const db = await getOpaSuiteDb();

  // 1. Roster QA ativo, filtrado pelos setores pedidos
  const agentes = await prisma.atendimentoAgenteQa.findMany({
    where: { status: 'Ativo', nome: { notIn: ['APRIMORAR', 'TESTE'] } },
    select: { nome: true, equipe: true },
  });
  const agentesRoster = setores
    ? agentes.filter((a) => {
        const codigo = EQUIPE_ROSTER_PARA_CODIGO[a.equipe];
        return codigo && setores.includes(codigo);
      })
    : agentes;

  // 2. Quem atendeu no período (cobre Vendas/Pós-Vendas, fora do roster de QA),
  // e já aproveita pra contar o volume de cada um.
  const deptIds = (setores ?? TODOS_SETORES).map((s) => new ObjectId(DEPARTAMENTO_IDS[s]));
  const atendimentosPeriodo = await db.collection('atendimentos').find(
    { setor: { $in: deptIds }, date: { $gte: dateFrom, $lte: dateTo } },
    { projection: { setor: 1, atendentes: 1 } },
  ).toArray();

  const volumePorOp = new Map<string, Set<string>>();
  const setorPorIdOpaSuite = new Map<string, SetorAtendimento>();
  for (const doc of atendimentosPeriodo) {
    const setorAtendimento = resolverSetorPorObjectId(doc.setor);
    if (!setorAtendimento) continue;
    const docId = doc._id.toString();
    for (const a of (doc.atendentes || [])) {
      if (a.atendimentoHumano && a.atendente) {
        const idStr = a.atendente.toString();
        setorPorIdOpaSuite.set(idStr, setorAtendimento);
        if (!volumePorOp.has(idStr)) volumePorOp.set(idStr, new Set());
        volumePorOp.get(idStr)!.add(docId);
      }
    }
  }

  // 3. Cruzar nomes (roster por nome ∪ quem atendeu por id) pra achar os candidatos
  const nomesDoRoster = agentesRoster.map((a) => a.nome);
  const idsDoOpa = Array.from(volumePorOp.keys()).map((id) => new ObjectId(id));

  const queryUsuarios: any = {};
  if (nomesDoRoster.length && idsDoOpa.length) {
    queryUsuarios.$or = [{ nome: { $in: nomesDoRoster } }, { _id: { $in: idsDoOpa } }];
  } else if (nomesDoRoster.length) {
    queryUsuarios.nome = { $in: nomesDoRoster };
  } else if (idsDoOpa.length) {
    queryUsuarios._id = { $in: idsDoOpa };
  } else {
    return [];
  }

  const usuarios = await db.collection('usuarios').find(queryUsuarios, { projection: { nome: 1 } }).toArray();

  const candidatos = new Map<string, { nome: string; setor: SetorAtendimento }>();
  for (const u of usuarios) {
    const uid = u._id.toString();
    const nome = (u.nome as string) || 'Desconhecido';
    const noRoster = agentesRoster.find((a) => a.nome === nome);
    const setor = noRoster ? EQUIPE_ROSTER_PARA_CODIGO[noRoster.equipe] : setorPorIdOpaSuite.get(uid);
    if (!setor) continue;
    candidatos.set(uid, { nome, setor });
  }

  if (candidatos.size === 0) return [];

  // 4. Somar tempo por status no período.
  const idsAtivos = Array.from(candidatos.keys()).map((id) => new ObjectId(id));
  const temposPorOp = new Map<string, { produtivo: number; pausa: number; ausente: number }>();
  function somarTempo(uid: string, status: string, ms: number) {
    if (ms <= 0) return;
    const statusUi = STATUS_PARA_UI[status];
    if (!statusUi) return; // 'off' (ou status desconhecido) não conta como tempo logado
    if (!temposPorOp.has(uid)) temposPorOp.set(uid, { produtivo: 0, pausa: 0, ausente: 0 });
    const bucket = temposPorOp.get(uid)!;
    if (statusUi === 'on') bucket.produtivo += ms;
    else if (statusUi === 'pause') bucket.pausa += ms;
    else if (statusUi === 'au') bucket.ausente += ms;
  }

  // 4a. Janelas FECHADAS: user_status.timeSpent já vem calculado pelo próprio
  // OpaSuite, confiável, soma em massa via aggregate.
  const fechadosRows = await db.collection('user_status').aggregate([
    { $match: { userId: { $in: idsAtivos }, startAt: { $gte: dateFrom, $lte: dateTo }, timeSpent: { $exists: true } } },
    { $group: { _id: { userId: '$userId', status: '$status' }, totalMs: { $sum: '$timeSpent' } } },
  ]).toArray();
  for (const row of fechadosRows) {
    somarTempo((row._id.userId as ObjectId).toString(), row._id.status, row.totalMs);
  }

  // 4b. Janelas SEM timeSpent: NÃO é sempre "o status atual, em andamento até
  // agora" — confirmado empiricamente que existem várias janelas abandonadas
  // no meio do período (reconexão cria um "on" novo sem fechar o anterior
  // direito), não só a mais recente. Assumir "até agora" pra todas gerava
  // durações de dias/semanas para um operador só. A duração real é até o
  // PRÓXIMO status desse mesmo operador (esteja esse próximo dentro ou fora
  // do período pedido); só quando não existe nenhum próximo é que é de fato
  // o status atual, aí sim conta até agora.
  const abertosRows = await db.collection('user_status').find({
    userId: { $in: idsAtivos }, startAt: { $gte: dateFrom, $lte: dateTo }, timeSpent: { $exists: false },
  }).toArray();
  for (const doc of abertosRows) {
    const uid = (doc.userId as ObjectId).toString();
    const proximo = await db.collection('user_status')
      .find({ userId: doc.userId, startAt: { $gt: doc.startAt } })
      .sort({ startAt: 1 }).limit(1).toArray();
    const fimReal = proximo.length ? new Date(proximo[0].startAt) : new Date();
    somarTempo(uid, doc.status, fimReal.getTime() - new Date(doc.startAt).getTime());
  }

  const resultado: IndicadorJornadaOperador[] = [];
  for (const [uid, { nome, setor }] of candidatos) {
    const t = temposPorOp.get(uid) ?? { produtivo: 0, pausa: 0, ausente: 0 };
    const tempoLogadoMs = t.produtivo + t.pausa + t.ausente;
    resultado.push({
      nome,
      setor,
      volumeAtendimentos: volumePorOp.get(uid)?.size ?? 0,
      tempoLogadoMs,
      tempoProdutivoMs: t.produtivo,
      tempoPausaMs: t.pausa,
      tempoAusenteMs: t.ausente,
      pctProdutivo: tempoLogadoMs > 0 ? Math.round((t.produtivo / tempoLogadoMs) * 1000) / 10 : null,
      pctPausa:     tempoLogadoMs > 0 ? Math.round((t.pausa     / tempoLogadoMs) * 1000) / 10 : null,
      pctAusente:   tempoLogadoMs > 0 ? Math.round((t.ausente   / tempoLogadoMs) * 1000) / 10 : null,
    });
  }

  return resultado.sort((a, b) => b.tempoProdutivoMs - a.tempoProdutivoMs);
}

const PREFIXO_META_EFICIENCIA = 'META_EFICIENCIA_';
const CHAVE_LIMITE_INDISPONIBILIDADE = 'LIMITE_INDISPONIBILIDADE_ATENDIMENTO';
const LIMITE_INDISPONIBILIDADE_PADRAO = 15;

/// Lê os limites de jornada configurados pela gestão (Regras de Negócio,
/// categoria ATENDIMENTO): só formatação visual da tabela, nunca altera o
/// cálculo em si. Sem regra cadastrada, usa o padrão de indisponibilidade e
/// nenhuma meta de eficiência (não tem "bom" universal por setor).
export async function buscarConfigJornada(): Promise<ConfigJornada> {
  const regras = await prisma.diagnosticoRegraNegocio.findMany({
    where: { categoria: 'ATENDIMENTO' },
    select: { chave: true, valor: true },
  });

  let limiteIndisponibilidadePct = LIMITE_INDISPONIBILIDADE_PADRAO;
  const metasEficienciaPorSetor: Partial<Record<SetorAtendimento, number>> = {};

  for (const r of regras) {
    if (r.chave === CHAVE_LIMITE_INDISPONIBILIDADE) {
      const n = Number(r.valor);
      if (!isNaN(n)) limiteIndisponibilidadePct = n;
      continue;
    }
    if (r.chave.startsWith(PREFIXO_META_EFICIENCIA)) {
      const setor = r.chave.slice(PREFIXO_META_EFICIENCIA.length) as SetorAtendimento;
      const n = Number(r.valor);
      if (TODOS_SETORES.includes(setor) && !isNaN(n)) metasEficienciaPorSetor[setor] = n;
    }
  }

  return { limiteIndisponibilidadePct, metasEficienciaPorSetor };
}


import { ObjectId } from 'mongodb';
import prisma from '../../config/prisma';
import { getOpaSuiteDb } from '../../config/opasuiteMongo';
import { DEPARTAMENTO_IDS, resolverSetorPorObjectId } from './atendimento.repository';
import { TODOS_SETORES, nomeSetorAtendimento } from './atendimento.types';

/// Alertas operacionais em tempo real — granularidade por conversa/agente
/// individual, diferente dos alertas agregados de volume/escalonamento em
/// alertas.service.ts (que continuam indo por e-mail). Isso aqui é um feed
/// dentro do próprio Canaã Performance (ver model AtendimentoAlertaOperacional
/// no schema.prisma), não manda e-mail/WhatsApp — evita repetir o erro de
/// lotar os canais existentes com alerta de baixo nível.

const LIMIAR_CONVERSA_PARADA_MIN = parseInt(process.env.LIMIAR_CONVERSA_PARADA_MIN ?? '10', 10);
const LIMIAR_SLA_FILA_MIN        = parseInt(process.env.LIMIAR_SLA_FILA_MIN ?? '5', 10);
const LIMIAR_AGENTE_AUSENTE_MIN  = parseInt(process.env.LIMIAR_AGENTE_AUSENTE_MIN ?? '15', 10);
const LIMIAR_FILA_BACKLOG        = parseInt(process.env.LIMIAR_FILA_BACKLOG ?? '5', 10);
/// Teto de quanto tempo atrás o atendimento pode ter sido ABERTO pra ainda
/// contar como "parada" urgente — validado ao vivo (2026-07-12): sem esse
/// teto, tickets esquecidos há semanas em status EA (nunca fechados pelo
/// atendente) entravam misturados com conversas genuinamente travadas há 10
/// min, diluindo o sinal (27 alertas "parada" numa rodada, a maioria com
/// dias/semanas de idade). Não resolve o problema de ticket zumbi — só evita
/// tratá-lo como se fosse urgência de agora.
const LIMIAR_CONVERSA_PARADA_JANELA_MAX_HORAS = parseInt(process.env.LIMIAR_CONVERSA_PARADA_JANELA_MAX_HORAS ?? '24', 10);

interface DadosAlerta {
  tipo:                    string;
  severidade:              'AVISO' | 'CRITICO';
  /// Pra CONVERSA_PARADA/SLA_FILA/FILA_ACUMULADA é sempre um SetorAtendimento
  /// válido. Pra AGENTE_AUSENTE é o campo `equipe` do roster curado
  /// (AtendimentoAgenteQa), que nem sempre bate com os códigos de
  /// SetorAtendimento (ex: "Retenção" vs código "RETENCAO") — por isso é
  /// string livre aqui, só pra exibição, nunca usado como filtro.
  setor:                   string;
  titulo:                  string;
  descricao:                string;
  opasuiteAtendimentoId?:  string;
  agenteNome?:             string;
}

function chaveAlerta(d: Pick<DadosAlerta, 'tipo' | 'setor' | 'opasuiteAtendimentoId' | 'agenteNome'>) {
  return {
    tipo_setor_opasuite_atendimento_id_agente_nome: {
      tipo:                    d.tipo,
      setor:                   d.setor,
      opasuite_atendimento_id: d.opasuiteAtendimentoId ?? '',
      agente_nome:             d.agenteNome ?? '',
    },
  };
}

/// Cria o alerta se não existir um ABERTO igual, ou reabre se tinha sido
/// resolvido antes (a condição voltou a acontecer) — nunca duplica.
async function upsertAlerta(d: DadosAlerta): Promise<void> {
  await prisma.atendimentoAlertaOperacional.upsert({
    where: chaveAlerta(d),
    create: {
      tipo: d.tipo, severidade: d.severidade, setor: d.setor, titulo: d.titulo, descricao: d.descricao,
      opasuite_atendimento_id: d.opasuiteAtendimentoId ?? '', agente_nome: d.agenteNome ?? '',
    },
    update: { status: 'ABERTO', resolvido_em: null, titulo: d.titulo, descricao: d.descricao, severidade: d.severidade },
  });
}

async function resolverForaDaLista(tipo: string, campo: 'opasuite_atendimento_id' | 'agente_nome', valoresAtivos: string[]): Promise<number> {
  const resultado = await prisma.atendimentoAlertaOperacional.updateMany({
    where: { tipo, status: 'ABERTO', [campo]: { notIn: valoresAtivos } },
    data: { status: 'RESOLVIDO', resolvido_em: new Date() },
  });
  return resultado.count;
}

export interface ResultadoDeteccao {
  criados:    number;
  resolvidos: number;
}

/// Conversa EM ATENDIMENTO (status='EA') com um humano ativo (segmento
/// atendimentoHumano=true, fim=null) cuja última mensagem foi do CLIENTE e
/// está sem resposta há mais de LIMIAR_CONVERSA_PARADA_MIN. Se a última
/// mensagem já foi do atendente, não está "parada" esperando humano.
///
/// Só considera atendimentos ABERTOS nas últimas LIMIAR_CONVERSA_PARADA_JANELA_MAX_HORAS
/// horas — sem esse teto, ticket esquecido há semanas em EA (nunca fechado
/// pelo atendente) dispara o mesmo alerta "urgente" de uma conversa parada
/// há 10 min de verdade, confirmado ao vivo (2026-07-12).
export async function detectarConversasParadas(): Promise<ResultadoDeteccao> {
  const db = await getOpaSuiteDb();
  const limite = new Date(Date.now() - LIMIAR_CONVERSA_PARADA_MIN * 60000);
  const janelaMaxima = new Date(Date.now() - LIMIAR_CONVERSA_PARADA_JANELA_MAX_HORAS * 3600000);
  const deptIds = Object.values(DEPARTAMENTO_IDS).map((id) => new ObjectId(id));

  const emAndamento = await db.collection('atendimentos').find(
    { setor: { $in: deptIds }, status: 'EA', date: { $gte: janelaMaxima } },
    { projection: { setor: 1, atendentes: 1, protocolo: 1 } },
  ).toArray();

  const idsAtivos: string[] = [];
  let criados = 0;

  for (const doc of emAndamento) {
    const setor = resolverSetorPorObjectId(doc.setor);
    if (!setor) continue;
    const temHumanoAtivo = (doc.atendentes ?? []).some((a: any) => a.atendimentoHumano && a.fim === null);
    if (!temHumanoAtivo) continue;

    const ultimaMsg = await db.collection('atendimentos_mensagens')
      .find({ id_rota: doc._id }).sort({ data: -1 }).limit(1).toArray();
    if (!ultimaMsg.length) continue;
    const m = ultimaMsg[0];
    const ehCliente = Boolean(m.id_user) && !m.id_atend;
    if (!ehCliente || !m.data || new Date(m.data) > limite) continue;

    const id = doc._id.toString();
    idsAtivos.push(id);
    await upsertAlerta({
      tipo: 'CONVERSA_PARADA', severidade: 'AVISO', setor, opasuiteAtendimentoId: id,
      titulo: `Conversa parada — protocolo ${doc.protocolo}`,
      descricao: `Última mensagem foi do cliente e está sem resposta do atendente há mais de ${LIMIAR_CONVERSA_PARADA_MIN} min.`,
    });
    criados++;
  }

  const resolvidos = await resolverForaDaLista('CONVERSA_PARADA', 'opasuite_atendimento_id', idsAtivos);
  return { criados, resolvidos };
}

/// Conversa AGUARDANDO (status='AG', sem humano assumido ainda) há mais de
/// LIMIAR_SLA_FILA_MIN desde a abertura. Usa operacoes[0].date (abertura)
/// como proxy de "entrou na fila" — aproximação razoável pra v1, já que
/// status='AG' normalmente significa que ainda não teve intervenção humana
/// desde o início.
export async function detectarSlaFila(): Promise<ResultadoDeteccao> {
  const db = await getOpaSuiteDb();
  const limite = new Date(Date.now() - LIMIAR_SLA_FILA_MIN * 60000);
  const deptIds = Object.values(DEPARTAMENTO_IDS).map((id) => new ObjectId(id));

  const aguardando = await db.collection('atendimentos').find(
    { setor: { $in: deptIds }, status: 'AG' },
    { projection: { setor: 1, operacoes: 1, protocolo: 1 } },
  ).toArray();

  const idsAtivos: string[] = [];
  let criados = 0;

  for (const doc of aguardando) {
    const setor = resolverSetorPorObjectId(doc.setor);
    if (!setor) continue;
    const abertura = doc.operacoes?.[0]?.date ? new Date(doc.operacoes[0].date) : null;
    if (!abertura || abertura > limite) continue;

    const id = doc._id.toString();
    idsAtivos.push(id);
    await upsertAlerta({
      tipo: 'SLA_FILA', severidade: 'CRITICO', setor, opasuiteAtendimentoId: id,
      titulo: `Fila sem 1ª resposta — protocolo ${doc.protocolo}`,
      descricao: `Aguardando atendimento humano há mais de ${LIMIAR_SLA_FILA_MIN} min.`,
    });
    criados++;
  }

  const resolvidos = await resolverForaDaLista('SLA_FILA', 'opasuite_atendimento_id', idsAtivos);
  return { criados, resolvidos };
}

/// Agente do roster curado de QA (AtendimentoAgenteQa, status Ativo) com
/// status 'au' (ausente) ou 'pause' há mais de LIMIAR_AGENTE_AUSENTE_MIN no
/// user_status do OpaSuite (histórico real de status, confirmado 1,1M
/// registros). Só olha pros agentes do roster, não todo mundo com login no
/// OpaSuite — evita alerta de gente que não é atendente de call center.
export async function detectarAgenteAusente(): Promise<ResultadoDeteccao> {
  const db = await getOpaSuiteDb();
  const limite = new Date(Date.now() - LIMIAR_AGENTE_AUSENTE_MIN * 60000);

  const agentes = await prisma.atendimentoAgenteQa.findMany({
    where: { status: 'Ativo', nome: { notIn: ['APRIMORAR', 'TESTE'] } },
    select: { nome: true, equipe: true },
  });
  if (!agentes.length) return { criados: 0, resolvidos: 0 };

  const usuarios = await db.collection('usuarios').find(
    { nome: { $in: agentes.map((a) => a.nome) } },
    { projection: { nome: 1 } },
  ).toArray();

  const nomesAtivos: string[] = [];
  let criados = 0;

  for (const u of usuarios) {
    const ultimoStatus = await db.collection('user_status')
      .find({ userId: u._id.toString() }).sort({ startAt: -1 }).limit(1).toArray();
    if (!ultimoStatus.length) continue;
    const [status] = ultimoStatus;
    if (!['au', 'pause'].includes(status.status) || !status.startAt || new Date(status.startAt) > limite) continue;

    const agente = agentes.find((a) => a.nome === u.nome);
    const setor = agente?.equipe ?? '—';
    nomesAtivos.push(u.nome as string);
    await upsertAlerta({
      tipo: 'AGENTE_AUSENTE', severidade: 'AVISO', setor, agenteNome: u.nome as string,
      titulo: `${u.nome} ausente/pausado há muito tempo`,
      descricao: `Status "${status.status === 'au' ? 'ausente' : 'pausa'}" desde ${new Date(status.startAt).toLocaleString('pt-BR')}, mais de ${LIMIAR_AGENTE_AUSENTE_MIN} min.`,
    });
    criados++;
  }

  const resolvidos = await resolverForaDaLista('AGENTE_AUSENTE', 'agente_nome', nomesAtivos);
  return { criados, resolvidos };
}

/// Fila acumulada (status='AG') por setor — se >= LIMIAR_FILA_BACKLOG,
/// mantém/cria o alerta; se cair abaixo, resolve automaticamente. É por
/// setor (não por conversa/agente individual), então usa só `setor` na
/// chave de dedup (os outros dois campos ficam vazios).
export async function detectarFilaAcumulada(): Promise<ResultadoDeteccao> {
  const db = await getOpaSuiteDb();
  let criados = 0;
  const setoresComBacklog: string[] = [];

  for (const setor of TODOS_SETORES) {
    const deptId = new ObjectId(DEPARTAMENTO_IDS[setor]);
    const qtd = await db.collection('atendimentos').countDocuments({ setor: deptId, status: 'AG' });
    if (qtd < LIMIAR_FILA_BACKLOG) continue;

    setoresComBacklog.push(setor);
    await upsertAlerta({
      tipo: 'FILA_ACUMULADA', severidade: 'AVISO', setor,
      titulo: `Fila acumulada em ${nomeSetorAtendimento(setor)}`,
      descricao: `${qtd} atendimento(s) aguardando, acima do limiar de ${LIMIAR_FILA_BACKLOG}.`,
    });
    criados++;
  }

  const resultado = await prisma.atendimentoAlertaOperacional.updateMany({
    where: { tipo: 'FILA_ACUMULADA', status: 'ABERTO', setor: { notIn: setoresComBacklog } },
    data: { status: 'RESOLVIDO', resolvido_em: new Date() },
  });

  return { criados, resolvidos: resultado.count };
}

export interface ResultadoAlertasOperacionais {
  conversasParadas: ResultadoDeteccao;
  slaFila:          ResultadoDeteccao;
  agenteAusente:    ResultadoDeteccao;
  filaAcumulada:    ResultadoDeteccao;
}

/// Roda as 4 detecções — chamado pelo cron a cada 2 min (jobs/alertas.job.ts)
/// e também disponível pra rodar manualmente (scripts/).
export async function rodarDeteccaoAlertasOperacionais(): Promise<ResultadoAlertasOperacionais> {
  const [conversasParadas, slaFila, agenteAusente, filaAcumulada] = await Promise.all([
    detectarConversasParadas(),
    detectarSlaFila(),
    detectarAgenteAusente(),
    detectarFilaAcumulada(),
  ]);
  return { conversasParadas, slaFila, agenteAusente, filaAcumulada };
}

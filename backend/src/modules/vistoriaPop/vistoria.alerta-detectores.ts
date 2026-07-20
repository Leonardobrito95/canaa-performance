import prisma from '../../config/prisma';
import { buscarPendenciasAbertas, buscarResumoPorPop } from './vistoriaPop.repository';
import { CATEGORIAS_SEGURANCA } from './vistoriaPop.types';

/// Alertas da Vistoria de POP — mesma arquitetura já validada em
/// atendimento.alertas-operacionais.ts (upsert + resolve-fora-da-lista),
/// adaptada pra esse domínio: 2 detectores, rodando 1x por dia (não a cada
/// 2 min como Atendimento — vistoria muda no ritmo de inspeção, não de
/// conversa em tempo real). Feed interno (GET /vistoria-pop/alertas), não
/// manda e-mail/WhatsApp — mesmo motivo já documentado lá.

const LIMIAR_PENDENCIA_SEGURANCA_DIAS = Number(process.env.LIMIAR_PENDENCIA_SEGURANCA_DIAS) || 7;
const LIMIAR_POP_ATRASADO_DIAS = Number(process.env.LIMIAR_POP_ATRASADO_DIAS) || 60;

interface DadosAlertaVistoria {
  tipo:        'PENDENCIA_SEGURANCA' | 'POP_ATRASADO';
  severidade:  'AVISO' | 'CRITICO';
  titulo:      string;
  descricao:   string;
  popName:     string;
  pendenciaId?: string;
}

function chaveAlerta(d: Pick<DadosAlertaVistoria, 'tipo' | 'popName' | 'pendenciaId'>) {
  return {
    tipo_pop_name_pendencia_id: {
      tipo:         d.tipo,
      pop_name:     d.popName,
      pendencia_id: d.pendenciaId ?? '',
    },
  };
}

/// Cria o alerta se não existir um ABERTO igual, ou reabre se tinha sido
/// resolvido antes (condição voltou a acontecer) — nunca duplica.
async function upsertAlerta(d: DadosAlertaVistoria): Promise<void> {
  await prisma.vistoriaAlerta.upsert({
    where: chaveAlerta(d),
    create: {
      tipo: d.tipo, severidade: d.severidade, titulo: d.titulo, descricao: d.descricao,
      pop_name: d.popName, pendencia_id: d.pendenciaId ?? '',
    },
    update: { status: 'ABERTO', resolvido_em: null, resolvido_por: null, titulo: d.titulo, descricao: d.descricao, severidade: d.severidade },
  });
}

async function resolverForaDaLista(tipo: string, campo: 'pop_name' | 'pendencia_id', valoresAtivos: string[]): Promise<number> {
  const resultado = await prisma.vistoriaAlerta.updateMany({
    where: { tipo, status: 'ABERTO', [campo]: { notIn: valoresAtivos } },
    data: { status: 'RESOLVIDO', resolvido_em: new Date() },
  });
  return resultado.count;
}

export interface ResultadoDeteccao { criados: number; resolvidos: number; }

/// Pendência de segurança crítica (Extintor/Gerador/Banco de Baterias) em
/// aberto há mais de LIMIAR_PENDENCIA_SEGURANCA_DIAS — severidade CRITICO,
/// dedup por pendencia_id (id de public.vistoria_pendencias).
export async function detectarPendenciaSeguranca(): Promise<ResultadoDeteccao> {
  const pendencias = await buscarPendenciasAbertas(CATEGORIAS_SEGURANCA);
  const qualificadas = pendencias.filter((p) => (p.diasAberta ?? 0) >= LIMIAR_PENDENCIA_SEGURANCA_DIAS);

  for (const p of qualificadas) {
    await upsertAlerta({
      tipo: 'PENDENCIA_SEGURANCA', severidade: 'CRITICO',
      titulo: `${p.categoria} pendente em ${p.popName}`,
      descricao: `${p.descricao} em aberto há ${p.diasAberta} dia(s).`,
      popName: p.popName, pendenciaId: String(p.id),
    });
  }
  const resolvidos = await resolverForaDaLista('PENDENCIA_SEGURANCA', 'pendencia_id', qualificadas.map((p) => String(p.id)));
  return { criados: qualificadas.length, resolvidos };
}

/// POP sem vistoria há mais de LIMIAR_POP_ATRASADO_DIAS (ou nunca vistoriado)
/// — severidade AVISO, dedup por pop_name (1 alerta por POP, sem pendência
/// específica associada).
export async function detectarPopAtrasado(): Promise<ResultadoDeteccao> {
  const resumo = await buscarResumoPorPop();
  const atrasados = resumo.filter((r) => r.diasDesde === null || r.diasDesde >= LIMIAR_POP_ATRASADO_DIAS);

  for (const r of atrasados) {
    await upsertAlerta({
      tipo: 'POP_ATRASADO', severidade: 'AVISO',
      titulo: `POP ${r.popName} atrasado pra vistoria`,
      descricao: r.diasDesde !== null
        ? `Última vistoria há ${r.diasDesde} dia(s) (${r.ultimaVistoria?.slice(0, 10)}), inspetor ${r.inspetor ?? 'não registrado'}.`
        : 'Nenhuma vistoria registrada pra este POP.',
      popName: r.popName,
    });
  }
  const resolvidos = await resolverForaDaLista('POP_ATRASADO', 'pop_name', atrasados.map((r) => r.popName));
  return { criados: atrasados.length, resolvidos };
}

export interface ResultadoAlertasVistoria {
  pendenciaSeguranca: ResultadoDeteccao;
  popAtrasado:        ResultadoDeteccao;
}

/// Roda as 2 detecções — chamado pelo cron diário (jobs/alertas.job.ts) e
/// também disponível pra rodar manualmente.
export async function rodarDeteccaoAlertasVistoria(): Promise<ResultadoAlertasVistoria> {
  const [pendenciaSeguranca, popAtrasado] = await Promise.all([
    detectarPendenciaSeguranca(),
    detectarPopAtrasado(),
  ]);
  return { pendenciaSeguranca, popAtrasado };
}

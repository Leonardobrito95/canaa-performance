import prisma from '../../config/prisma';
import { AlertaHubItem } from './alertasHub.types';

export async function listarAlertasHub(): Promise<AlertaHubItem[]> {
  const [atendimentoAlertas, vistoriaAlertas] = await Promise.all([
    prisma.atendimentoAlertaOperacional.findMany({ where: { status: 'ABERTO' } }),
    prisma.vistoriaAlerta.findMany({ where: { status: 'ABERTO' } })
  ]);

  const atendimentoFormatados: AlertaHubItem[] = atendimentoAlertas.map((a) => ({
    id: a.id,
    origem: 'atendimento',
    tipo: a.tipo,
    severidade: a.severidade,
    titulo: a.titulo,
    descricao: a.descricao,
    contexto: a.setor,
    criado_em: a.criado_em,
    resolvido_em: a.resolvido_em,
    status: a.status
  }));

  const vistoriaFormatados: AlertaHubItem[] = vistoriaAlertas.map((a) => ({
    id: a.id,
    origem: 'vistoria',
    tipo: a.tipo,
    severidade: a.severidade,
    titulo: a.titulo,
    descricao: a.descricao,
    contexto: a.pop_name,
    criado_em: a.criado_em,
    resolvido_em: a.resolvido_em,
    status: a.status
  }));

  const todos = [...atendimentoFormatados, ...vistoriaFormatados];

  return todos.sort((a, b) => {
    if (a.severidade === 'CRITICO' && b.severidade !== 'CRITICO') return -1;
    if (a.severidade !== 'CRITICO' && b.severidade === 'CRITICO') return 1;
    return b.criado_em.getTime() - a.criado_em.getTime();
  });
}

export async function resolverAlertaHub(origem: 'atendimento' | 'vistoria', id: string, resolvidoPor: string) {
  if (origem === 'atendimento') {
    return await prisma.atendimentoAlertaOperacional.update({
      where: { id },
      data: { status: 'RESOLVIDO', resolvido_em: new Date(), resolvido_por: resolvidoPor }
    });
  } else if (origem === 'vistoria') {
    return await prisma.vistoriaAlerta.update({
      where: { id },
      data: { status: 'RESOLVIDO', resolvido_em: new Date(), resolvido_por: resolvidoPor }
    });
  }
  throw new Error('Origem de alerta desconhecida.');
}

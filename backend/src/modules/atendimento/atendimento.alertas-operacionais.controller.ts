import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/prisma';

/// Feed de alertas operacionais em tempo real — sempre os ABERTOS,
/// críticos primeiro. Não passa filtro de período: é sempre "o que está
/// acontecendo agora", não histórico (ver rotina de resolução automática
/// no cron, jobs/alertas.job.ts).
export async function listarAlertasOperacionais(req: Request, res: Response, next: NextFunction) {
  try {
    const itens = await prisma.atendimentoAlertaOperacional.findMany({
      where: { status: 'ABERTO' },
      // 'CRITICO' > 'AVISO' alfabeticamente — desc bota crítico primeiro.
      orderBy: [{ severidade: 'desc' }, { criado_em: 'desc' }],
    });
    res.json({ itens });
  } catch (err) { next(err); }
}

export async function resolverAlertaOperacional(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const alerta = await prisma.atendimentoAlertaOperacional.update({
      where: { id },
      data: { status: 'RESOLVIDO', resolvido_em: new Date() },
    });
    res.json(alerta);
  } catch (err) { next(err); }
}

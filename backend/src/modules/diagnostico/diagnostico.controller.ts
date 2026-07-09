import { Request, Response, NextFunction } from 'express';
import { AuthPayload } from '../auth/auth.service';
import prisma from '../../config/prisma';
import { gerarDiagnosticoIndividual } from './diagnostico.service';

type AuthRequest = Request & { user: AuthPayload };

export async function criarConsulta(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, nome } = (req as AuthRequest).user;
    const { id_cliente, pergunta } = req.body as { id_cliente: number; pergunta?: string };

    const resultado = await gerarDiagnosticoIndividual(
      id_cliente,
      { ixcUserId: id, ixcUsername: nome },
      pergunta,
    );

    res.json(resultado);
  } catch (err) { next(err); }
}

export async function listarHistoricoConsultas(req: Request, res: Response, next: NextFunction) {
  try {
    const { id_cliente } = req.params;
    const consultas = await prisma.diagnosticoConsulta.findMany({
      where: { tipo_alvo: 'CLIENTE', id_alvo: id_cliente },
      orderBy: { criado_em: 'desc' },
      take: 50,
      select: {
        id: true, pergunta: true, resposta: true,
        ixc_username: true, criado_em: true,
      },
    });
    res.json(consultas);
  } catch (err) { next(err); }
}

export async function listarAgregados(req: Request, res: Response, next: NextFunction) {
  try {
    const { dimensao } = req.query as { dimensao?: string };
    const agregados = await prisma.diagnosticoAgregado.findMany({
      where: dimensao ? { dimensao } : undefined,
      orderBy: { atualizado_em: 'desc' },
    });
    res.json(agregados);
  } catch (err) { next(err); }
}

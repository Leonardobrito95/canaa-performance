import { Request, Response, NextFunction } from 'express';
import { AuthPayload } from '../auth/auth.service';
import prisma from '../../config/prisma';
import { gerarDiagnosticoIndividual } from './diagnostico.service';
import { buscarClientePorNome } from './diagnostico.repository';

type AuthRequest = Request & { user: AuthPayload };

export async function buscarCliente(req: Request, res: Response, next: NextFunction) {
  try {
    const { termo } = req.query as { termo: string };
    const candidatos = await buscarClientePorNome(termo);
    res.json(candidatos);
  } catch (err) { next(err); }
}

export async function criarConsulta(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, nome } = (req as AuthRequest).user;
    const { id_cliente, pergunta, historico } = req.body as {
      id_cliente: number;
      pergunta?: string;
      historico?: { pergunta: string; resposta: string }[];
    };

    const resultado = await gerarDiagnosticoIndividual(
      id_cliente,
      { ixcUserId: id, ixcUsername: nome },
      pergunta,
      historico,
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

export async function listarRegras(req: Request, res: Response, next: NextFunction) {
  try {
    const regras = await prisma.diagnosticoRegraNegocio.findMany({ orderBy: { chave: 'asc' } });
    res.json(regras);
  } catch (err) { next(err); }
}

export async function criarRegra(req: Request, res: Response, next: NextFunction) {
  try {
    const { nome } = (req as AuthRequest).user;
    const { chave, valor, descricao, categoria } = req.body;
    const regra = await prisma.diagnosticoRegraNegocio.create({
      data: { chave, valor, descricao, categoria, atualizado_por: nome },
    });
    res.status(201).json(regra);
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'Já existe uma regra com essa chave.' });
      return;
    }
    next(err);
  }
}

export async function editarRegra(req: Request, res: Response, next: NextFunction) {
  try {
    const { nome } = (req as AuthRequest).user;
    const { chave } = req.params;
    const { valor, descricao, categoria } = req.body;
    const regra = await prisma.diagnosticoRegraNegocio.update({
      where: { chave },
      data: { valor, descricao, categoria, atualizado_por: nome },
    });
    res.json(regra);
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Regra não encontrada.' });
      return;
    }
    next(err);
  }
}

export async function excluirRegra(req: Request, res: Response, next: NextFunction) {
  try {
    const { chave } = req.params;
    await prisma.diagnosticoRegraNegocio.delete({ where: { chave } });
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Regra não encontrada.' });
      return;
    }
    next(err);
  }
}

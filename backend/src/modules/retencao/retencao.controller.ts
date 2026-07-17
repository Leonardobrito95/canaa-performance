import { Request, Response, NextFunction } from 'express';
import { AuthPayload } from '../auth/auth.service';
import {
  getRetencao,
  getRetencaoDetalhe,
  saveNegociacao,
  removeNegociacao as serviceRemoveNegociacao,
  getResumoAuditoriaRetencao,
} from './retencao.service';
import { buscarConversasOpaSuitePorChamado } from './retencao.repository';
import { rodarAuditoriaRetencao } from './retencao.auditoria';
import prisma from '../../config/prisma';

type AuthRequest = Request & { user: AuthPayload };

export async function listRetencao(req: Request, res: Response, next: NextFunction) {
  try {
    const { perfil, nome } = (req as AuthRequest).user;
    const { dateFrom, dateTo, operador } = req.query as Record<string, string>;
    const result = await getRetencao(perfil, nome, { dateFrom, dateTo, operador });
    res.json(result);
  } catch (err) { next(err); }
}

export async function listRetencaoDetalhe(req: Request, res: Response, next: NextFunction) {
  try {
    const { perfil, nome } = (req as AuthRequest).user;
    const { dateFrom, dateTo, operador } = req.query as Record<string, string>;
    const result = await getRetencaoDetalhe(perfil, nome, { dateFrom, dateTo, operador });
    res.json(result);
  } catch (err) { next(err); }
}

export async function createNegociacao(req: Request, res: Response, next: NextFunction) {
  try {
    const { nome } = (req as AuthRequest).user;
    const { id_chamado, valor_original, valor_negociado, descricao } = req.body;

    if (!id_chamado || valor_original === undefined || valor_negociado === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios: id_chamado, valor_original, valor_negociado' });
    }

    const result = await saveNegociacao({
      id_chamado,
      valor_original:  Number(valor_original),
      valor_negociado: Number(valor_negociado),
      descricao:       descricao || null,
      registrado_por:  nome,
    });

    res.json(result);
  } catch (err) { next(err); }
}

export async function removeNegociacao(req: Request, res: Response, next: NextFunction) {
  try {
    const { id_chamado } = req.params;
    await serviceRemoveNegociacao(id_chamado);
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function resumoAuditoria(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getResumoAuditoriaRetencao();
    res.json(result);
  } catch (err) { next(err); }
}

export async function conversaOpaSuite(req: Request, res: Response, next: NextFunction) {
  try {
    const { id_chamado } = req.params;
    const conversas = await buscarConversasOpaSuitePorChamado(id_chamado);
    res.json({ conversas });
  } catch (err) { next(err); }
}

/// Reclassificação manual de 1 O.S. — pedido pela gestão (2026-07-17) depois
/// de um caso real onde a IA classificou errado (SEM_NEGOCIACAO) apesar da
/// evidência completa mostrar retenção real: rodar de novo com a MESMA
/// evidência corrigiu (LLM não é determinístico, isso pode acontecer de
/// novo). `reclassificar: true` + `idChamado` ignora o filtro de "ainda não
/// auditada" e força reprocessar só esse chamado.
export async function reclassificarChamado(req: Request, res: Response, next: NextFunction) {
  try {
    const { id_chamado } = req.params;
    const resultado = await rodarAuditoriaRetencao({ idChamado: id_chamado, reclassificar: true, limite: 1 });
    if (resultado.totalEncontrados === 0) {
      res.status(404).json({ message: 'Chamado não encontrado ou fora do escopo de auditoria de retenção.' });
      return;
    }
    if (resultado.falha > 0) {
      res.status(502).json({ message: 'Falha ao reclassificar — tente novamente em instantes.' });
      return;
    }
    const registro = await prisma.retencaoAuditoria.findUnique({ where: { id_chamado } });
    res.json(registro);
  } catch (err) { next(err); }
}

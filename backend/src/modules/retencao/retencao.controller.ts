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

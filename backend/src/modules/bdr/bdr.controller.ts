import { Request, Response, NextFunction } from 'express';
import * as bdrService from './bdr.service';
import { RegisterCommissionBody, CreateAdjustmentBody } from './bdr.schemas';

export async function getContract(req: Request, res: Response, next: NextFunction) {
  try {
    const { id_contrato } = req.params;
    const contract = await bdrService.getContract(id_contrato);
    res.json(contract);
  } catch (err) {
    next(err);
  }
}

export async function registerCommission(req: Request, res: Response, next: NextFunction) {
  try {
    const { id_contrato, vendedor, tipo_negociacao, plano_novo, valor_novo } = req.body as RegisterCommissionBody;

    const commission = await bdrService.registerCommission({
      id_contrato,
      vendedor,
      tipo_negociacao,
      plano_novo:  plano_novo ?? undefined,
      valor_novo:  valor_novo ?? undefined,
      criado_por:  req.user!.nome,
    });

    res.status(201).json(commission);
  } catch (err) {
    next(err);
  }
}

export async function listCommissions(req: Request, res: Response, next: NextFunction) {
  try {
    const { perfil, nome } = req.user!;
    const { dateFrom, dateTo, cursor, take } = req.query as Record<string, string | undefined>;
    const commissions = await bdrService.getAllCommissions(perfil, nome, {
      dateFrom,
      dateTo,
      cursor,
      take: take ? Math.min(Number(take), 500) : undefined,
    });
    res.json(commissions);
  } catch (err) {
    next(err);
  }
}

export async function getConsultants(_req: Request, res: Response, next: NextFunction) {
  try {
    const consultants = await bdrService.getConsultants();
    res.json(consultants);
  } catch (err) {
    next(err);
  }
}

export async function refreshConsultants(req: Request, res: Response, next: NextFunction) {
  try {
    const { perfil } = req.user!;
    if (perfil !== 'gestor') {
      res.status(403).json({ message: 'Apenas gestores podem atualizar a lista de consultores.' });
      return;
    }
    const consultants = await bdrService.refreshConsultants();
    res.json({ consultants, total: consultants.length });
  } catch (err) {
    next(err);
  }
}

export async function getPlans(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await bdrService.getPlans());
  } catch (err) { next(err); }
}

export async function listAdjustments(req: Request, res: Response, next: NextFunction) {
  try {
    const { perfil, nome } = req.user!;
    res.json(await bdrService.getAdjustments(perfil, nome));
  } catch (err) { next(err); }
}

export async function createAdjustment(req: Request, res: Response, next: NextFunction) {
  try {
    const { perfil, nome } = req.user!;
    if (perfil !== 'gestor') {
      res.status(403).json({ message: 'Apenas gestores podem registrar ajustes.' });
      return;
    }
    const { vendedor, descricao, valor } = req.body as CreateAdjustmentBody;
    const result = await bdrService.addAdjustment({ vendedor, descricao, valor }, nome);
    res.status(201).json(result);
  } catch (err: unknown) {
    const e = err as Error;
    res.status(400).json({ message: e.message });
  }
}

export async function deleteAdjustment(req: Request, res: Response, next: NextFunction) {
  try {
    const { perfil, nome } = req.user!;
    if (perfil !== 'gestor') {
      res.status(403).json({ message: 'Apenas gestores podem remover ajustes.' });
      return;
    }
    await bdrService.removeAdjustment(req.params.id, nome);
    res.status(204).send();
  } catch (err) { next(err); }
}

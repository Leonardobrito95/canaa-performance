import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/prisma';
import { buscarResumoPorPop, buscarPendenciasAbertas, buscarHistoricoPop } from './vistoriaPop.repository';

// URL pública do sistema de Vistoria de POP — SEM SSO por enquanto (decisão
// documentada no plano: mexe em auth de um sistema externo, Flask-Login,
// exige política de auto-provisionamento; fica pra uma entrega separada).
// O técnico continua logando com a própria conta de lá, sem mudança de
// fluxo. Env var (não hardcoded) porque essa URL muda quando o time de
// infra fechar a exposição pública (domínio + Nginx, fora deste repo).
const VISTORIA_POP_PUBLIC_URL = process.env.VISTORIA_POP_PUBLIC_URL ?? 'http://45.230.84.50:5002';

export function link(req: Request, res: Response) {
  res.json({ url: VISTORIA_POP_PUBLIC_URL });
}

export async function resumo(req: Request, res: Response, next: NextFunction) {
  try {
    const [pops, pendencias] = await Promise.all([
      buscarResumoPorPop(),
      buscarPendenciasAbertas(),
    ]);
    res.json({ pops, pendencias });
  } catch (err) { next(err); }
}

export async function historicoPop(req: Request, res: Response, next: NextFunction) {
  try {
    const { popName } = req.params;
    const itens = await buscarHistoricoPop(popName);
    res.json({ itens });
  } catch (err) { next(err); }
}

export async function listarAlertas(req: Request, res: Response, next: NextFunction) {
  try {
    const itens = await prisma.vistoriaAlerta.findMany({
      where: { status: 'ABERTO' },
      // 'CRITICO' > 'AVISO' alfabeticamente — desc bota crítico primeiro.
      orderBy: [{ severidade: 'desc' }, { criado_em: 'desc' }],
    });
    res.json({ itens });
  } catch (err) { next(err); }
}

export async function resolverAlerta(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const alerta = await prisma.vistoriaAlerta.update({
      where: { id },
      data: { status: 'RESOLVIDO', resolvido_em: new Date() },
    });
    res.json(alerta);
  } catch (err) { next(err); }
}

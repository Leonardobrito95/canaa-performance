import { Request, Response, NextFunction } from 'express';

const HUB_ADMIN_IDS = (process.env.HUB_SUPER_ADMIN_ID ?? '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

export function requireHubAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ message: 'Não autenticado.' });
    return;
  }
  if (!HUB_ADMIN_IDS.includes(String(req.user.id))) {
    res.status(403).json({ message: 'Acesso restrito ao administrador do Hub.' });
    return;
  }
  next();
}

export function isHubAdmin(userId: string): boolean {
  return HUB_ADMIN_IDS.includes(userId);
}

import { Request, Response, NextFunction } from 'express';
import { AuthPayload } from '../modules/auth/auth.service';

export function requirePerfil(...perfis: AuthPayload['perfil'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ message: 'Não autenticado.' });
      return;
    }
    if (!perfis.includes(req.user.perfil)) {
      res.status(403).json({ message: 'Acesso restrito.' });
      return;
    }
    next();
  };
}

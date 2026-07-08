import { Request, Response, NextFunction } from 'express';
import { login } from './auth.service';
import { createAccessLog } from '../hub/hub.repository';

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);

    // Registra evento de login no log do Hub (fire-and-forget)
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
             ?? req.socket.remoteAddress
             ?? undefined;
    createAccessLog({
      ixc_user_id:  result.ixc_user_id,
      ixc_username: result.user.nome,
      action:       'LOGIN',
      ip_address:   ip,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

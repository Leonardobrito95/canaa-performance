import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginHandler } from './auth.controller';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

router.post('/login', loginLimiter, loginHandler);

export default router;

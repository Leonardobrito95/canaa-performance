import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { PERFIS_MODULO } from '../../config/acesso';
import { resumo, resolver } from './alertasHub.controller';

const router = Router();

router.use(authenticate, requirePerfil(...PERFIS_MODULO.alertasHub));

router.get('/resumo', resumo);
router.post('/:origem/:id/resolver', resolver);

export default router;

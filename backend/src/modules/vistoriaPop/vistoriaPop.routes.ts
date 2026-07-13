import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { link, resumo, historicoPop, listarAlertas, resolverAlerta } from './vistoriaPop.controller';

const router = Router();

// Mesmo RBAC de acesso ao OTDR (gestor + campo) — não existe perfil
// "infraestrutura" hoje, mesma decisão já tomada em posativacao.routes.ts.
router.use(authenticate, requirePerfil('gestor', 'campo'));

router.get('/link',                      link);
router.get('/resumo',                    resumo);
router.get('/pop/:popName/historico',    historicoPop);
router.get('/alertas',                   listarAlertas);
router.post('/alertas/:id/resolver',     resolverAlerta);

export default router;

import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { validate } from '../../middlewares/validate';
import { consultaBodySchema, historicoParamsSchema } from './diagnostico.schemas';
import { criarConsulta, listarHistoricoConsultas, listarAgregados } from './diagnostico.controller';

const router = Router();

// Consulta individual — qualquer perfil autenticado
router.post('/consulta', authenticate, validate('body', consultaBodySchema), criarConsulta);
router.get(
  '/consulta/:id_cliente/historico',
  authenticate,
  validate('params', historicoParamsSchema),
  listarHistoricoConsultas,
);

// Painel agregado — somente gestor
router.get('/agregado', authenticate, requirePerfil('gestor'), listarAgregados);

export default router;

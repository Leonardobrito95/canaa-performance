import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { validate } from '../../middlewares/validate';
import {
  consultaBodySchema,
  historicoParamsSchema,
  buscarClienteQuerySchema,
  regraNegocioBodySchema,
  regraNegocioUpdateBodySchema,
  regraNegocioParamsSchema,
} from './diagnostico.schemas';
import {
  criarConsulta,
  listarHistoricoConsultas,
  listarAgregados,
  buscarCliente,
  listarRegras,
  criarRegra,
  editarRegra,
  excluirRegra,
} from './diagnostico.controller';

const router = Router();

// Consulta individual — qualquer perfil autenticado
router.get('/cliente', authenticate, validate('query', buscarClienteQuerySchema), buscarCliente);
router.post('/consulta', authenticate, validate('body', consultaBodySchema), criarConsulta);
router.get(
  '/consulta/:id_cliente/historico',
  authenticate,
  validate('params', historicoParamsSchema),
  listarHistoricoConsultas,
);

// Painel agregado — somente gestor
router.get('/agregado', authenticate, requirePerfil('gestor'), listarAgregados);

// Regras de negócio (referência lida pelo prompt da IA) — somente gestor
router.get('/regras', authenticate, requirePerfil('gestor'), listarRegras);
router.post('/regras', authenticate, requirePerfil('gestor'), validate('body', regraNegocioBodySchema), criarRegra);
router.put(
  '/regras/:chave',
  authenticate,
  requirePerfil('gestor'),
  validate('params', regraNegocioParamsSchema),
  validate('body', regraNegocioUpdateBodySchema),
  editarRegra,
);
router.delete(
  '/regras/:chave',
  authenticate,
  requirePerfil('gestor'),
  validate('params', regraNegocioParamsSchema),
  excluirRegra,
);

export default router;

import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { PERFIS_MODULO } from '../../config/acesso';
import { requireHubAdmin } from '../../middlewares/requireHubAdmin';
import { validate } from '../../middlewares/validate';
import {
  consultaBodySchema,
  historicoParamsSchema,
  buscarClienteQuerySchema,
  regraNegocioBodySchema,
  regraNegocioUpdateBodySchema,
  regraNegocioParamsSchema,
  gestaoConsultaBodySchema,
  feedbackParamsSchema,
  feedbackBodySchema,
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
  criarConsultaGestao,
  statusIxc,
  statusGemini,
  registrarFeedback,
  resumoGestao,
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
router.post(
  '/consulta/:id/feedback',
  authenticate,
  validate('params', feedbackParamsSchema),
  validate('body', feedbackBodySchema),
  registrarFeedback,
);

// Painel agregado — somente gestor
router.get('/agregado', authenticate, requirePerfil(...PERFIS_MODULO.diagnosticoGestao), listarAgregados);
// Resumo direto (ranking/evolução/POPs) pros cards do Painel de Gestão — sem Gemini
router.get('/gestao/resumo', authenticate, requirePerfil(...PERFIS_MODULO.diagnosticoGestao), resumoGestao);

// Saúde da dependência de sessão do IXC (fotos de O.S.) — somente gestor
router.get('/_health/ixc', authenticate, requirePerfil(...PERFIS_MODULO.diagnosticoGestao), statusIxc);
// Custo/latência agregados do Gemini (desde o início do processo) — somente gestor
router.get('/_health/gemini', authenticate, requirePerfil(...PERFIS_MODULO.diagnosticoGestao), statusGemini);
router.post(
  '/gestao/consulta',
  authenticate,
  requirePerfil(...PERFIS_MODULO.diagnosticoGestao),
  validate('body', gestaoConsultaBodySchema),
  criarConsultaGestao,
);

// Regras de negócio (referência lida pelo prompt da IA) — só admin do hub
// (mesmo acesso do módulo Administração), não qualquer gestor.
router.get('/regras', authenticate, requireHubAdmin, listarRegras);
router.post('/regras', authenticate, requireHubAdmin, validate('body', regraNegocioBodySchema), criarRegra);
router.put(
  '/regras/:chave',
  authenticate,
  requireHubAdmin,
  validate('params', regraNegocioParamsSchema),
  validate('body', regraNegocioUpdateBodySchema),
  editarRegra,
);
router.delete(
  '/regras/:chave',
  authenticate,
  requireHubAdmin,
  validate('params', regraNegocioParamsSchema),
  excluirRegra,
);

export default router;

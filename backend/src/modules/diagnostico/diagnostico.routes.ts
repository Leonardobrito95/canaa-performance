import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requireHubAdmin } from '../../middlewares/requireHubAdmin';
import { validate } from '../../middlewares/validate';
import {
  consultaBodySchema,
  historicoParamsSchema,
  resumoClienteParamsSchema,
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
  buscarResumoCliente,
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
  exportarRelatorioGestao,
} from './diagnostico.controller';

const router = Router();

// Consulta individual — restrita ao super admin do hub (2026-07-19: CAIO
// ainda em avaliação, usuário pediu pra ninguém além dele usar por enquanto;
// antes disso era aberta pra qualquer perfil autenticado). Reaproveita o
// MESMO gate já usado em Regras de Negócio/Administração — não é um
// mecanismo novo, é o super admin existente cobrindo mais rotas.
router.get('/cliente', authenticate, requireHubAdmin, validate('query', buscarClienteQuerySchema), buscarCliente);
// Resumo leve (sem Gemini, sem fotos), mostrado antes do usuário confirmar
// que quer o diagnóstico completo (criarConsulta abaixo).
router.get(
  '/cliente/:id_cliente/resumo',
  authenticate,
  requireHubAdmin,
  validate('params', resumoClienteParamsSchema),
  buscarResumoCliente,
);
router.post('/consulta', authenticate, requireHubAdmin, validate('body', consultaBodySchema), criarConsulta);
router.get(
  '/consulta/:id_cliente/historico',
  authenticate,
  requireHubAdmin,
  validate('params', historicoParamsSchema),
  listarHistoricoConsultas,
);
router.post(
  '/consulta/:id/feedback',
  authenticate,
  requireHubAdmin,
  validate('params', feedbackParamsSchema),
  validate('body', feedbackBodySchema),
  registrarFeedback,
);

// Painel de Gestão — também restrito ao super admin por enquanto (era
// PERFIS_MODULO.diagnosticoGestao = qualquer 'gestor'; ficou mais restrito
// que isso agora, mesma decisão de 2026-07-19 acima).
router.get('/agregado', authenticate, requireHubAdmin, listarAgregados);
// Resumo direto (ranking/evolução/POPs) pros cards do Painel de Gestão — sem Gemini
router.get('/gestao/resumo', authenticate, requireHubAdmin, resumoGestao);

// Saúde da dependência de sessão do IXC (fotos de O.S.)
router.get('/_health/ixc', authenticate, requireHubAdmin, statusIxc);
// Custo/latência agregados do Gemini (desde o início do processo)
router.get('/_health/gemini', authenticate, requireHubAdmin, statusGemini);
router.post(
  '/gestao/consulta',
  authenticate,
  requireHubAdmin,
  validate('body', gestaoConsultaBodySchema),
  criarConsultaGestao,
);
// Gera o PDF/Excel pedido pelo CAIO no chat (ver EXPORTAR: no marcador de
// diagnostico.service.ts) — mesmo RBAC do chat de gestão.
router.get('/gestao/exportar', authenticate, requireHubAdmin, exportarRelatorioGestao);

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

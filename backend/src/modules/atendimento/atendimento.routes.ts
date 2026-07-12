import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { resumoAtendimento, auditarAtendimento } from './atendimento.controller';
import {
  listarMonitoriaQa, dashboardQa, criarMonitoria, atualizarMonitoria, buscarMonitoria, sugestaoQa,
  minhasAvaliacoes, comunicarCiencia,
} from './atendimento.qa.controller';
import { triagemAnaliseIa, dashboardAnaliseIa } from './atendimento.analise-ia.controller';
import { listarAlertasOperacionais, resolverAlertaOperacional } from './atendimento.alertas-operacionais.controller';

const router = Router();

router.get('/resumo',    authenticate, requirePerfil('gestor', 'cs'), resumoAtendimento);
router.post('/auditoria/:protocolo', authenticate, requirePerfil('gestor'), auditarAtendimento);

// Monitoria de qualidade por QA humano (incorporada do sistema legado) —
// mesmo RBAC do resto do módulo atendimento.
router.get('/qa',                    authenticate, requirePerfil('gestor', 'cs'), listarMonitoriaQa);
router.get('/qa/dashboard',          authenticate, requirePerfil('gestor', 'cs'), dashboardQa);
router.get('/qa/sugestao/:protocolo', authenticate, requirePerfil('gestor', 'cs'), sugestaoQa);

// Autoatendimento do agente ("ciência" na própria nota) — sem requirePerfil:
// qualquer perfil autenticado pode ser um agente de QA (souAgenteQa não
// depende de id_grupo, ver auth.service.ts). A identidade é validada dentro
// do controller/service via ixc_user_id, não pelo perfil. Precisa vir ANTES
// de '/qa/:id' pra não ser capturado como se "minhas-avaliacoes" fosse um id.
router.get('/qa/minhas-avaliacoes',  authenticate, minhasAvaliacoes);
router.post('/qa/:id/comunicar',     authenticate, comunicarCiencia);

router.get('/qa/:id',                authenticate, requirePerfil('gestor', 'cs'), buscarMonitoria);
router.post('/qa',                   authenticate, requirePerfil('gestor', 'cs'), criarMonitoria);
router.put('/qa/:id',                authenticate, requirePerfil('gestor', 'cs'), atualizarMonitoria);

// Camada analítica de IA em massa (sinal de triagem, não QA oficial) — mesmo RBAC.
router.get('/analise-ia/triagem',   authenticate, requirePerfil('gestor', 'cs'), triagemAnaliseIa);
router.get('/analise-ia/dashboard', authenticate, requirePerfil('gestor', 'cs'), dashboardAnaliseIa);

// Alertas operacionais em tempo real (conversa parada, SLA de fila, agente
// ausente, fila acumulada) — feed interno, mesmo RBAC do módulo.
router.get('/alertas-operacionais',              authenticate, requirePerfil('gestor', 'cs'), listarAlertasOperacionais);
router.post('/alertas-operacionais/:id/resolver', authenticate, requirePerfil('gestor', 'cs'), resolverAlertaOperacional);

export default router;

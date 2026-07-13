import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { PERFIS_MODULO } from '../../config/acesso';
import { resumoAtendimento, auditarAtendimento, operadoresAoVivo, indicadoresJornada, configJornada } from './atendimento.controller';
import {
  listarMonitoriaQa, dashboardQa, criarMonitoria, atualizarMonitoria, buscarMonitoria, sugestaoQa,
  minhasAvaliacoes, comunicarCiencia,
} from './atendimento.qa.controller';
import { triagemAnaliseIa, dashboardAnaliseIa } from './atendimento.analise-ia.controller';
import { listarAlertasOperacionais, resolverAlertaOperacional } from './atendimento.alertas-operacionais.controller';

const router = Router();

router.get('/resumo',    authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), resumoAtendimento);
router.post('/auditoria/:protocolo', authenticate, requirePerfil(...PERFIS_MODULO.atendimentoAuditoria), auditarAtendimento);

// Monitoria de qualidade por QA humano (incorporada do sistema legado) —
// mesmo RBAC do resto do módulo atendimento.
router.get('/qa',                    authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), listarMonitoriaQa);
router.get('/qa/dashboard',          authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), dashboardQa);
router.get('/qa/sugestao/:protocolo', authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), sugestaoQa);

// Autoatendimento do agente ("ciência" na própria nota) — sem requirePerfil:
// qualquer perfil autenticado pode ser um agente de QA (souAgenteQa não
// depende de id_grupo, ver auth.service.ts). A identidade é validada dentro
// do controller/service via ixc_user_id, não pelo perfil. Precisa vir ANTES
// de '/qa/:id' pra não ser capturado como se "minhas-avaliacoes" fosse um id.
router.get('/qa/minhas-avaliacoes',  authenticate, minhasAvaliacoes);
router.post('/qa/:id/comunicar',     authenticate, comunicarCiencia);

router.get('/qa/:id',                authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), buscarMonitoria);
router.post('/qa',                   authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), criarMonitoria);
router.put('/qa/:id',                authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), atualizarMonitoria);

// Camada analítica de IA em massa (sinal de triagem, não QA oficial) — mesmo RBAC.
router.get('/analise-ia/triagem',   authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), triagemAnaliseIa);
router.get('/analise-ia/dashboard', authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), dashboardAnaliseIa);

// Alertas operacionais em tempo real (conversa parada, SLA de fila, agente
// ausente, fila acumulada) — feed interno, mesmo RBAC do módulo.
router.get('/alertas-operacionais',              authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), listarAlertasOperacionais);
router.post('/alertas-operacionais/:id/resolver', authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), resolverAlertaOperacional);

// Tabela em tempo real de operadores online
router.get('/operadores-ao-vivo', authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), operadoresAoVivo);

// Indicador de jornada (RH/gestão) num período configurável — tempo
// produtivo/pausa/ausente e volume por operador, histórico (não é só o
// status atual como /operadores-ao-vivo).
router.get('/indicadores-jornada', authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), indicadoresJornada);

// Limites de jornada configurados pela gestão (Regras de Negócio, categoria
// ATENDIMENTO): só leitura aqui; escrever/editar é só via /diagnostico/regras
// (hub-admin), não duplicado neste módulo.
router.get('/config-jornada', authenticate, requirePerfil(...PERFIS_MODULO.atendimentoGestaoQa), configJornada);

export default router;

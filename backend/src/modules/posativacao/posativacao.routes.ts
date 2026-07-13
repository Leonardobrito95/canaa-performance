import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { PERFIS_MODULO } from '../../config/acesso';
import {
  kpis, motivos, distribuicao, tendencia, churn, tecnicos, clientes, clientesExport, contatosCliente,
  bairros, canais, resolucaoSla,
} from './posativacao.controller';

const router = Router();

// Indicador de qualidade de instalação — dono é Campo (quem instala), mas
// Centro de Solução também consulta (é quem trata o ticket que o cliente
// abre depois, confirmado pelo usuário 2026-07-13). Não existe perfil
// "infraestrutura" hoje.
router.use(authenticate, requirePerfil(...PERFIS_MODULO.posAtivacao));

router.get('/kpis',                  kpis);
router.get('/motivos',               motivos);
router.get('/distribuicao',          distribuicao);
router.get('/tendencia',             tendencia);
router.get('/churn',                 churn);
router.get('/tecnicos',              tecnicos);
router.get('/bairros',               bairros);
router.get('/canais',                canais);
router.get('/resolucao-sla',         resolucaoSla);
router.get('/clientes',              clientes);
router.get('/clientes/export',       clientesExport);
router.get('/clientes/:idCliente/contatos', contatosCliente);

export default router;

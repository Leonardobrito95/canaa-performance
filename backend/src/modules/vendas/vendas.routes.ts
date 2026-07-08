import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { validate } from '../../middlewares/validate';
import { mesParamSchema, contractsQuerySchema } from './vendas.schemas';
import { listContracts, debugZapSign, refreshZapSign, listSnapshots, getSnapshotMes, criarSnapshot, enviarPagamento, getComissoesPorMes, getStatusRelatorio, enviarFinanceiro } from './vendas.controller';

const router = Router();

router.get('/contracts',                           authenticate, validate('query', contractsQuerySchema), listContracts);
router.get('/contracts/zapsign/debug/:contractId', authenticate, debugZapSign);
router.post('/contracts/zapsign/refresh',          authenticate, refreshZapSign);

// Comissões por mês (snapshot Postgres ou live IXC)
router.get('/comissoes/:mes',          authenticate, validate('params', mesParamSchema), getComissoesPorMes);

// Snapshots mensais
router.get('/snapshots',              authenticate, listSnapshots);
router.get('/snapshots/:mes',         authenticate, validate('params', mesParamSchema), getSnapshotMes);
router.post('/snapshots/:mes',        authenticate, validate('params', mesParamSchema), criarSnapshot);
router.post('/snapshots/:mes/pagar',  authenticate, validate('params', mesParamSchema), enviarPagamento);

// Relatório de comissão mensal
router.get('/relatorio/:mes/status',           authenticate, validate('params', mesParamSchema), getStatusRelatorio);
router.post('/relatorio/:mes/enviar-financeiro', authenticate, validate('params', mesParamSchema), enviarFinanceiro);

export default router;

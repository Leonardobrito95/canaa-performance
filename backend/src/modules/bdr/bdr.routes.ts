import { Router } from 'express';
import * as bdrController from './bdr.controller';
import { authenticate } from '../../middlewares/authenticate';
import { validate } from '../../middlewares/validate';
import { registerCommissionBodySchema, createAdjustmentBodySchema } from './bdr.schemas';

const router = Router();

router.use(authenticate);

router.get('/plans',                  bdrController.getPlans);
router.get('/consultants',            bdrController.getConsultants);
router.post('/consultants/refresh',   bdrController.refreshConsultants);
router.get('/contracts/:id_contrato', bdrController.getContract);
router.post('/commissions',           validate('body', registerCommissionBodySchema), bdrController.registerCommission);
router.get('/commissions',            bdrController.listCommissions);
router.get('/adjustments',            bdrController.listAdjustments);
router.post('/adjustments',           validate('body', createAdjustmentBodySchema), bdrController.createAdjustment);
router.delete('/adjustments/:id',     bdrController.deleteAdjustment);

export default router;

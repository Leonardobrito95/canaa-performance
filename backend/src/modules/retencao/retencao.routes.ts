import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { listRetencao, listRetencaoDetalhe, createNegociacao, removeNegociacao } from './retencao.controller';

const router = Router();

router.get('/',        authenticate, listRetencao);
router.get('/detalhe', authenticate, listRetencaoDetalhe);

router.post('/negociacao', authenticate, createNegociacao);
router.delete('/negociacao/:id_chamado', authenticate, removeNegociacao);

export default router;

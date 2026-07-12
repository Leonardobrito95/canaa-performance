import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { listRetencao, listRetencaoDetalhe, createNegociacao, removeNegociacao, resumoAuditoria, conversaOpaSuite } from './retencao.controller';

const router = Router();

router.get('/',        authenticate, listRetencao);
router.get('/detalhe', authenticate, listRetencaoDetalhe);

router.post('/negociacao', authenticate, createNegociacao);
router.delete('/negociacao/:id_chamado', authenticate, removeNegociacao);

router.get('/auditoria/resumo', authenticate, requirePerfil('gestor'), resumoAuditoria);
router.get('/auditoria/:id_chamado/conversa', authenticate, requirePerfil('gestor'), conversaOpaSuite);

export default router;

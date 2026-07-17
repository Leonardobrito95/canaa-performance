import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePerfil } from '../../middlewares/requirePerfil';
import { PERFIS_MODULO } from '../../config/acesso';
import { listRetencao, listRetencaoDetalhe, createNegociacao, removeNegociacao, resumoAuditoria, conversaOpaSuite, reclassificarChamado } from './retencao.controller';

const router = Router();

router.get('/',        authenticate, listRetencao);
router.get('/detalhe', authenticate, listRetencaoDetalhe);

router.post('/negociacao', authenticate, createNegociacao);
router.delete('/negociacao/:id_chamado', authenticate, removeNegociacao);

router.get('/auditoria/resumo', authenticate, requirePerfil(...PERFIS_MODULO.retencaoAuditoria), resumoAuditoria);
router.get('/auditoria/:id_chamado/conversa', authenticate, requirePerfil(...PERFIS_MODULO.retencaoAuditoria), conversaOpaSuite);
router.post('/auditoria/:id_chamado/reclassificar', authenticate, requirePerfil(...PERFIS_MODULO.retencaoAuditoria), reclassificarChamado);

export default router;

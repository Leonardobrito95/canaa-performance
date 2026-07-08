import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { gerarLinkOtdr } from './otdr.sso';

const router = Router();

router.use(authenticate);
router.get('/link', gerarLinkOtdr);

export default router;

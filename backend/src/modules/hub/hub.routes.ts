import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as ctrl from './hub.controller';
import { authenticate } from '../../middlewares/authenticate';
import { requireHubAdmin } from '../../middlewares/requireHubAdmin';
import { validate } from '../../middlewares/validate';
import { logModuleViewSchema } from './hub.schemas';

const router = Router();

// Diretório para thumbnails enviados pelo admin
const uploadDir = path.join(process.cwd(), 'uploads', 'hub', 'thumbnails');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: path.join(process.cwd(), 'uploads', 'hub', 'tmp') });

// Todas as rotas do Hub exigem autenticação IXC
router.use(authenticate);

// ─── Proxy (acesso a dashboards internos) ────────────────────────────────────
router.get('/proxy', ctrl.proxy);

// ─── Setores ─────────────────────────────────────────────────────────────────
router.get('/sectors', ctrl.listSectors);
router.post('/sectors',      requireHubAdmin, ctrl.createSector);
router.put('/sectors/:id',   requireHubAdmin, ctrl.updateSector);
router.delete('/sectors/:id', requireHubAdmin, ctrl.deleteSector);

// ─── Dashboards ──────────────────────────────────────────────────────────────
router.get('/dashboards',                    ctrl.listDashboards);
router.get('/dashboards/:id',               ctrl.getDashboard);
router.get('/dashboards/:id/embed-token',   ctrl.getPowerBIEmbedToken);
router.get('/dashboards/:id/export',        ctrl.exportDashboard);
router.post('/dashboards/:id/view',         ctrl.logDashboardView);

router.post('/dashboards',                                    requireHubAdmin, ctrl.createDashboard);
router.put('/dashboards/:id',                                 requireHubAdmin, ctrl.updateDashboard);
router.delete('/dashboards/:id',                              requireHubAdmin, ctrl.archiveDashboard);
router.patch('/dashboards/:id/thumbnail',                     requireHubAdmin, ctrl.updateThumbnail);
router.post('/dashboards/:id/thumbnail/upload', upload.single('file'), requireHubAdmin, ctrl.uploadThumbnail);
router.get('/dashboards/:id/shared-sectors',                  requireHubAdmin, ctrl.getSharedSectors);
router.put('/dashboards/:id/shared-sectors',                  requireHubAdmin, ctrl.updateSharedSectors);

// ─── Permissões ──────────────────────────────────────────────────────────────
router.get('/permissions',       requireHubAdmin, ctrl.listPermissions);
router.post('/permissions',      requireHubAdmin, ctrl.grantPermission);
router.delete('/permissions/:id', requireHubAdmin, ctrl.revokePermission);
router.get('/users/search',      requireHubAdmin, ctrl.searchIxcUsers);

// ─── Logs e Analytics ────────────────────────────────────────────────────────
// Log genérico de "abri este módulo" — usado por Vendas, Comissões, Campo,
// Registro BDR, Dashboard BDR, Retenção, OTDR, Sala de Reunião, etc, chamado
// uma vez quando o usuário navega pra lá, não a cada chamada de API interna.
router.post('/logs/view', validate('body', logModuleViewSchema), ctrl.logModuleView);
router.get('/logs',      requireHubAdmin, ctrl.listAccessLogs);
router.get('/analytics', requireHubAdmin, ctrl.getAnalytics);

export default router;

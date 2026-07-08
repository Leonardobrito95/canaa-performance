import { Request, Response } from 'express';
import * as service from './hub.service';
import * as repo from './hub.repository';
import * as pbiService from './powerbi.service';
import { proxyRequest } from './hub.proxy';
import path from 'path';
import fs from 'fs';
import logger from '../../config/logger';

function getIp(req: Request): string {
  return (req.headers['x-real-ip'] as string) ?? req.socket.remoteAddress ?? 'unknown';
}

// ─── Sectors ─────────────────────────────────────────────────────────────────

export async function listSectors(req: Request, res: Response) {
  try {
    const sectors = await service.listSectors();
    res.json(sectors);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

// ─── Power BI Embed Token ─────────────────────────────────────────────────────

export async function exportDashboard(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const dashboard = await service.getDashboard(id, req.user!.id);
    if (dashboard.type !== 'powerbi') {
      res.status(400).json({ message: 'Exportação disponível apenas para dashboards Power BI.' });
      return;
    }
    const { buffer, filename } = await pbiService.exportReportToPdf(dashboard.url);
    const safeTitle = dashboard.title.replace(/[^\wÀ-ɏ\s-]/g, '').trim().replace(/\s+/g, '_');
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);
    res.send(buffer);
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err.message;
    res.status(err.status ?? 500).json({ message: msg });
  }
}

export async function getPowerBIEmbedToken(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const dashboard = await service.getDashboard(id, req.user!.id);
    if (dashboard.type !== 'powerbi') {
      res.status(400).json({ message: 'Dashboard não é do tipo Power BI.' });
      return;
    }
    const result = await pbiService.getEmbedToken(dashboard.url);
    res.json(result);
  } catch (err: any) {
    // Log detalhado do erro para diagnóstico
    const axiosDetail = err?.response?.data ?? null;
    logger.error('[HUB] PowerBI EmbedToken erro', { error: err.message, detail: axiosDetail });
    const message = axiosDetail?.error_description ?? axiosDetail?.message ?? err.message;
    res.status(err.status ?? 500).json({ message });
  }
}

// ─── Sectors ─────────────────────────────────────────────────────────────────

export async function createSector(req: Request, res: Response) {
  try {
    const sector = await service.createSector(req.body);
    await service.logAdminAction({ ixc_user_id: req.user!.id, ixc_username: req.user!.nome, action: 'CREATE_SECTOR', detail: `name=${sector.name}`, ip_address: getIp(req) });
    res.status(201).json(sector);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function updateSector(req: Request, res: Response) {
  try {
    const sector = await service.updateSector(req.params.id, req.body);
    await service.logAdminAction({ ixc_user_id: req.user!.id, ixc_username: req.user!.nome, action: 'UPDATE_SECTOR', detail: `id=${sector.id}`, ip_address: getIp(req) });
    res.json(sector);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function deleteSector(req: Request, res: Response) {
  try {
    await service.deactivateSector(req.params.id);
    await service.logAdminAction({ ixc_user_id: req.user!.id, ixc_username: req.user!.nome, action: 'DELETE_SECTOR', detail: `id=${req.params.id}`, ip_address: getIp(req) });
    res.json({ message: 'Setor desativado.' });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

// ─── Dashboards ──────────────────────────────────────────────────────────────

export async function listDashboards(req: Request, res: Response) {
  try {
    const dashboards = await service.listDashboards(req.user!.id);
    res.json(dashboards);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function getDashboard(req: Request, res: Response) {
  try {
    const dashboard = await service.getDashboard(req.params.id, req.user!.id);
    res.json(dashboard);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function logDashboardView(req: Request, res: Response) {
  try {
    await service.logDashboardView({
      ixc_user_id: req.user!.id,
      ixc_username: req.user!.nome,
      dashboard_id: req.params.id,
      ip_address: getIp(req),
    });
    res.status(204).send();
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function logModuleView(req: Request, res: Response) {
  try {
    await service.logAdminAction({
      ixc_user_id: req.user!.id,
      ixc_username: req.user!.nome,
      action: req.body.action,
      detail: req.body.detail,
      ip_address: getIp(req),
    });
    res.status(204).send();
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function createDashboard(req: Request, res: Response) {
  try {
    const dashboard = await service.createDashboard(req.body);
    await service.logAdminAction({ ixc_user_id: req.user!.id, ixc_username: req.user!.nome, action: 'CREATE_DASHBOARD', detail: `title=${dashboard.title}`, ip_address: getIp(req) });
    res.status(201).json(dashboard);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function updateDashboard(req: Request, res: Response) {
  try {
    const dashboard = await service.updateDashboard(req.params.id, req.body);
    await service.logAdminAction({ ixc_user_id: req.user!.id, ixc_username: req.user!.nome, action: 'UPDATE_DASHBOARD', detail: `id=${dashboard.id}`, ip_address: getIp(req) });
    res.json(dashboard);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function archiveDashboard(req: Request, res: Response) {
  try {
    await service.archiveDashboard(req.params.id);
    await service.logAdminAction({ ixc_user_id: req.user!.id, ixc_username: req.user!.nome, action: 'ARCHIVE_DASHBOARD', detail: `id=${req.params.id}`, ip_address: getIp(req) });
    res.json({ message: 'Dashboard arquivado.' });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function updateThumbnail(req: Request, res: Response) {
  try {
    const data: Record<string, unknown> = {};
    if ('thumbnail_url' in req.body) data.thumbnail_url = req.body.thumbnail_url;
    if ('embed_mode' in req.body)    data.embed_mode = req.body.embed_mode ?? 'newtab';
    await service.updateDashboard(req.params.id, data);
    res.json({ message: 'Configurações atualizadas.' });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function uploadThumbnail(req: Request, res: Response) {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'Arquivo não enviado.' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (!allowed.includes(ext)) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ message: 'Formato inválido. Use JPG, PNG, WEBP ou GIF.' });
      return;
    }

    const dashboard = await repo.findDashboardById(req.params.id);
    if (!dashboard) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ message: 'Dashboard não encontrado.' });
      return;
    }

    // Remove thumbnail anterior se for upload local
    if (dashboard.thumbnail_url?.startsWith('/hub/uploads/thumbnails/')) {
      const oldPath = path.join(process.cwd(), 'uploads', 'hub', 'thumbnails', path.basename(dashboard.thumbnail_url));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const filename = `${req.params.id}_${Date.now()}${ext}`;
    const dest = path.join(process.cwd(), 'uploads', 'hub', 'thumbnails', filename);
    fs.renameSync(req.file.path, dest);

    const thumbnailUrl = `/hub/uploads/thumbnails/${filename}`;
    await service.updateDashboard(req.params.id, { thumbnail_url: thumbnailUrl });
    res.json({ thumbnail_url: thumbnailUrl });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function getSharedSectors(req: Request, res: Response) {
  try {
    const ids = await service.getSharedSectors(req.params.id);
    res.json(ids);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function updateSharedSectors(req: Request, res: Response) {
  try {
    const { sector_ids } = req.body as { sector_ids: string[] };
    await service.setSharedSectors(req.params.id, sector_ids ?? []);
    res.json({ message: 'Setores compartilhados atualizados.' });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

// ─── Proxy ───────────────────────────────────────────────────────────────────

export { proxyRequest as proxy };

// ─── Permissions ─────────────────────────────────────────────────────────────

export async function listPermissions(req: Request, res: Response) {
  try {
    const permissions = await service.listPermissions();
    res.json(permissions);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function grantPermission(req: Request, res: Response) {
  try {
    const permission = await service.grantPermission({
      ...req.body,
      created_by: req.user!.id,
    });
    await service.logAdminAction({ ixc_user_id: req.user!.id, ixc_username: req.user!.nome, action: 'GRANT_PERMISSION', detail: `user=${req.body.ixc_user_nome}`, ip_address: getIp(req) });
    res.status(201).json(permission);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function revokePermission(req: Request, res: Response) {
  try {
    await service.revokePermission(req.params.id);
    await service.logAdminAction({ ixc_user_id: req.user!.id, ixc_username: req.user!.nome, action: 'REVOKE_PERMISSION', detail: `permission_id=${req.params.id}`, ip_address: getIp(req) });
    res.json({ message: 'Permissão revogada.' });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function searchIxcUsers(req: Request, res: Response) {
  try {
    const query = req.query.q as string;
    const users = await service.searchIxcUsers(query);
    res.json(users);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

// ─── Logs & Analytics ────────────────────────────────────────────────────────

export async function listAccessLogs(req: Request, res: Response) {
  try {
    const result = await service.listAccessLogs({
      ixc_user_id: req.query.user_id as string | undefined,
      username:    req.query.username as string | undefined,
      action:      req.query.action as string | undefined,
      date_from:   req.query.date_from as string | undefined,
      date_to:     req.query.date_to as string | undefined,
      page:        parseInt(req.query.page as string) || 1,
      per_page:    parseInt(req.query.per_page as string) || 50,
    });
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

export async function getAnalytics(req: Request, res: Response) {
  try {
    const days     = Math.min(parseInt(req.query.days as string) || 30, 365);
    const userId   = req.query.user_id as string | undefined;
    const result = await service.getAnalytics(days, userId);
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ message: err.message });
  }
}

import prisma from '../../config/prisma';
import mysqlPool from '../../config/mysql';

// ─── Sectors ─────────────────────────────────────────────────────────────────

export async function findAllSectors(onlyActive = true) {
  return prisma.hubSector.findMany({
    where: onlyActive ? { is_active: true } : undefined,
    orderBy: { name: 'asc' },
  });
}

export async function findSectorById(id: string) {
  return prisma.hubSector.findUnique({ where: { id } });
}

export async function findSectorBySlug(slug: string) {
  return prisma.hubSector.findUnique({ where: { slug } });
}

export async function createSector(data: {
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  description?: string;
}) {
  return prisma.hubSector.create({ data });
}

export async function updateSector(id: string, data: Partial<{
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  is_active: boolean;
}>) {
  return prisma.hubSector.update({ where: { id }, data });
}

// ─── Dashboards ──────────────────────────────────────────────────────────────

export async function findDashboardById(id: string) {
  return prisma.hubDashboard.findUnique({
    where: { id },
    include: {
      sector: true,
      sharedSectors: { include: { sector: true } },
    },
  });
}

export async function findAllDashboards() {
  return prisma.hubDashboard.findMany({
    where: { status: { not: 'archived' } },
    include: {
      sector: true,
      sharedSectors: { include: { sector: true } },
    },
    orderBy: { title: 'asc' },
  });
}

export async function findDashboardsForUser(ixcUserId: string) {
  const accesses = await prisma.hubUserAccess.findMany({
    where: { ixc_user_id: ixcUserId },
  });

  const sectorIds = accesses.filter(a => a.sector_id).map(a => a.sector_id!);
  const dashboardIds = accesses.filter(a => a.dashboard_id).map(a => a.dashboard_id!);

  return prisma.hubDashboard.findMany({
    where: {
      status: { not: 'archived' },
      OR: [
        ...(dashboardIds.length ? [{ id: { in: dashboardIds } }] : []),
        ...(sectorIds.length ? [{ sector_id: { in: sectorIds } }] : []),
        ...(sectorIds.length ? [{
          sharedSectors: { some: { sector_id: { in: sectorIds } } },
        }] : []),
      ],
    },
    include: {
      sector: true,
      sharedSectors: { include: { sector: true } },
    },
    orderBy: { title: 'asc' },
  });
}

export async function createDashboard(data: {
  title: string;
  description?: string;
  type: string;
  url: string;
  status?: string;
  embed_mode?: string;
  thumbnail_url?: string;
  business_rules?: string;
  data_sources?: string;
  owner_tech?: string;
  refresh_frequency?: string;
  sector_id?: string;
}) {
  return prisma.hubDashboard.create({ data });
}

export async function updateDashboard(id: string, data: Partial<{
  title: string;
  description: string;
  type: string;
  url: string;
  status: string;
  embed_mode: string;
  thumbnail_url: string;
  business_rules: string;
  data_sources: string;
  owner_tech: string;
  refresh_frequency: string;
  last_update: Date;
  sector_id: string;
}>) {
  return prisma.hubDashboard.update({ where: { id }, data });
}

export async function archiveDashboard(id: string) {
  return prisma.hubDashboard.update({ where: { id }, data: { status: 'archived' } });
}

export async function getSharedSectorIds(dashboardId: string): Promise<string[]> {
  const rows = await prisma.hubDashboardSharedSector.findMany({
    where: { dashboard_id: dashboardId },
    select: { sector_id: true },
  });
  return rows.map(r => r.sector_id);
}

export async function setSharedSectors(dashboardId: string, sectorIds: string[]) {
  await prisma.hubDashboardSharedSector.deleteMany({ where: { dashboard_id: dashboardId } });
  if (sectorIds.length === 0) return;
  await prisma.hubDashboardSharedSector.createMany({
    data: sectorIds.map(sector_id => ({ dashboard_id: dashboardId, sector_id })),
  });
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export async function findAllPermissions() {
  return prisma.hubUserAccess.findMany({
    include: {
      sector: { select: { id: true, name: true, color: true } },
      dashboard: { select: { id: true, title: true } },
    },
    orderBy: { ixc_user_nome: 'asc' },
  });
}

export async function findPermissionsForUser(ixcUserId: string) {
  return prisma.hubUserAccess.findMany({
    where: { ixc_user_id: ixcUserId },
    include: {
      sector: { select: { id: true, name: true, color: true } },
      dashboard: { select: { id: true, title: true } },
    },
  });
}

export async function grantPermission(data: {
  ixc_user_id: string;
  ixc_user_nome: string;
  sector_id?: string;
  dashboard_id?: string;
  created_by: string;
}) {
  return prisma.hubUserAccess.create({ data });
}

export async function revokePermission(id: string) {
  return prisma.hubUserAccess.delete({ where: { id } });
}

// ─── Access Logs ─────────────────────────────────────────────────────────────

export async function createAccessLog(data: {
  ixc_user_id: string;
  ixc_username: string;
  action: string;
  detail?: string;
  ip_address?: string;
  dashboard_id?: string;
}) {
  return prisma.hubAccessLog.create({ data }).catch(() => {
    // Log nunca deve quebrar a operação principal
  });
}

export async function findAccessLogs(filters: {
  ixc_user_id?: string;
  username?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  per_page: number;
}) {
  const where: Record<string, unknown> = {};

  if (filters.ixc_user_id) where.ixc_user_id = filters.ixc_user_id;
  if (filters.username)    where.ixc_username = { contains: filters.username, mode: 'insensitive' };
  if (filters.action)      where.action = filters.action.toUpperCase();

  const dateFilter: Record<string, Date> = {};
  if (filters.date_from) dateFilter.gte = new Date(filters.date_from);
  if (filters.date_to)   dateFilter.lte = new Date(filters.date_to);
  if (Object.keys(dateFilter).length) where.created_at = dateFilter;

  const perPage = Math.min(Math.max(filters.per_page, 1), 200);
  const skip    = (filters.page - 1) * perPage;

  const [total, items] = await Promise.all([
    prisma.hubAccessLog.count({ where }),
    prisma.hubAccessLog.findMany({
      where,
      include: { dashboard: { select: { id: true, title: true } } },
      orderBy: { created_at: 'desc' },
      skip,
      take: perPage,
    }),
  ]);

  return { total, page: filters.page, per_page: perPage, pages: Math.ceil(total / perPage), items };
}

export async function findAnalytics(days: number, ixcUserId?: string) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const userWhere = ixcUserId ? { ixc_user_id: ixcUserId } : {};

  const [totalViews, totalLogins, viewLogs, allDashboards] = await Promise.all([
    prisma.hubAccessLog.count({ where: { action: 'VIEW_DASHBOARD', created_at: { gte: cutoff }, ...userWhere } }),
    prisma.hubAccessLog.count({ where: { action: 'LOGIN', created_at: { gte: cutoff }, ...userWhere } }),
    prisma.hubAccessLog.findMany({
      where: { action: 'VIEW_DASHBOARD', created_at: { gte: cutoff }, dashboard_id: { not: null }, ...userWhere },
      select: { dashboard_id: true, ixc_user_id: true, created_at: true },
    }),
    prisma.hubDashboard.findMany({
      where: { status: { not: 'archived' } },
      select: { id: true, title: true, sector: { select: { name: true, color: true } } },
    }),
  ]);

  const dashCounts: Record<string, number> = {};
  const uniqueUsers = new Set<string>();
  const hourCounts: number[] = Array(24).fill(0);

  for (const log of viewLogs) {
    if (log.dashboard_id) dashCounts[log.dashboard_id] = (dashCounts[log.dashboard_id] ?? 0) + 1;
    uniqueUsers.add(log.ixc_user_id);
    const h = (log.created_at.getUTCHours() - 3 + 24) % 24; // UTC → Brasília (UTC-3)
    hourCounts[h]++;
  }

  const dashMap = Object.fromEntries(allDashboards.map(d => [d.id, d]));
  const accessed = Object.entries(dashCounts)
    .map(([id, count]) => ({ id, title: dashMap[id]?.title ?? `Painel #${id}`, count, sector: dashMap[id]?.sector?.name ?? '—', sector_color: dashMap[id]?.sector?.color ?? '#888' }))
    .sort((a, b) => b.count - a.count);

  const accessedIds = new Set(Object.keys(dashCounts));
  const neverAccessed = allDashboards
    .filter(d => !accessedIds.has(d.id))
    .map(d => ({ id: d.id, title: d.title, sector: d.sector?.name ?? '—', sector_color: d.sector?.color ?? '#888' }));

  return {
    total_views: totalViews,
    total_logins: totalLogins,
    unique_users: uniqueUsers.size,
    top_dashboards: accessed.slice(0, 10),
    bottom_dashboards: accessed.slice(-10).reverse(),
    never_accessed: neverAccessed,
    hours_chart: hourCounts,
  };
}

// ─── IXC Users (MySQL) ───────────────────────────────────────────────────────

export async function searchIxcUsers(query: string): Promise<{ id: string; nome: string; email: string; id_grupo: number }[]> {
  const like = `%${query}%`;
  const [rows] = await mysqlPool.execute<any[]>(
    `SELECT id, nome, email, id_grupo
     FROM usuarios
     WHERE status = 'A'
       AND (nome LIKE ? OR email LIKE ?)
     ORDER BY nome
     LIMIT 30`,
    [like, like],
  );
  return rows.map(r => ({ id: String(r.id), nome: r.nome, email: r.email, id_grupo: r.id_grupo }));
}

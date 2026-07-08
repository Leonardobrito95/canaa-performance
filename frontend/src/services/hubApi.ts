import axios from 'axios';

export interface HubSector {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description?: string;
  is_active: boolean;
}

export interface HubDashboard {
  id: string;
  title: string;
  description?: string;
  type: 'internal' | 'powerbi' | 'link';
  url: string;
  status: 'active' | 'maintenance' | 'error' | 'archived';
  embed_mode: 'newtab' | 'iframe';
  thumbnail_url?: string;
  business_rules?: string;
  data_sources?: string;
  owner_tech?: string;
  refresh_frequency?: string;
  last_update?: string;
  sector_id?: string;
  sector?: HubSector;
  sharedSectors?: { sector_id: string; sector: HubSector }[];
}

export interface HubPermission {
  id: string;
  ixc_user_id: string;
  ixc_user_nome: string;
  sector_id?: string;
  dashboard_id?: string;
  created_at: string;
  sector?: { id: string; name: string; color: string };
  dashboard?: { id: string; title: string };
}

export interface HubAccessLog {
  id: string;
  ixc_user_id: string;
  ixc_username: string;
  action: string;
  detail?: string;
  ip_address?: string;
  created_at: string;
  dashboard?: { id: string; title: string };
}

export interface HubAnalytics {
  total_views: number;
  total_logins: number;
  unique_users: number;
  top_dashboards: { id: string; title: string; count: number; sector: string; sector_color: string }[];
  bottom_dashboards: { id: string; title: string; count: number; sector: string; sector_color: string }[];
  never_accessed: { id: string; title: string; sector: string; sector_color: string }[];
  hours_chart: number[];
}

const api = axios.create({ baseURL: '/bdr/api/v1/hub' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('bdr_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('bdr_token');
      window.location.reload();
    }
    return Promise.reject(err);
  },
);

// ── Sectors ──────────────────────────────────────────────────────────────────
export const getSectors        = ()           => api.get<HubSector[]>('/sectors').then(r => r.data);
export const createSector      = (d: Partial<HubSector>) => api.post<HubSector>('/sectors', d).then(r => r.data);
export const updateSector      = (id: string, d: Partial<HubSector>) => api.put<HubSector>(`/sectors/${id}`, d).then(r => r.data);
export const deleteSector      = (id: string) => api.delete(`/sectors/${id}`).then(r => r.data);

// ── Dashboards ────────────────────────────────────────────────────────────────
export interface PowerBIEmbedData {
  embedUrl:   string;
  embedToken: string;
  reportId:   string;
  expiry:     string;
}

export const getDashboards     = ()           => api.get<HubDashboard[]>('/dashboards').then(r => r.data);
export const getDashboard      = (id: string) => api.get<HubDashboard>(`/dashboards/${id}`).then(r => r.data);
export const getEmbedToken     = (id: string) => api.get<PowerBIEmbedData>(`/dashboards/${id}/embed-token`).then(r => r.data);
export const exportDashboard   = (id: string) => api.get(`/dashboards/${id}/export`, { responseType: 'blob', timeout: 120_000 }).then(r => r.data as Blob);
export const logDashboardView  = (id: string) => api.post(`/dashboards/${id}/view`).catch(() => {});
export const createDashboard   = (d: Partial<HubDashboard>) => api.post<HubDashboard>('/dashboards', d).then(r => r.data);
export const updateDashboard   = (id: string, d: Partial<HubDashboard>) => api.put<HubDashboard>(`/dashboards/${id}`, d).then(r => r.data);
export const archiveDashboard  = (id: string) => api.delete(`/dashboards/${id}`).then(r => r.data);
export const updateThumbnail   = (id: string, d: { thumbnail_url?: string; embed_mode?: string }) => api.patch(`/dashboards/${id}/thumbnail`, d).then(r => r.data);
export const getSharedSectors  = (id: string) => api.get<string[]>(`/dashboards/${id}/shared-sectors`).then(r => r.data);
export const updateSharedSectors = (id: string, sectorIds: string[]) => api.put(`/dashboards/${id}/shared-sectors`, { sector_ids: sectorIds }).then(r => r.data);

export function uploadThumbnail(id: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.post<{ thumbnail_url: string }>(`/dashboards/${id}/thumbnail/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
}

// ── Permissions ───────────────────────────────────────────────────────────────
export const getPermissions    = ()           => api.get<HubPermission[]>('/permissions').then(r => r.data);
export const grantPermission   = (d: { ixc_user_id: string; ixc_user_nome: string; sector_id?: string; dashboard_id?: string }) => api.post<HubPermission>('/permissions', d).then(r => r.data);
export const revokePermission  = (id: string) => api.delete(`/permissions/${id}`).then(r => r.data);
export const searchIxcUsers    = (query: string) => api.get<{ id: string; nome: string; email: string; id_grupo: number }[]>('/users/search', { params: { q: query } }).then(r => r.data);

// ── Logs & Analytics ──────────────────────────────────────────────────────────
export const getAccessLogs = (params: { username?: string; action?: string; date_from?: string; date_to?: string; page?: number; per_page?: number }) =>
  api.get<{ total: number; page: number; per_page: number; pages: number; items: HubAccessLog[] }>('/logs', { params }).then(r => r.data);

// Log de "abri este módulo" (Vendas, Comissões, OTDR, etc) — fire-and-forget,
// não deve travar a navegação do usuário se falhar.
export const logModuleView = (action: string, detail?: string) =>
  api.post('/logs/view', { action, detail }).catch(() => {});

export const getAnalytics = (days: number, userId?: string) =>
  api.get<HubAnalytics>('/analytics', { params: { days, user_id: userId } }).then(r => r.data);

<template>
  <div class="admin-view">
    <div class="view-header">
      <div>
        <h1 class="view-title">Administração — Hub</h1>
        <p class="view-sub">Gerencie setores, dashboards, permissões e logs.</p>
      </div>
    </div>

    <!-- Admin tabs -->
    <div class="admin-tabs">
      <button v-for="t in TABS" :key="t.id" :class="['admin-tab', { active: adminTab === t.id }]" @click="adminTab = t.id; loadTab(t.id)">
        {{ t.label }}
      </button>
    </div>

    <!-- ── SETORES ── -->
    <div v-if="adminTab === 'sectors'" class="tab-pane">
      <div class="tab-toolbar">
        <button class="btn-add" @click="openSectorModal()">+ Novo Setor</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Nome</th><th>Slug</th><th>Ícone</th><th>Cor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in sectors" :key="s.id">
              <td>{{ s.name }}</td>
              <td class="td-mono">{{ s.slug }}</td>
              <td><i :class="`fa-solid ${s.icon}`" :style="`color: ${s.color}`"></i></td>
              <td><span class="color-swatch" :style="`background: ${s.color}`"></span> {{ s.color }}</td>
              <td><span :class="['pill', s.is_active ? 'pill-ok' : 'pill-off']">{{ s.is_active ? 'Ativo' : 'Inativo' }}</span></td>
              <td class="actions-cell">
                <button class="btn-icon" @click="openSectorModal(s)" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon danger" @click="deactivateSector(s)" title="Desativar"><i class="fa-solid fa-ban"></i></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── DASHBOARDS ── -->
    <div v-if="adminTab === 'dashboards'" class="tab-pane">
      <div class="tab-toolbar">
        <button class="btn-add" @click="openDashModal()">+ Novo Dashboard</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Título</th><th>Setor</th><th>Tipo</th><th>Status</th><th>Modo</th><th></th></tr></thead>
          <tbody>
            <tr v-for="d in dashboards" :key="d.id">
              <td>{{ d.title }}</td>
              <td>
                <span v-if="d.sector" class="dash-sector-tag" :style="`color:${d.sector.color};background:${d.sector.color}18;border-color:${d.sector.color}44`">
                  {{ d.sector.name }}
                </span>
                <span v-else class="td-mono">—</span>
              </td>
              <td><span class="type-tag" :class="d.type">{{ d.type === 'powerbi' ? 'Power BI' : d.type === 'internal' ? 'Interno' : 'Link' }}</span></td>
              <td><span :class="['pill', statusPillClass(d.status)]">{{ statusLabel(d.status) }}</span></td>
              <td class="td-mono">{{ d.embed_mode }}</td>
              <td class="actions-cell">
                <button class="btn-icon" @click="openDashModal(d)" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon" @click="openSharedModal(d)" title="Setores compartilhados"><i class="fa-solid fa-share-nodes"></i></button>
                <button class="btn-icon" @click="openThumbModal(d)" title="Thumbnail"><i class="fa-solid fa-image"></i></button>
                <button class="btn-icon danger" @click="doArchive(d)" title="Arquivar"><i class="fa-solid fa-archive"></i></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── PERMISSÕES ── -->
    <div v-if="adminTab === 'permissions'" class="tab-pane">
      <div class="perm-layout">
        <!-- Search & grant -->
        <div class="perm-search-panel">
          <p class="perm-panel-title">Buscar usuário IXC</p>
          <input v-model="userQuery" @input="debouncedSearch" type="text" placeholder="Nome ou e-mail..." />
          <div v-if="ixcResults.length" class="ixc-results">
            <div v-for="u in ixcResults" :key="u.id" class="ixc-user-row" @click="selectIxcUser(u)">
              <span class="ixc-nome">{{ u.nome }}</span>
              <span class="ixc-email">{{ u.email }}</span>
            </div>
          </div>
          <div v-if="selectedIxcUser" class="grant-panel">
            <p class="grant-user">Conceder acesso a: <strong>{{ selectedIxcUser.nome }}</strong></p>
            <div class="grant-row">
              <select v-model="grantType">
                <option value="all">Todos os setores</option>
                <option value="sector">Setor específico</option>
                <option value="dashboard">Dashboard</option>
              </select>
              <select v-if="grantType === 'sector'" v-model="grantTargetId">
                <option value="">Selecione...</option>
                <option v-for="s in sectors" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <select v-else-if="grantType === 'dashboard'" v-model="grantTargetId">
                <option value="">Selecione...</option>
                <option v-for="d in dashboards" :key="d.id" :value="d.id">{{ d.title }}</option>
              </select>
              <span v-else class="grant-all-label">Acesso a {{ sectors.length }} setores</span>
              <button class="btn-add" @click="doGrant" :disabled="grantType !== 'all' && !grantTargetId">Conceder</button>
            </div>
          </div>
        </div>

        <!-- Current permissions -->
        <div class="perm-list-panel">
          <p class="perm-panel-title">Permissões concedidas</p>
          <div v-if="permLoading" class="state-msg">Carregando...</div>
          <div v-else-if="groupedPerms.length === 0" class="state-msg">Nenhuma permissão cadastrada.</div>
          <div v-for="group in groupedPerms" :key="group.userId" class="perm-group">
            <div class="perm-group-header">
              <span class="perm-username">{{ group.nome }}</span>
              <span class="perm-count">{{ group.perms.length }} acesso(s)</span>
            </div>
            <div v-for="p in group.perms" :key="p.id" class="perm-row">
              <span v-if="p.sector" class="perm-target sector">
                <i class="fa-solid fa-folder"></i> {{ p.sector.name }}
              </span>
              <span v-else-if="p.dashboard" class="perm-target dashboard">
                <i class="fa-solid fa-chart-bar"></i> {{ p.dashboard.title }}
              </span>
              <button class="btn-icon danger sm" @click="doRevoke(p.id)" title="Revogar"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── LOGS ── -->
    <div v-if="adminTab === 'logs'" class="tab-pane">
      <div class="filter-bar">
        <div class="filter-group">
          <span class="filter-label">Usuário</span>
          <input v-model="logFilters.username" placeholder="Nome..." @change="loadLogs" />
        </div>
        <div class="filter-group">
          <span class="filter-label">Ação</span>
          <select v-model="logFilters.action" @change="loadLogs">
            <option value="">Todas</option>
            <option v-for="a in LOG_ACTIONS" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
        <div class="filter-group">
          <span class="filter-label">De</span>
          <input type="date" v-model="logFilters.date_from" @change="loadLogs" />
        </div>
        <div class="filter-group">
          <span class="filter-label">Até</span>
          <input type="date" v-model="logFilters.date_to" @change="loadLogs" />
        </div>
        <button class="btn-filter-clear" @click="clearLogs">Limpar</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Detalhe</th><th>IP</th></tr></thead>
          <tbody>
            <tr v-if="logData.items.length === 0"><td colspan="5" class="state-msg">Nenhum log encontrado.</td></tr>
            <tr v-for="l in logData.items" :key="l.id">
              <td class="td-mono td-date">{{ fmtDate(l.created_at) }}</td>
              <td>{{ l.ixc_username }}</td>
              <td><span class="action-tag">{{ l.action }}</span></td>
              <td class="td-detail">{{ l.dashboard?.title ?? l.detail ?? '—' }}</td>
              <td class="td-mono">{{ l.ip_address ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="logData.pages > 1" class="pagination">
        <button class="btn-page" :disabled="logPage === 1" @click="logPage--; loadLogs()">‹</button>
        <span class="page-info">{{ logPage }} / {{ logData.pages }}</span>
        <button class="btn-page" :disabled="logPage >= logData.pages" @click="logPage++; loadLogs()">›</button>
      </div>
    </div>

    <!-- ── ANALYTICS ── -->
    <div v-if="adminTab === 'analytics'" class="tab-pane">
      <div class="analytics-toolbar">
        <span class="filter-label">Período</span>
        <div class="period-btns">
          <button v-for="p in PERIODS" :key="p.v" :class="['period-btn', { active: analyticsDays === p.v }]" @click="analyticsDays = p.v; loadAnalytics()">{{ p.l }}</button>
        </div>
      </div>
      <div v-if="analytics">
        <!-- KPI cards -->
        <div class="kpi-row">
          <div class="kpi-card"><span class="kpi-label">Visualizações</span><span class="kpi-value">{{ analytics.total_views }}</span></div>
          <div class="kpi-card"><span class="kpi-label">Logins</span><span class="kpi-value">{{ analytics.total_logins }}</span></div>
          <div class="kpi-card"><span class="kpi-label">Usuários únicos</span><span class="kpi-value">{{ analytics.unique_users }}</span></div>
        </div>

        <!-- Lists -->
        <div class="analytics-grid">
          <div class="analytics-panel">
            <p class="analytics-panel-title">Top 10 mais acessados</p>
            <div v-if="analytics.top_dashboards.length === 0" class="state-msg">Nenhum dado.</div>
            <div v-for="(d, i) in analytics.top_dashboards" :key="d.id" class="rank-row">
              <span class="rank-pos">{{ i + 1 }}</span>
              <div class="rank-info">
                <span class="rank-title">{{ d.title }}</span>
                <span class="rank-sector" :style="`color: ${d.sector_color}`">{{ d.sector }}</span>
              </div>
              <span class="rank-count">{{ d.count }}</span>
            </div>
          </div>

          <div class="analytics-panel">
            <p class="analytics-panel-title">Nunca acessados</p>
            <div v-if="analytics.never_accessed.length === 0" class="state-msg">Todos os dashboards foram acessados!</div>
            <div v-for="d in analytics.never_accessed" :key="d.id" class="rank-row">
              <span class="rank-pos never">—</span>
              <div class="rank-info">
                <span class="rank-title">{{ d.title }}</span>
                <span class="rank-sector" :style="`color: ${d.sector_color}`">{{ d.sector }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Hours chart -->
        <div class="analytics-panel hours-chart-panel">
          <p class="analytics-panel-title">Acessos por hora do dia</p>
          <div class="hours-chart">
            <div v-for="(v, h) in analytics.hours_chart" :key="h" class="hour-col">
              <span class="hour-count">{{ v || '' }}</span>
              <div class="hour-bar-wrap">
                <div class="hour-bar" :style="`height: ${maxHour > 0 ? Math.round((v / maxHour) * 100) : 0}%`"></div>
              </div>
              <span class="hour-label">{{ String(h).padStart(2,'0') }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="state-msg">Carregando analytics...</div>
    </div>

    <!-- ── MODAL: Setor ── -->
    <Teleport to="body">
      <div v-if="sectorModal" class="modal-overlay" @click.self="sectorModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <h3>{{ editSector?.id ? 'Editar Setor' : 'Novo Setor' }}</h3>
            <button class="modal-close" @click="sectorModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group"><label class="form-label">Nome</label><input v-model="sectorForm.name" @input="autoSlug" /></div>
            <div class="form-group"><label class="form-label">Slug</label><input v-model="sectorForm.slug" /></div>
            <div class="form-group"><label class="form-label">Ícone (FontAwesome)</label><input v-model="sectorForm.icon" placeholder="fa-chart-bar" /></div>
            <div class="form-group"><label class="form-label">Cor</label><input v-model="sectorForm.color" type="color" style="height: 36px; padding: 2px 4px;" /></div>
            <div class="form-group"><label class="form-label">Descrição</label><input v-model="sectorForm.description" /></div>
            <div class="form-group"><label class="form-label">
              <input type="checkbox" v-model="sectorForm.is_active" style="width:auto; margin-right: .4rem;" /> Ativo
            </label></div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="sectorModal = false">Cancelar</button>
            <button class="btn-primary" @click="saveSector" :disabled="modalSaving">{{ modalSaving ? 'Salvando...' : 'Salvar' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── MODAL: Dashboard ── -->
    <Teleport to="body">
      <div v-if="dashModal" class="modal-overlay" @click.self="dashModal = false">
        <div class="modal-box modal-lg">
          <div class="modal-header">
            <h3>{{ editDash?.id ? 'Editar Dashboard' : 'Novo Dashboard' }}</h3>
            <button class="modal-close" @click="dashModal = false">×</button>
          </div>
          <div class="modal-body modal-grid">
            <div class="form-group"><label class="form-label">Título</label><input v-model="dashForm.title" /></div>
            <div class="form-group"><label class="form-label">Setor</label>
              <select v-model="dashForm.sector_id">
                <option value="">Sem setor</option>
                <option v-for="s in sectors" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div class="form-group span2"><label class="form-label">URL</label><input v-model="dashForm.url" /></div>
            <div class="form-group"><label class="form-label">Tipo</label>
              <select v-model="dashForm.type">
                <option value="powerbi">Power BI</option>
                <option value="internal">Interno</option>
                <option value="link">Link</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Modo de abertura</label>
              <select v-model="dashForm.embed_mode">
                <option value="iframe">Incorporado (iframe)</option>
                <option value="newtab">Nova aba</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Status</label>
              <select v-model="dashForm.status">
                <option value="active">Ativo</option>
                <option value="maintenance">Manutenção</option>
                <option value="error">Erro</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Responsável técnico</label><input v-model="dashForm.owner_tech" /></div>
            <div class="form-group span2"><label class="form-label">Descrição</label><input v-model="dashForm.description" /></div>
            <div class="form-group span2"><label class="form-label">Regras de negócio</label><input v-model="dashForm.business_rules" /></div>
            <div class="form-group span2"><label class="form-label">Fontes de dados</label><input v-model="dashForm.data_sources" /></div>
            <div class="form-group"><label class="form-label">Frequência de atualização</label><input v-model="dashForm.refresh_frequency" placeholder="Ex: Diário" /></div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="dashModal = false">Cancelar</button>
            <button class="btn-primary" @click="saveDash" :disabled="modalSaving">{{ modalSaving ? 'Salvando...' : 'Salvar' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── MODAL: Setores compartilhados ── -->
    <Teleport to="body">
      <div v-if="sharedModal" class="modal-overlay" @click.self="sharedModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <h3>Setores compartilhados</h3>
            <button class="modal-close" @click="sharedModal = false">×</button>
          </div>
          <div class="modal-body">
            <p style="font-size:.82rem; color: var(--text-2); margin-bottom:.75rem;">{{ editDash?.title }}</p>
            <div v-for="s in sectors.filter(s => s.id !== editDash?.sector_id)" :key="s.id" class="check-row">
              <label>
                <input type="checkbox" :value="s.id" v-model="sharedSectorIds" style="width:auto;margin-right:.5rem;" />
                <span :style="`color: ${s.color}`"><i :class="`fa-solid ${s.icon}`"></i></span>
                {{ s.name }}
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="sharedModal = false">Cancelar</button>
            <button class="btn-primary" @click="saveShared">Salvar</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── MODAL: Thumbnail ── -->
    <Teleport to="body">
      <div v-if="thumbModal" class="modal-overlay" @click.self="thumbModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <h3>Thumbnail — {{ editDash?.title }}</h3>
            <button class="modal-close" @click="thumbModal = false">×</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:.75rem;">
            <div v-if="editDash?.thumbnail_url" class="thumb-preview">
              <img :src="editDash.thumbnail_url" alt="thumbnail" />
            </div>
            <div class="form-group"><label class="form-label">URL da imagem</label><input v-model="thumbUrl" placeholder="https://..." /></div>
            <div class="form-group"><label class="form-label">Ou fazer upload</label>
              <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif" @change="onThumbFile" style="padding:.4rem;" />
            </div>
            <div class="form-group">
              <label class="form-label">Modo de abertura</label>
              <select v-model="thumbEmbedMode">
                <option value="iframe">Incorporado (iframe)</option>
                <option value="newtab">Nova aba</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="thumbModal = false">Cancelar</button>
            <button class="btn-primary" @click="saveThumb">Salvar</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  getSectors, createSector, updateSector,
  getDashboards, createDashboard, updateDashboard, archiveDashboard,
  updateThumbnail, uploadThumbnail as uploadThumbApi, getSharedSectors, updateSharedSectors,
  getPermissions, grantPermission, revokePermission, searchIxcUsers,
  getAccessLogs, getAnalytics,
} from '../../services/hubApi';
import type { HubSector, HubDashboard, HubPermission, HubAccessLog, HubAnalytics } from '../../services/hubApi';

const TABS = [
  { id: 'sectors',     label: 'Setores' },
  { id: 'dashboards',  label: 'Dashboards' },
  { id: 'permissions', label: 'Permissões' },
  { id: 'logs',        label: 'Logs' },
  { id: 'analytics',  label: 'Analytics' },
];
const LOG_ACTIONS = ['LOGIN','VIEW_DASHBOARD','CREATE_SECTOR','UPDATE_SECTOR','DELETE_SECTOR','CREATE_DASHBOARD','UPDATE_DASHBOARD','ARCHIVE_DASHBOARD','GRANT_PERMISSION','REVOKE_PERMISSION','VIEW_VENDAS','VIEW_COMISSAO','VIEW_CAMPO','VIEW_REGISTRO_BDR','VIEW_BDR_DASHBOARD','VIEW_RETENCAO','VIEW_DIAGNOSTICO','VIEW_HUB','VIEW_HUB_ADMIN','VIEW_SALA_REUNIAO','VIEW_OTDR'];
const PERIODS = [{v:7,l:'7d'},{v:30,l:'30d'},{v:90,l:'90d'}];

const adminTab   = ref('sectors');
const sectors    = ref<HubSector[]>([]);
const dashboards = ref<HubDashboard[]>([]);
const modalSaving = ref(false);

// ── Sector modal ──
const sectorModal = ref(false);
const editSector  = ref<HubSector | null>(null);
const sectorForm  = ref({ name: '', slug: '', icon: 'fa-chart-bar', color: '#002F4D', description: '', is_active: true });

function openSectorModal(s?: HubSector) {
  editSector.value = s ?? null;
  if (s) { sectorForm.value = { name: s.name, slug: s.slug, icon: s.icon, color: s.color, description: s.description ?? '', is_active: s.is_active }; }
  else   { sectorForm.value = { name: '', slug: '', icon: 'fa-chart-bar', color: '#002F4D', description: '', is_active: true }; }
  sectorModal.value = true;
}
function autoSlug() {
  sectorForm.value.slug = sectorForm.value.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
async function saveSector() {
  modalSaving.value = true;
  try {
    if (editSector.value?.id) await updateSector(editSector.value.id, sectorForm.value);
    else await createSector(sectorForm.value);
    sectors.value = await getSectors();
    sectorModal.value = false;
  } finally { modalSaving.value = false; }
}
async function deactivateSector(s: HubSector) {
  if (!confirm(`Desativar o setor "${s.name}"?`)) return;
  await updateSector(s.id, { is_active: false });
  sectors.value = await getSectors();
}

// ── Dashboard modal ──
const dashModal = ref(false);
const editDash  = ref<HubDashboard | null>(null);
const dashForm  = ref<{ title: string; description: string; type: 'internal' | 'powerbi' | 'link'; url: string; status: 'active' | 'maintenance' | 'error' | 'archived'; embed_mode: 'iframe' | 'newtab'; business_rules: string; data_sources: string; owner_tech: string; refresh_frequency: string; sector_id: string }>({ title: '', description: '', type: 'powerbi', url: '', status: 'active', embed_mode: 'newtab', business_rules: '', data_sources: '', owner_tech: '', refresh_frequency: '', sector_id: '' });

function openDashModal(d?: HubDashboard) {
  editDash.value = d ?? null;
  if (d) { dashForm.value = { title: d.title, description: d.description ?? '', type: d.type, url: d.url, status: d.status, embed_mode: d.embed_mode, business_rules: d.business_rules ?? '', data_sources: d.data_sources ?? '', owner_tech: d.owner_tech ?? '', refresh_frequency: d.refresh_frequency ?? '', sector_id: d.sector_id ?? '' }; }
  else   { dashForm.value = { title: '', description: '', type: 'powerbi', url: '', status: 'active', embed_mode: 'newtab', business_rules: '', data_sources: '', owner_tech: '', refresh_frequency: '', sector_id: '' }; }
  dashModal.value = true;
}
async function saveDash() {
  modalSaving.value = true;
  try {
    const payload = { ...dashForm.value, sector_id: dashForm.value.sector_id || undefined };
    if (editDash.value?.id) await updateDashboard(editDash.value.id, payload);
    else await createDashboard(payload);
    dashboards.value = await getDashboards();
    dashModal.value = false;
  } finally { modalSaving.value = false; }
}
async function doArchive(d: HubDashboard) {
  if (!confirm(`Arquivar "${d.title}"?`)) return;
  await archiveDashboard(d.id);
  dashboards.value = dashboards.value.filter(x => x.id !== d.id);
}

// ── Shared sectors modal ──
const sharedModal    = ref(false);
const sharedSectorIds = ref<string[]>([]);

async function openSharedModal(d: HubDashboard) {
  editDash.value = d;
  sharedSectorIds.value = await getSharedSectors(d.id);
  sharedModal.value = true;
}
async function saveShared() {
  await updateSharedSectors(editDash.value!.id, sharedSectorIds.value);
  sharedModal.value = false;
}

// ── Thumbnail modal ──
const thumbModal    = ref(false);
const thumbUrl      = ref('');
const thumbEmbedMode = ref('newtab');
const thumbFile     = ref<File | null>(null);

function openThumbModal(d: HubDashboard) {
  editDash.value = d;
  thumbUrl.value = d.thumbnail_url ?? '';
  thumbEmbedMode.value = d.embed_mode;
  thumbFile.value = null;
  thumbModal.value = true;
}
function onThumbFile(e: Event) {
  thumbFile.value = (e.target as HTMLInputElement).files?.[0] ?? null;
}
async function saveThumb() {
  const id = editDash.value!.id;
  if (thumbFile.value) { await uploadThumbApi(id, thumbFile.value); }
  else                 { await updateThumbnail(id, { thumbnail_url: thumbUrl.value, embed_mode: thumbEmbedMode.value }); }
  dashboards.value = await getDashboards();
  thumbModal.value = false;
}

// ── Permissions ──
const permissions  = ref<HubPermission[]>([]);
const permLoading  = ref(false);
const userQuery    = ref('');
const ixcResults   = ref<{ id: string; nome: string; email: string; id_grupo: number }[]>([]);
const selectedIxcUser = ref<{ id: string; nome: string } | null>(null);
const grantType    = ref<'all' | 'sector' | 'dashboard'>('sector');
const grantTargetId = ref('');
let searchTimer: ReturnType<typeof setTimeout>;

function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (userQuery.value.length < 2) { ixcResults.value = []; return; }
    ixcResults.value = await searchIxcUsers(userQuery.value);
  }, 350);
}
function selectIxcUser(u: { id: string; nome: string; email: string; id_grupo: number }) {
  selectedIxcUser.value = { id: u.id, nome: u.nome };
  ixcResults.value = [];
  userQuery.value = u.nome;
  grantTargetId.value = '';
}
async function doGrant() {
  if (!selectedIxcUser.value) return;

  if (grantType.value === 'all') {
    // Concede acesso a todos os setores ativos de uma vez
    const activeSectors = sectors.value.filter(s => s.is_active);
    const existingIds = permissions.value
      .filter(p => p.ixc_user_id === selectedIxcUser.value!.id && p.sector_id)
      .map(p => p.sector_id!);
    const toGrant = activeSectors.filter(s => !existingIds.includes(s.id));
    await Promise.all(toGrant.map(s =>
      grantPermission({
        ixc_user_id: selectedIxcUser.value!.id,
        ixc_user_nome: selectedIxcUser.value!.nome,
        sector_id: s.id,
      })
    ));
  } else {
    if (!grantTargetId.value) return;
    await grantPermission({
      ixc_user_id: selectedIxcUser.value.id,
      ixc_user_nome: selectedIxcUser.value.nome,
      sector_id: grantType.value === 'sector' ? grantTargetId.value : undefined,
      dashboard_id: grantType.value === 'dashboard' ? grantTargetId.value : undefined,
    });
  }

  permissions.value = await getPermissions();
  grantTargetId.value = '';
}
async function doRevoke(id: string) {
  await revokePermission(id);
  permissions.value = permissions.value.filter(p => p.id !== id);
}
const groupedPerms = computed(() => {
  const map = new Map<string, { userId: string; nome: string; perms: HubPermission[] }>();
  for (const p of permissions.value) {
    if (!map.has(p.ixc_user_id)) map.set(p.ixc_user_id, { userId: p.ixc_user_id, nome: p.ixc_user_nome, perms: [] });
    map.get(p.ixc_user_id)!.perms.push(p);
  }
  return [...map.values()];
});

// ── Logs ──
const logFilters = ref({ username: '', action: '', date_from: '', date_to: '' });
const logData    = ref<{ total: number; page: number; per_page: number; pages: number; items: HubAccessLog[] }>({ total: 0, page: 1, per_page: 50, pages: 1, items: [] });
const logPage    = ref(1);

async function loadLogs() {
  logData.value = await getAccessLogs({
    ...logFilters.value,
    page: logPage.value,
    per_page: 50,
  });
}
function clearLogs() {
  logFilters.value = { username: '', action: '', date_from: '', date_to: '' };
  logPage.value = 1;
  loadLogs();
}

// ── Analytics ──
const analytics    = ref<HubAnalytics | null>(null);
const analyticsDays = ref(30);
const maxHour = computed(() => Math.max(...(analytics.value?.hours_chart ?? [0])));

async function loadAnalytics() {
  analytics.value = null;
  analytics.value = await getAnalytics(analyticsDays.value);
}

// ── Helpers ──
function statusLabel(s: string) {
  return s === 'active' ? 'Ativo' : s === 'maintenance' ? 'Manutenção' : 'Erro';
}
function statusPillClass(s: string) {
  return s === 'active' ? 'pill-ok' : s === 'maintenance' ? 'pill-warn' : 'pill-err';
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
}

async function loadTab(id: string) {
  if (id === 'sectors') { sectors.value = await getSectors(); }
  else if (id === 'dashboards') { if (!sectors.value.length) sectors.value = await getSectors(); dashboards.value = await getDashboards(); }
  else if (id === 'permissions') { permLoading.value = true; [sectors.value, dashboards.value, permissions.value] = await Promise.all([getSectors(), getDashboards(), getPermissions()]); permLoading.value = false; }
  else if (id === 'logs') { loadLogs(); }
  else if (id === 'analytics') { loadAnalytics(); }
}

onMounted(() => loadTab('sectors'));
</script>

<style scoped>
.admin-view { display: flex; flex-direction: column; gap: 1.25rem; }

/* Admin tabs */
.admin-tabs {
  display: flex; gap: 2px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 3px; width: fit-content;
}
.admin-tab {
  background: none; border: none; color: var(--text-2);
  padding: .45rem 1rem; border-radius: var(--radius-sm);
  cursor: pointer; font-family: var(--font-body); font-size: .8rem;
  font-weight: 600; text-transform: uppercase; letter-spacing: .07em;
  transition: all var(--transition);
}
.admin-tab:hover { color: var(--text); background: var(--surface-3); }
.admin-tab.active { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); }

/* Tab pane */
.tab-pane { display: flex; flex-direction: column; gap: .75rem; }
.tab-toolbar { display: flex; justify-content: flex-end; }

/* Buttons */
.btn-add {
  background: var(--accent); color: #000; border: none; border-radius: var(--radius-sm);
  padding: .5rem 1.1rem; font-size: .82rem; font-weight: 700; font-family: var(--font-body);
  cursor: pointer; transition: background var(--transition);
}
.btn-add:hover { background: var(--accent-2); }
.btn-add:disabled { opacity: .4; cursor: not-allowed; }
.btn-icon {
  background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
  width: 28px; height: 28px; border-radius: var(--radius-sm);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: .75rem; transition: all var(--transition);
}
.btn-icon:hover { color: var(--text); border-color: var(--border-2); }
.btn-icon.danger:hover { color: var(--error); border-color: rgba(255,42,95,.3); background: var(--error-bg); }
.btn-icon.sm { width: 22px; height: 22px; font-size: .65rem; }

.actions-cell { display: flex; gap: .3rem; }

/* Pills */
.pill { font-size: .65rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: .15rem .5rem; border-radius: 10px; }
.pill-ok  { background: var(--success-bg); color: var(--success); }
.pill-off { background: var(--surface-3); color: var(--text-3); }
.pill-warn{ background: rgba(234,179,8,.1); color: #eab308; }
.pill-err { background: var(--error-bg); color: var(--error); }

/* Color swatch */
.color-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: middle; margin-right: .3rem; border: 1px solid rgba(255,255,255,.15); }

/* Action tag */
.action-tag { font-family: var(--font-mono); font-size: .72rem; color: var(--accent); background: var(--accent-dim); padding: .15rem .45rem; border-radius: 3px; }

.td-detail { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8rem; color: var(--text-2); }

/* Pagination */
.pagination { display: flex; align-items: center; gap: .75rem; justify-content: center; padding: .5rem; }
.btn-page { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); border-radius: var(--radius-sm); width: 28px; height: 28px; cursor: pointer; transition: all var(--transition); }
.btn-page:hover:not(:disabled) { color: var(--text); }
.btn-page:disabled { opacity: .35; cursor: not-allowed; }
.page-info { font-size: .82rem; color: var(--text-2); font-family: var(--font-mono); }

/* Permissions */
.perm-layout { display: grid; grid-template-columns: 320px 1fr; gap: 1rem; }
.perm-search-panel, .perm-list-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; display: flex; flex-direction: column; gap: .75rem; }
.perm-panel-title { font-size: .72rem; font-weight: 700; color: var(--text-2); text-transform: uppercase; letter-spacing: .1em; }
.ixc-results { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
.ixc-user-row { padding: .5rem .75rem; cursor: pointer; transition: background var(--transition); display: flex; flex-direction: column; gap: .1rem; }
.ixc-user-row:hover { background: var(--surface-3); }
.ixc-nome { font-size: .85rem; color: var(--text); }
.ixc-email { font-size: .72rem; color: var(--text-2); font-family: var(--font-mono); }
.grant-panel { display: flex; flex-direction: column; gap: .5rem; padding: .75rem; background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-sm); }
.grant-user { font-size: .82rem; color: var(--text-2); } .grant-user strong { color: var(--accent); }
.grant-row { display: flex; gap: .5rem; flex-wrap: wrap; }
.grant-row select { flex: 1; font-size: .82rem; }
.grant-all-label { flex: 1; display: flex; align-items: center; padding: 0 .75rem; font-size: .82rem; color: var(--accent); font-weight: 600; background: var(--accent-dim); border: 1px solid rgba(0,240,255,.2); border-radius: var(--radius-sm); }
.perm-group { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
.perm-group-header { padding: .5rem .75rem; background: var(--surface-3); display: flex; justify-content: space-between; align-items: center; }
.perm-username { font-size: .85rem; font-weight: 600; color: var(--text); }
.perm-count { font-size: .72rem; color: var(--text-2); }
.perm-row { display: flex; align-items: center; gap: .5rem; padding: .4rem .75rem; border-top: 1px solid var(--border); }
.perm-target { flex: 1; font-size: .82rem; display: flex; align-items: center; gap: .4rem; }
.perm-target.sector { color: var(--accent-2); }
.perm-target.dashboard { color: var(--accent); }

/* Analytics */
.analytics-toolbar { display: flex; align-items: center; gap: 1rem; }
.period-btns { display: flex; gap: 2px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 2px; }
.period-btn { background: none; border: none; color: var(--text-2); padding: .3rem .7rem; border-radius: var(--radius-sm); cursor: pointer; font-size: .78rem; font-weight: 600; font-family: var(--font-body); transition: all var(--transition); }
.period-btn.active { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); }

.kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin-bottom: 1rem; }
.kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .85rem 1.1rem; display: flex; flex-direction: column; gap: .2rem; }
.kpi-label { font-size: .72rem; color: var(--text-2); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.kpi-value { font-family: var(--font-mono); font-size: 1.6rem; font-weight: 700; color: var(--accent); }

.analytics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
.analytics-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; display: flex; flex-direction: column; gap: .5rem; }
.analytics-panel-title { font-size: .72rem; font-weight: 700; color: var(--text-2); text-transform: uppercase; letter-spacing: .1em; margin-bottom: .25rem; }
.rank-row { display: flex; align-items: center; gap: .75rem; padding: .35rem 0; border-bottom: 1px solid var(--border); }
.rank-row:last-child { border-bottom: none; }
.rank-pos { font-family: var(--font-mono); font-size: .75rem; color: var(--text-3); width: 1.5rem; flex-shrink: 0; }
.rank-pos.never { color: var(--error); }
.rank-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
.rank-title { font-size: .82rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank-sector { font-size: .7rem; font-weight: 500; }
.rank-count { font-family: var(--font-mono); font-size: .85rem; font-weight: 600; color: var(--accent); }

.hours-chart-panel { grid-column: 1/-1; }
.hours-chart { display: flex; gap: 3px; align-items: flex-end; height: 80px; padding-top: 1rem; }
.hour-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.hour-count { font-family: var(--font-mono); font-size: .55rem; color: var(--text-3); min-height: 1em; }
.hour-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; min-height: 30px; }
.hour-bar { width: 100%; background: var(--accent); opacity: .7; border-radius: 2px 2px 0 0; transition: height .3s ease; min-height: 2px; }
.hour-label { font-family: var(--font-mono); font-size: .52rem; color: var(--text-3); }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
.modal-box { background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius); width: 460px; max-width: 95vw; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; }
.modal-box.modal-lg { width: 680px; }
.modal-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.modal-header h3 { font-family: var(--font-display); font-size: .9rem; color: var(--text); }
.modal-close { background: none; border: none; color: var(--text-2); font-size: 1.25rem; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); transition: color var(--transition); }
.modal-close:hover { color: var(--text); }
.modal-body { padding: 1.25rem; display: flex; flex-direction: column; gap: .75rem; }
.modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
.modal-grid .form-group.span2 { grid-column: 1/-1; }
.modal-footer { padding: 1rem 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: .5rem; }
.btn-cancel { background: var(--surface-3); border: 1px solid var(--border); color: var(--text-2); border-radius: var(--radius-sm); padding: .5rem 1.1rem; font-size: .82rem; font-family: var(--font-body); cursor: pointer; transition: all var(--transition); }
.btn-cancel:hover { color: var(--text); }

.check-row { padding: .35rem 0; border-bottom: 1px solid var(--border); }
.check-row label { display: flex; align-items: center; gap: .5rem; cursor: pointer; font-size: .875rem; color: var(--text); }
.thumb-preview { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
.thumb-preview img { width: 100%; max-height: 160px; object-fit: cover; display: block; }

.dash-sector-tag { font-size: .65rem; font-weight: 600; letter-spacing: .04em; padding: .18rem .5rem; border-radius: 3px; border-width: 1px; border-style: solid; }
</style>

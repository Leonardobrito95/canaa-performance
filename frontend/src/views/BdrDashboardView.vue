<template>
  <div class="view-bdr-dash">
    <div class="dash-header">
      <div>
        <h1 class="dash-title">Dashboard BDR</h1>
        <p class="dash-sub">{{ filteredRows.length }} lançamento{{ filteredRows.length !== 1 ? 's' : '' }} encontrado{{ filteredRows.length !== 1 ? 's' : '' }}</p>
      </div>
      <button class="btn-refresh" @click="load" :disabled="loading">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Atualizar
      </button>
    </div>

    <!-- KPIs -->
    <div class="kpi-row">
      <div class="kpi-card">
        <span class="kpi-label">Total Lançamentos</span>
        <span class="kpi-value">{{ filteredRows.length }}</span>
        <span class="kpi-detail">no período filtrado</span>
      </div>
      <div class="kpi-card accent">
        <span class="kpi-label">Total Comissão</span>
        <span class="kpi-value amber">{{ fmt(totalComissao) }}</span>
        <span class="kpi-detail">valor total BDR</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Média por Lançamento</span>
        <span class="kpi-value">{{ fmt(mediaComissao) }}</span>
        <span class="kpi-detail">valor médio</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Upgrade / Downgrade</span>
        <span class="kpi-value" style="font-size:.95rem">
          <span style="color:var(--upgrade)">{{ countByTipo('Upgrade') }}</span>
          <span style="color:var(--text-3)"> / </span>
          <span style="color:var(--downgrade)">{{ countByTipo('Downgrade') }}</span>
        </span>
        <span class="kpi-detail">negociações</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Refidelizações</span>
        <span class="kpi-value" style="color:var(--refid)">{{ countByTipo('Refidelizacao') }}</span>
        <span class="kpi-detail">renovações</span>
      </div>
    </div>

    <!-- Charts -->
    <div v-if="!loading && filteredRows.length" class="charts-row">
      <ChartDonut
        title="Distribuição por Tipo"
        center-label="lançamentos"
        :segments="[
          { label: 'Upgrade',       value: countByTipo('Upgrade'),       color: '#00f0ff' },
          { label: 'Downgrade',     value: countByTipo('Downgrade'),     color: '#ff2a5f' },
          { label: 'Refidelização', value: countByTipo('Refidelizacao'), color: '#a855f7' },
        ]"
      />
      <ChartBars
        title="Comissão por Tipo (R$)"
        :bars="tipoValorBars"
      />
      <ChartRanking
        title="Ranking de Consultores"
        :items="rankingData"
        :max-items="8"
        :highlight-name="user?.nome"
      />
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <PeriodFilter
        v-model:model-period="period"
        v-model:model-month="customMonth"
        v-model:model-year="customYear"
        @change="onPeriodChange"
      />
      <div v-if="isGestor" class="filter-group">
        <label class="filter-label">Consultor</label>
        <select v-model="f.vendedor" @change="resetPage">
          <option value="">Todos</option>
          <option v-for="v in vendedores" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Tipo</label>
        <select v-model="f.tipo" @change="resetPage">
          <option value="">Todos</option>
          <option value="Upgrade">Upgrade</option>
          <option value="Downgrade">Downgrade</option>
          <option value="Refidelizacao">Refidelização</option>
        </select>
      </div>
      <button class="btn-filter-clear" @click="clearFilters">Limpar</button>
    </div>

    <!-- Estado -->
    <div v-if="loading" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando...
    </div>
    <div v-else-if="error" class="state-msg" style="color:var(--error)">{{ error }}</div>
    <div v-else-if="filteredRows.length === 0" class="state-msg">Nenhum lançamento encontrado.</div>

    <template v-else>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Contrato</th>
              <th>Cliente</th>
              <th v-if="isGestor">Consultor</th>
              <th>Tipo</th>
              <th>Valor Atual</th>
              <th>Valor Novo</th>
              <th>Comissão</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in paginated" :key="r.id">
              <td class="td-date">{{ fmtDate(r.data_registro) }}</td>
              <td class="td-mono">{{ r.id_contrato }}</td>
              <td class="td-cliente">{{ r.nome_cliente }}</td>
              <td v-if="isGestor"><span class="vendedor-badge">{{ r.vendedor || '—' }}</span></td>
              <td><span :class="['pill-tipo', r.tipo_negociacao.toLowerCase()]">{{ r.tipo_negociacao === 'Refidelizacao' ? 'Refidelização' : r.tipo_negociacao }}</span></td>
              <td class="td-amount">{{ fmt(parseFloat(r.valor_atual)) }}</td>
              <td class="td-amount">{{ r.valor_novo ? fmt(parseFloat(r.valor_novo)) : '—' }}</td>
              <td class="td-commission">{{ fmt(parseFloat(r.valor_comissao)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button class="pg-btn" @click="page = 1"           :disabled="page === 1">«</button>
        <button class="pg-btn" @click="page--"             :disabled="page === 1">‹</button>
        <span class="pg-info">
          Página <strong>{{ page }}</strong> de <strong>{{ totalPages }}</strong>
          <span class="pg-count"> — {{ filteredRows.length }} registros</span>
        </span>
        <button class="pg-btn" @click="page++"             :disabled="page >= totalPages">›</button>
        <button class="pg-btn" @click="page = totalPages"  :disabled="page >= totalPages">»</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { bdrApi, type Commission } from '../services/api';
import { useAuth } from '../composables/useAuth';
import { type Period, getPeriodRange } from '../composables/useDateRange';
import ChartDonut   from '../components/ChartDonut.vue';
import ChartBars    from '../components/ChartBars.vue';
import ChartRanking from '../components/ChartRanking.vue';
import PeriodFilter from '../components/PeriodFilter.vue';

const props = defineProps<{ refresh: number }>();
watch(() => props.refresh, load);

const { user, isGestor } = useAuth();
const rows    = ref<Commission[]>([]);
const loading = ref(false);
const error   = ref('');

const period      = ref<Period>('this_month');
const customMonth = ref(new Date().getMonth());
const customYear  = ref(new Date().getFullYear());
const f = ref({ ...getPeriodRange('this_month'), vendedor: '', tipo: '' });

function onPeriodChange() {
  const range = getPeriodRange(period.value, customYear.value, customMonth.value);
  f.value.dateFrom = range.dateFrom;
  f.value.dateTo   = range.dateTo;
  resetPage();
}

// ── Pagination ────────────────────────────────────────────────────────────────
const page      = ref(1);
const PAGE_SIZE = 50;
function resetPage() { page.value = 1; }

// ── Filtered (client-side) ────────────────────────────────────────────────────
const filteredRows = computed(() =>
  rows.value.filter((r) => {
    if (f.value.dateFrom && r.data_registro.slice(0, 10) < f.value.dateFrom) return false;
    if (f.value.dateTo   && r.data_registro.slice(0, 10) > f.value.dateTo)   return false;
    if (f.value.vendedor && !r.vendedor.toLowerCase().includes(f.value.vendedor.toLowerCase())) return false;
    if (f.value.tipo && r.tipo_negociacao !== f.value.tipo) return false;
    return true;
  })
);

watch(filteredRows, resetPage);

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / PAGE_SIZE)));
const paginated  = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filteredRows.value.slice(start, start + PAGE_SIZE);
});

// ── KPI helpers ───────────────────────────────────────────────────────────────
const totalComissao = computed(() => filteredRows.value.reduce((s, r) => s + parseFloat(r.valor_comissao), 0));
const mediaComissao = computed(() => filteredRows.value.length ? totalComissao.value / filteredRows.value.length : 0);

function countByTipo(tipo: string) { return filteredRows.value.filter((r) => r.tipo_negociacao === tipo).length; }

const vendedores = computed(() =>
  [...new Set(rows.value.map((r) => r.vendedor).filter(Boolean))].sort()
);

// ── Chart data ────────────────────────────────────────────────────────────────
const TIPO_COLORS: Record<string, string> = {
  Upgrade:       '#00f0ff',
  Downgrade:     '#ff2a5f',
  Refidelizacao: '#a855f7',
};

const tipoValorBars = computed(() => {
  const map = new Map<string, number>();
  for (const r of filteredRows.value) {
    const t = r.tipo_negociacao;
    if (t === 'Downgrade') continue; // comissão sempre R$ 0,00 — sem sentido no gráfico
    map.set(t, (map.get(t) ?? 0) + parseFloat(r.valor_comissao));
  }
  return [...map.entries()].map(([label, value]) => ({
    label: label === 'Refidelizacao' ? 'Refidel.' : label,
    value: Math.round(value),
    color: TIPO_COLORS[label] ?? '#8a99b8',
  }));
});

const rankingData = computed(() => {
  const map = new Map<string, { count: number; value: number }>();
  for (const r of filteredRows.value) {
    if (!r.vendedor) continue;
    const cur = map.get(r.vendedor) ?? { count: 0, value: 0 };
    map.set(r.vendedor, { count: cur.count + 1, value: cur.value + parseFloat(r.valor_comissao) });
  }
  return [...map.entries()].map(([name, d]) => ({ name, count: d.count, value: d.value }));
});

// ── Load ──────────────────────────────────────────────────────────────────────
onMounted(load);

async function load() {
  loading.value = true; error.value = '';
  try {
    rows.value = await bdrApi.listCommissions();
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message ?? 'Erro ao carregar lançamentos BDR.';
  } finally { loading.value = false; }
}

function clearFilters() {
  period.value      = 'this_month';
  customMonth.value = new Date().getMonth();
  customYear.value  = new Date().getFullYear();
  f.value = { ...getPeriodRange('this_month'), vendedor: '', tipo: '' };
  resetPage();
}

const fmt     = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<style scoped>
.view-bdr-dash { width: 100%; }

.dash-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  gap: 1rem;
}
.dash-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -.01em; }
.dash-sub   { font-size: .875rem; color: var(--text-2); margin-top: .25rem; }

/* KPI */
.kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: .65rem; margin-bottom: 1.25rem; }
@media(max-width:900px){ .kpi-row{ grid-template-columns: repeat(3,1fr); } }
.kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .9rem 1.1rem; display: flex; flex-direction: column; gap: .15rem; }
.kpi-card.accent { border-color: rgba(0,240,255,.25); }
.kpi-label  { font-size: .7rem; font-weight: 600; color: var(--text-2); letter-spacing: .06em; text-transform: uppercase; }
.kpi-value  { font-family: var(--font-mono); font-size: 1.3rem; font-weight: 700; color: var(--text); line-height: 1.2; }
.kpi-value.amber { color: var(--accent); }
.kpi-detail { font-size: .7rem; color: var(--text-3); }

/* Charts */
.charts-row {
  display: grid;
  grid-template-columns: 220px 1fr 1fr;
  gap: .65rem;
  margin-bottom: 1rem;
}
@media(max-width:900px){ .charts-row{ grid-template-columns: 1fr; } }

/* Pills */
.pill-tipo {
  display: inline-block; padding: .2rem .55rem; border-radius: 3px;
  font-size: .7rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
}
.pill-tipo.upgrade       { background: rgba(0,240,255,.1);  color: var(--upgrade);   border: 1px solid rgba(0,240,255,.2); }
.pill-tipo.downgrade     { background: rgba(255,42,95,.1);  color: var(--downgrade); border: 1px solid rgba(255,42,95,.2); }
.pill-tipo.refidelizacao { background: rgba(168,85,247,.1); color: var(--refid);     border: 1px solid rgba(168,85,247,.2); }

/* Table */
.td-cliente  { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-amount   { font-family: var(--font-mono); }
.td-commission { font-family: var(--font-mono); font-weight: 700; color: var(--accent); }
.vendedor-badge { display: inline-block; background: var(--surface-3); border: 1px solid var(--border-2); border-radius: 4px; padding: .15rem .5rem; font-size: .78rem; }

/* Loading */
.loading-dots { display: inline-flex; gap: 4px; margin-right: .5rem; }
.loading-dots span { width: 5px; height: 5px; border-radius: 50%; background: var(--text-2); animation: ldot .8s ease-in-out infinite; }
.loading-dots span:nth-child(2){ animation-delay: .16s; }
.loading-dots span:nth-child(3){ animation-delay: .32s; }
@keyframes ldot{ 0%,80%,100%{transform:scale(.5);opacity:.3} 40%{transform:scale(1);opacity:1} }

/* Pagination */
.pagination { display: flex; align-items: center; justify-content: center; gap: .5rem; padding: .9rem 0 .25rem; }
.pg-btn { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); border-radius: var(--radius-sm); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: .9rem; transition: all var(--transition); }
.pg-btn:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.pg-btn:disabled { opacity: .3; cursor: not-allowed; }
.pg-info { font-size: .8rem; color: var(--text-2); padding: 0 .5rem; }
.pg-info strong { color: var(--text); }
.pg-count { color: var(--text-3); }
</style>

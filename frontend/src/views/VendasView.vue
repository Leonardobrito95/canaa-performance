<template>
  <div class="view-vendas">
    <div class="vendas-header">
      <div>
        <h1 class="vendas-title">Dashboard de Vendas</h1>
        <p class="vendas-sub">{{ filtered.length }} contrato{{ filtered.length !== 1 ? 's' : '' }} encontrado{{ filtered.length !== 1 ? 's' : '' }}</p>
      </div>
      <div class="header-actions">
        <transition name="fade-msg">
          <span v-if="zapMsg" class="zap-msg">{{ zapMsg }}</span>
        </transition>
        <button v-if="isGestor" class="btn-export btn-zap" @click="forceZapRefresh" :disabled="zapRefreshing || loading">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {{ zapRefreshing ? 'Atualizando...' : 'ZapSign' }}
        </button>
        <button class="btn-export" @click="exportCSV" :disabled="loading || !filtered.length">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v8M3.5 6.5l3 3 3-3M2 11h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Excel
        </button>
        <button class="btn-export" @click="exportPDF" :disabled="loading || !filtered.length">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="1" width="9" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M4 4.5h5M4 6.5h5M4 8.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          PDF
        </button>
        <button class="btn-refresh" @click="load" :disabled="loading">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Atualizar
        </button>
      </div>
    </div>

    <!-- Painel de Relatório de Comissão (apenas gestores) -->
    <div v-if="isGestor" class="relatorio-panel">
      <div class="relatorio-info">
        <span class="relatorio-label">Relatório de Comissão</span>
        <span class="relatorio-mes">{{ relatorioMesLabel }}</span>
      </div>
      <div class="relatorio-steps">
        <!-- Step 1: Comercial -->
        <div class="relatorio-step">
          <span :class="['step-badge', relatorioStatus?.comercial.enviado ? 'badge-ok' : 'badge-pending']">
            {{ relatorioStatus?.comercial.enviado ? '✓' : '1' }}
          </span>
          <span class="step-text">
            <strong>Comercial</strong>
            <span class="step-detail">
              {{ relatorioStatus?.comercial.enviado
                  ? `Enviado em ${fmtRelatorioDate(relatorioStatus.comercial.em)}`
                  : 'Auto-envio no dia 19' }}
            </span>
          </span>
        </div>
        <!-- Seta -->
        <span class="step-arrow">›</span>
        <!-- Step 2: Financeiro -->
        <div class="relatorio-step">
          <span :class="['step-badge', relatorioStatus?.financeiro.enviado ? 'badge-ok' : relatorioStatus?.comercial.enviado ? 'badge-ready' : 'badge-locked']">
            {{ relatorioStatus?.financeiro.enviado ? '✓' : '2' }}
          </span>
          <span class="step-text">
            <strong>Financeiro</strong>
            <span class="step-detail">
              {{ relatorioStatus?.financeiro.enviado
                  ? `Enviado em ${fmtRelatorioDate(relatorioStatus.financeiro.em)}`
                  : 'Após validação do comercial' }}
            </span>
          </span>
        </div>
      </div>
      <div class="relatorio-actions">
        <span v-if="relatorioMsg" :class="['relatorio-feedback', relatorioMsgOk ? 'msg-ok' : 'msg-err']">
          {{ relatorioMsg }}
        </span>
        <button
          class="btn-financeiro"
          :disabled="!relatorioStatus?.comercial.enviado || relatorioStatus?.financeiro.enviado || relatorioSending"
          @click="enviarFinanceiro"
        >
          <svg v-if="relatorioSending" class="spin-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ relatorioSending ? 'Enviando...' : relatorioStatus?.financeiro.enviado ? 'Enviado ao Financeiro' : 'Enviar ao Financeiro' }}
        </button>
      </div>
    </div>

    <!-- KPI row -->
    <div class="kpi-row">
      <div class="kpi-card">
        <span class="kpi-label">Contratos</span>
        <span class="kpi-value">{{ kpis?.totalContratos ?? 0 }}</span>
        <span class="kpi-detail">no período filtrado</span>
      </div>

      <div class="kpi-card accent">
        <span class="kpi-label">Faturamento Total</span>
        <span class="kpi-value amber">{{ fmt(kpis?.faturamentoMensal ?? 0) }}</span>
        <span class="kpi-detail">todos os contratos ativados</span>
      </div>

      <!-- Base para meta: valorAtivado (todos os contratos) com barra de progresso -->
      <div class="kpi-card kpi-meta">
        <div class="kpi-meta-header">
          <span class="kpi-label">Base para Meta</span>
          <span :class="(kpis?.valorAtivado ?? 0) >= (kpis?.metaAlvo ?? 10000) ? 'meta-tag ok' : 'meta-tag nok'">
            {{ (kpis?.valorAtivado ?? 0) >= (kpis?.metaAlvo ?? 10000) ? 'ATINGIDA' : 'ABAIXO' }}
          </span>
        </div>
        <span class="kpi-value upgrade">{{ fmt(kpis?.valorAtivado ?? 0) }}</span>
        <div class="meta-bar-wrap">
          <div
            class="meta-bar-fill"
            :class="(kpis?.valorAtivado ?? 0) >= (kpis?.metaAlvo ?? 10000) ? 'meta-ok' : 'meta-nok'"
            :style="{ width: Math.min(((kpis?.valorAtivado ?? 0) / (kpis?.metaAlvo ?? 10000)) * 100, 100) + '%' }"
          />
        </div>
        <span class="kpi-detail">{{ kpis?.totalContratos ?? 0 }} ativados · meta {{ fmt(kpis?.metaAlvo ?? 10000) }}</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-label">Comissão a Receber</span>
        <span class="kpi-value upgrade">{{ fmt(kpis?.valorComissaoLiberada ?? 0) }}</span>
        <span class="kpi-detail">sobre contratos liberados</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-label">Aguardando Liberação</span>
        <span class="kpi-value downgrade">{{ (kpis?.comissoesBloqueadas ?? 0) + (kpis?.comissoesPendentes ?? 0) }}</span>
        <span class="kpi-detail">{{ fmt(kpis?.valorBloqueado ?? 0) }} fora da meta</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-label">B2C / B2B / Cortesia</span>
        <span class="kpi-value" style="font-size:.95rem">
          <span class="refid-c">{{ kpis?.b2c ?? 0 }}</span>
          <span class="dim"> / </span>
          <span class="amber-c">{{ kpis?.b2b ?? 0 }}</span>
          <span class="dim"> / </span>
          <span class="muted-c">{{ kpis?.cortesias ?? 0 }}</span>
        </span>
        <span class="kpi-detail">segmento / cortesias</span>
      </div>
    </div>

    <!-- Charts -->
    <div v-if="!loading && contracts.length" :class="['charts-row', isGestor ? 'charts-4' : 'charts-3']">
      <ChartDonut
        title="Vendas por Segmento"
        center-label="contratos"
        :segments="[
          { label: 'B2C',      value: kpis?.b2c      ?? 0, color: '#a855f7' },
          { label: 'B2B',      value: kpis?.b2b      ?? 0, color: '#f59e0b' },
          { label: 'Cortesia', value: kpis?.cortesias ?? 0, color: '#4c5870' },
        ]"
      />
      <ChartBars
        title="Qtd de Vendas por Tipo"
        :bars="tipoBarData"
      />
      <ChartDonut
        title="Status de Comissões"
        center-label="bloqueadas"
        :center-override="comissaoStatusData.bloqueadas + comissaoStatusData.inativo"
        :segments="[
          { label: 'Liberadas',       value: comissaoStatusData.liberadas,    color: '#c7ff00' },
          { label: 'Sem assinatura',  value: comissaoStatusData.semDoc,       color: '#ff2a5f' },
          { label: 'Assin. pendente', value: comissaoStatusData.zapPending,   color: '#f59e0b' },
          { label: 'Ag. pagamento',   value: comissaoStatusData.semPagamento, color: '#a855f7' },
          { label: 'Inativo',         value: comissaoStatusData.inativo,      color: '#4c5870' },
        ]"
      />
      <ChartRanking
        v-if="isGestor"
        title="Ranking de Consultores"
        :items="rankingData"
        :max-items="10"
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
        <select v-model="f.vendedor" @change="fetchAndReset">
          <option value="">Todos</option>
          <option v-for="v in vendedores" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Segmento</label>
        <select v-model="f.segmento" @change="resetPage">
          <option value="">Todos</option>
          <option value="B2C">B2C</option>
          <option value="B2B">B2B</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Tipo</label>
        <select v-model="f.tipo" @change="resetPage">
          <option value="">Todos</option>
          <option value="EXTERNO">Externo</option>
          <option value="INTERNO">Interno</option>
          <option value="PLANTÃO">Plantão</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Assinatura</label>
        <select v-model="f.assinatura" @change="resetPage">
          <option value="">Todos</option>
          <option value="signed">ZapSign Assinado</option>
          <option value="ixc_assina">IXC Assina</option>
          <option value="gov">Assinatura GOV</option>
          <option value="pending">Pendente</option>
          <option value="Sem Contrato">Sem documento</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Comissão</label>
        <select v-model="f.statusComissao" @change="resetPage">
          <option value="">Todos</option>
          <option value="Liberada">Liberada</option>
          <option value="Bloqueada">Bloqueada</option>
          <option value="Pendente">Pendente</option>
          <option value="aguardando">Aguard. pagamento</option>
        </select>
      </div>
      <button class="btn-filter-clear" @click="clearFilters">Limpar</button>
    </div>

    <!-- State -->
    <div v-if="loading" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando...
    </div>
    <div v-else-if="error" class="state-msg" style="color:var(--error)">{{ error }}</div>
    <div v-else-if="filtered.length === 0" class="state-msg">Nenhum contrato encontrado.</div>

    <template v-else>
      <!-- Table -->
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Ativação</th>
              <th>Contrato</th>
              <th>Cliente</th>
              <th v-if="isGestor">Consultor</th>
              <th>Plano</th>
              <th>Tipo</th>
              <th>Seg.</th>
              <th>Valor Mensal</th>
              <th>Assinatura</th>
              <th>Comissão</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in paginated" :key="c.id_contrato">
              <td class="td-date">{{ fmtDate(c.data_ativacao) }}</td>
              <td class="td-mono">{{ c.id_contrato }}</td>
              <td class="td-cliente">{{ c.nome_cliente }}</td>
              <td v-if="isGestor"><span class="vendedor-badge">{{ c.nome_vendedor || '—' }}</span></td>
              <td class="td-plano">{{ c.plano }}</td>
              <td><span :class="['pill-tipo', c.tipo_venda === 'EXTERNO' ? 'externo' : c.tipo_venda === 'PLANTÃO' ? 'plantao' : 'interno']">{{ c.tipo_venda }}</span></td>
              <td><span :class="['pill-seg', c.segmento.toLowerCase()]">{{ c.segmento }}</span></td>
              <td class="td-amount">{{ fmt(c.valor_mensal) }}</td>
              <td><span :class="['pill-zap', zapClass(c.assinatura_zapsign)]">{{ zapLabel(c.assinatura_zapsign) }}</span></td>
              <td>
                <span
                  :class="['pill-comissao', comissaoClass(c.status_comissao)]"
                  @mouseenter="c.motivo_bloqueio ? showTooltip($event, c.motivo_bloqueio) : null"
                  @mouseleave="hideTooltip"
                  :style="c.motivo_bloqueio ? 'cursor:help' : ''"
                >{{ comissaoLabel(c.status_comissao) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="pagination">
        <button class="pg-btn" @click="page = 1" :disabled="page === 1">«</button>
        <button class="pg-btn" @click="page--"   :disabled="page === 1">‹</button>
        <span class="pg-info">
          Página <strong>{{ page }}</strong> de <strong>{{ totalPages }}</strong>
          <span class="pg-count"> · {{ filtered.length }} registros</span>
        </span>
        <button class="pg-btn" @click="page++"          :disabled="page >= totalPages">›</button>
        <button class="pg-btn" @click="page = totalPages" :disabled="page >= totalPages">»</button>
      </div>
    </template>
  </div>
  <!-- Tooltip global — renderizado fora da tabela para não ser cortado pelo overflow -->
  <Teleport to="body">
    <div
      v-if="tooltip.visible"
      class="global-tooltip"
      :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px' }"
    >{{ tooltip.text }}</div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from 'vue';
import { vendasApiClient, type ContractRecord, type ContractKpis, type RelatorioEnvioStatus } from '../services/api';
import { useAuth } from '../composables/useAuth';
import { type Period, getPeriodRange } from '../composables/useDateRange';

// ── Relatório de Comissão ─────────────────────────────────────────────────────
const relatorioStatus  = ref<RelatorioEnvioStatus | null>(null);
const relatorioSending = ref(false);
const relatorioMsg     = ref('');
const relatorioMsgOk   = ref(true);

// Mês anterior = referência do relatório
function mesAnterior(): string {
  const now   = new Date();
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const relatorioMes = mesAnterior();
const relatorioMesLabel = computed(() => {
  const [y, m] = relatorioMes.split('-').map(Number);
  return `${MESES[m - 1]}/${y}`;
});

function fmtRelatorioDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR');
}

async function loadRelatorioStatus() {
  try {
    relatorioStatus.value = await vendasApiClient.getStatusRelatorio(relatorioMes);
  } catch { /* silencia — não bloqueia o resto da view */ }
}

async function enviarFinanceiro() {
  relatorioSending.value = true;
  relatorioMsg.value     = '';
  try {
    const r = await vendasApiClient.enviarFinanceiro(relatorioMes);
    relatorioMsg.value   = r.message;
    relatorioMsgOk.value = true;
    await loadRelatorioStatus();
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    relatorioMsg.value   = err.response?.data?.message ?? 'Erro ao enviar.';
    relatorioMsgOk.value = false;
  } finally {
    relatorioSending.value = false;
    setTimeout(() => { relatorioMsg.value = ''; }, 6000);
  }
}

// ── ZapSign refresh ───────────────────────────────────────────────────────────
const zapRefreshing = ref(false);
const zapMsg        = ref('');

async function forceZapRefresh() {
  zapRefreshing.value = true;
  zapMsg.value = '';
  try {
    const r = await vendasApiClient.refreshZapSign();
    zapMsg.value = `✓ ZapSign: ${r.zapsign} · GOV: ${r.gov} · Fin: ${r.financeiro}`;
    await load();
  } catch {
    zapMsg.value = '✗ Erro ao atualizar ZapSign';
  } finally {
    zapRefreshing.value = false;
    setTimeout(() => { zapMsg.value = ''; }, 5000);
  }
}
import ChartDonut   from '../components/ChartDonut.vue';
import ChartBars    from '../components/ChartBars.vue';
import ChartRanking from '../components/ChartRanking.vue';
import PeriodFilter from '../components/PeriodFilter.vue';

const props = defineProps<{ refresh: number }>();
watch(() => props.refresh, fetchAndReset);

const { user, isGestor } = useAuth();

const contracts = ref<ContractRecord[]>([]);
const kpis      = ref<ContractKpis | null>(null);
const loading   = ref(false);
const error     = ref('');

const period      = ref<Period>('this_month');
const customMonth = ref(new Date().getMonth());
const customYear  = ref(new Date().getFullYear());
const f = ref({ ...getPeriodRange('this_month'), vendedor: '', segmento: '', tipo: '', assinatura: '', statusComissao: '' });

function onPeriodChange() {
  const range = getPeriodRange(period.value, customYear.value, customMonth.value);
  f.value.dateFrom = range.dateFrom;
  f.value.dateTo   = range.dateTo;
  fetchAndReset();
}

// ── Pagination ────────────────────────────────────────────────────────────────
const page     = ref(1);
const PAGE_SIZE = 100;

function resetPage() { page.value = 1; }

const filtered = computed(() =>
  contracts.value.filter((c) => {
    if (f.value.segmento && c.segmento !== f.value.segmento) return false;
    if (f.value.tipo && c.tipo_venda !== f.value.tipo) return false;
    if (f.value.assinatura && c.assinatura_zapsign !== f.value.assinatura) return false;
    if (f.value.statusComissao) {
      if (f.value.statusComissao === 'Liberada'    && c.status_comissao !== 'Liberada') return false;
      if (f.value.statusComissao === 'Bloqueada'   && !c.status_comissao.startsWith('Bloqueada')) return false;
      if (f.value.statusComissao === 'Pendente'    && !c.status_comissao.startsWith('Pendente')) return false;
      if (f.value.statusComissao === 'aguardando'  && c.status_comissao !== 'Bloqueada — aguardando pagamento') return false;
    }
    return true;
  })
);

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
const paginated  = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filtered.value.slice(start, start + PAGE_SIZE);
});

// reset page whenever client-side filters or data change
watch(filtered, resetPage);

// ── Chart data ────────────────────────────────────────────────────────────────
const TIPO_COLORS: Record<string, string> = {
  EXTERNO: '#00f0ff',
  INTERNO: '#c7ff00',
  PLANTÃO: '#f59e0b',
};
const tipoBarData = computed(() => {
  const map = new Map<string, number>();
  for (const c of contracts.value) {
    map.set(c.tipo_venda, (map.get(c.tipo_venda) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: TIPO_COLORS[label] ?? '#8a99b8' }));
});

const comissaoStatusData = computed(() => ({
  liberadas:    contracts.value.filter((c) => c.status_comissao === 'Liberada').length,
  semDoc:       contracts.value.filter((c) => c.status_comissao === 'Bloqueada — sem assinatura').length,
  zapPending:   contracts.value.filter((c) => c.status_comissao === 'Bloqueada — assinatura pendente').length,
  semPagamento: contracts.value.filter((c) => c.status_comissao === 'Bloqueada — aguardando pagamento').length,
  inativo:      contracts.value.filter((c) => c.status_comissao.startsWith('Pendente')).length,
  bloqueadas:   contracts.value.filter((c) => c.status_comissao.startsWith('Bloqueada')).length,
}));

const rankingData = computed(() => {
  const map = new Map<string, { count: number; value: number }>();
  for (const c of contracts.value) {
    if (!c.nome_vendedor) continue;
    const cur = map.get(c.nome_vendedor) ?? { count: 0, value: 0 };
    map.set(c.nome_vendedor, { count: cur.count + 1, value: cur.value + (c.comissao ?? 0) });
  }
  return [...map.entries()].map(([name, d]) => ({ name, count: d.count, value: d.value }));
});

const vendedores = computed(() =>
  [...new Set(contracts.value.map((c) => c.nome_vendedor).filter(Boolean))].sort()
);

onMounted(() => { load(); loadRelatorioStatus(); });

async function fetchAndReset() { resetPage(); await load(); }

async function load() {
  loading.value = true; error.value = '';
  try {
    const r = await vendasApiClient.getContracts({
      dateFrom: f.value.dateFrom || undefined,
      dateTo:   f.value.dateTo   || undefined,
      vendedor: isGestor.value && f.value.vendedor ? f.value.vendedor : undefined,
    });
    contracts.value = r.contracts;
    kpis.value      = r.kpis;
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message ?? 'Erro ao carregar contratos.';
  } finally { loading.value = false; }
}

function clearFilters() {
  period.value      = 'this_month';
  customMonth.value = new Date().getMonth();
  customYear.value  = new Date().getFullYear();
  f.value = { ...getPeriodRange('this_month'), vendedor: '', segmento: '', tipo: '', assinatura: '', statusComissao: '' };
  fetchAndReset();
}

// Formatting helpers
const fmt     = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR');

// ── Tooltip global ────────────────────────────────────────────────────────────
const tooltip = reactive({ visible: false, text: '', x: 0, y: 0 });

function showTooltip(event: MouseEvent, text: string) {
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  tooltip.text    = text;
  tooltip.x       = rect.left + rect.width / 2;
  tooltip.y       = rect.top - 8;   // acima do elemento
  tooltip.visible = true;
}
function hideTooltip() {
  tooltip.visible = false;
}

function zapClass(s: string) {
  if (s === 'Sem Contrato') return 'zap-none';
  if (s === 'signed')       return 'zap-ok';
  if (s === 'ixc_assina')   return 'zap-ixc';
  if (s === 'gov')          return 'zap-gov';
  return 'zap-pending';
}
function zapLabel(s: string) {
  const map: Record<string, string> = {
    'Sem Contrato': 'Sem doc.',
    signed:         'Assinado',
    pending:        'Pendente',
    ixc_assina:     'IXC Assina',
    gov:            'Assin. GOV',
  };
  return map[s] ?? s;
}
function comissaoClass(s: string) {
  if (s === 'Liberada')          return 'com-ok';
  if (s.startsWith('Bloqueada')) return 'com-blocked';
  return 'com-pending';
}
function comissaoLabel(s: string) {
  if (s === 'Liberada')          return 'Liberada';
  if (s.startsWith('Bloqueada')) return 'Bloqueada';
  return 'Pendente';
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportCSV() {
  const SEP = ';';
  const headers = [
    'Ativação', 'Contrato', 'Cliente',
    ...(isGestor.value ? ['Consultor'] : []),
    'Plano', 'Tipo', 'Segmento', 'Valor Mensal', 'Assinatura', 'Status Comissão', 'Comissão (R$)',
  ];
  const rows = filtered.value.map((c) => [
    fmtDate(c.data_ativacao),
    c.id_contrato,
    c.nome_cliente,
    ...(isGestor.value ? [c.nome_vendedor ?? ''] : []),
    c.plano,
    c.tipo_venda,
    c.segmento,
    c.valor_mensal.toFixed(2).replace('.', ','),
    zapLabel(c.assinatura_zapsign),
    c.status_comissao,
    (c.comissao ?? 0).toFixed(2).replace('.', ','),
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(SEP)).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vendas_${f.value.dateFrom}_${f.value.dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF() {
  window.print();
}
</script>

<style scoped>
.view-vendas { width: 100%; }

.vendas-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.25rem; flex-wrap:wrap; gap:.75rem; }
.vendas-title { font-family:var(--font-display); font-size:1.6rem; font-weight:700; letter-spacing:-.01em; }
.vendas-sub { font-size:.875rem; color:var(--text-2); margin-top:.25rem; }

.header-actions { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
.btn-export {
  display: flex; align-items: center; gap: .4rem;
  padding: .45rem .9rem; border-radius: var(--radius-sm);
  background: var(--surface-2); border: 1px solid var(--border);
  color: var(--text-2); font-size: .8rem; font-weight: 600; cursor: pointer;
  transition: all var(--transition); white-space: nowrap;
}
.btn-export:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.btn-export:disabled { opacity: .35; cursor: not-allowed; }
.btn-zap:hover:not(:disabled) { border-color: #f59e0b; color: #f59e0b; }

.zap-msg {
  font-size: .78rem; color: var(--text-2); white-space: nowrap;
  padding: .3rem .6rem; background: var(--surface-2);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
}
.fade-msg-enter-active, .fade-msg-leave-active { transition: opacity .3s; }
.fade-msg-enter-from, .fade-msg-leave-to { opacity: 0; }

/* Relatório de Comissão */
.relatorio-panel {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .75rem 1.1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.relatorio-info { display: flex; flex-direction: column; gap: .1rem; min-width: 120px; }
.relatorio-label { font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-2); }
.relatorio-mes   { font-family: var(--font-mono); font-size: .95rem; font-weight: 700; color: var(--text); }

.relatorio-steps { display: flex; align-items: center; gap: .75rem; flex: 1; }
.relatorio-step  { display: flex; align-items: center; gap: .5rem; }
.step-badge {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: .7rem; font-weight: 700; flex-shrink: 0;
}
.badge-ok      { background: rgba(0,200,83,.15);  color: #00c853; border: 1px solid rgba(0,200,83,.3); }
.badge-ready   { background: rgba(0,240,255,.1);  color: var(--accent); border: 1px solid rgba(0,240,255,.25); }
.badge-pending { background: rgba(150,150,150,.1); color: var(--text-3); border: 1px solid var(--border); }
.badge-locked  { background: rgba(150,150,150,.08); color: var(--text-3); border: 1px solid var(--border); }
.step-text  { display: flex; flex-direction: column; gap: .05rem; }
.step-text strong { font-size: .8rem; color: var(--text); }
.step-detail { font-size: .7rem; color: var(--text-3); }
.step-arrow  { font-size: 1.1rem; color: var(--text-3); margin: 0 .1rem; }

.relatorio-actions { display: flex; align-items: center; gap: .75rem; margin-left: auto; }
.relatorio-feedback { font-size: .78rem; padding: .3rem .6rem; border-radius: var(--radius-sm); }
.msg-ok  { background: rgba(0,200,83,.1);  color: #00c853; border: 1px solid rgba(0,200,83,.2); }
.msg-err { background: rgba(255,42,95,.1); color: var(--downgrade); border: 1px solid rgba(255,42,95,.2); }

.btn-financeiro {
  display: flex; align-items: center; gap: .4rem;
  padding: .45rem 1rem; border-radius: var(--radius-sm);
  background: rgba(0,200,83,.1); border: 1px solid rgba(0,200,83,.25);
  color: #00c853; font-size: .8rem; font-weight: 700;
  cursor: pointer; transition: all var(--transition); white-space: nowrap;
}
.btn-financeiro:hover:not(:disabled) { background: rgba(0,200,83,.2); border-color: rgba(0,200,83,.45); }
.btn-financeiro:disabled { opacity: .4; cursor: not-allowed; }
.spin-icon { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* KPI */
.kpi-row { display:grid; grid-template-columns:repeat(6,1fr); gap:.65rem; margin-bottom:1.25rem; }
@media(max-width:1100px) { .kpi-row{ grid-template-columns:repeat(3,1fr); } }
@media(max-width:540px)  { .kpi-row{ grid-template-columns:repeat(2,1fr); } }
@media(max-width:360px)  { .kpi-row{ grid-template-columns:1fr; } }
.kpi-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:.9rem 1.1rem; display:flex; flex-direction:column; gap:.15rem; }
.kpi-card.accent { border-color:rgba(0,240,255,.25); }
.kpi-card.kpi-meta { border-color:rgba(0,200,83,.2); }
.kpi-label { font-size:.7rem; font-weight:600; color:var(--text-2); letter-spacing:.06em; text-transform:uppercase; }
.kpi-value { font-family:var(--font-mono); font-size:1.3rem; font-weight:700; color:var(--text); line-height:1.2; }
.kpi-value.amber    { color:var(--accent); }
.kpi-value.upgrade  { color:var(--upgrade); }
.kpi-value.downgrade{ color:var(--downgrade); }
.kpi-detail { font-size:.7rem; color:var(--text-3); }

/* Barra de progresso da meta */
.kpi-meta-header { display:flex; align-items:center; justify-content:space-between; }
.meta-bar-wrap { height:3px; background:var(--border); border-radius:2px; margin:.3rem 0 .1rem; overflow:hidden; }
.meta-bar-fill { height:100%; border-radius:2px; transition:width .4s ease; }
.meta-bar-fill.meta-ok  { background:var(--upgrade); }
.meta-bar-fill.meta-nok { background:#f59e0b; }
.meta-tag { font-size:.58rem; font-weight:700; letter-spacing:.05em; padding:.1rem .3rem; border-radius:3px; white-space:nowrap; }
.meta-tag.ok  { background:rgba(0,200,83,.15); color:var(--upgrade); }
.meta-tag.nok { background:rgba(245,158,11,.15); color:#f59e0b; }

/* Inline span colours inside kpi-value */
.amber-c { color:var(--accent); }
.refid-c { color:var(--refid); }
.muted-c { color:var(--text-2); }
.dim     { color:var(--text-3); }

/* Loading */
.loading-dots { display:inline-flex; gap:4px; margin-right:.5rem; }
.loading-dots span { width:5px; height:5px; border-radius:50%; background:var(--text-2); animation:ldot .8s ease-in-out infinite; }
.loading-dots span:nth-child(2){ animation-delay:.16s; }
.loading-dots span:nth-child(3){ animation-delay:.32s; }
@keyframes ldot{ 0%,80%,100%{transform:scale(.5);opacity:.3} 40%{transform:scale(1);opacity:1} }

/* Table */
.td-cliente { max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.td-plano { font-size:.78rem; color:var(--text-2); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vendedor-badge { display:inline-block; background:var(--surface-3); border:1px solid var(--border-2); border-radius:4px; padding:.1rem .4rem; font-size:.72rem; white-space:nowrap; }

/* Pills */
.pill-tipo, .pill-seg, .pill-zap, .pill-comissao {
  display:inline-block; padding:.12rem .4rem; border-radius:3px; font-size:.66rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
}
.pill-tipo.externo  { background:rgba(0,240,255,.1);   color:var(--accent);   border:1px solid rgba(0,240,255,.2); }
.pill-tipo.interno  { background:rgba(199,255,0,.08);  color:var(--accent-2); border:1px solid rgba(199,255,0,.15); }
.pill-tipo.plantao  { background:rgba(245,158,11,.1);  color:#f59e0b;         border:1px solid rgba(245,158,11,.25); }
.pill-seg.b2c { background:rgba(168,85,247,.1); color:var(--refid); border:1px solid rgba(168,85,247,.2); }
.pill-seg.b2b { background:rgba(245,158,11,.1); color:#f59e0b;      border:1px solid rgba(245,158,11,.2); }
.zap-none    { background:rgba(255,42,95,.1);    color:var(--downgrade); border:1px solid rgba(255,42,95,.2); }
.zap-ok      { background:rgba(199,255,0,.1);    color:var(--success);   border:1px solid rgba(199,255,0,.2); }
.zap-gov     { background:rgba(96,165,250,.1);   color:#60a5fa;          border:1px solid rgba(96,165,250,.2); }
.zap-ixc     { background:rgba(167,139,250,.1);  color:#a78bfa;          border:1px solid rgba(167,139,250,.2); }
.zap-pending { background:rgba(0,240,255,.08);   color:var(--accent);    border:1px solid rgba(0,240,255,.15); }
.com-ok      { background:rgba(199,255,0,.1);    color:var(--success);   border:1px solid rgba(199,255,0,.2); }
.com-blocked { background:rgba(255,42,95,.1);    color:var(--downgrade); border:1px solid rgba(255,42,95,.2); }
.com-pending { background:rgba(0,240,255,.08);   color:var(--accent);    border:1px solid rgba(0,240,255,.15); }

/* Tooltip global — renderizado via Teleport fora do table-wrapper */
.global-tooltip {
  position: fixed;
  transform: translate(-50%, -100%);
  background: #1a1f2e;
  color: #e2e8f0;
  font-size: .72rem;
  font-weight: 500;
  white-space: normal;
  max-width: 220px;
  padding: .4rem .7rem;
  border-radius: 5px;
  border: 1px solid rgba(255,42,95,.4);
  pointer-events: none;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0,0,0,.4);
  line-height: 1.4;
}

/* Mobile */
@media(max-width:600px) {
  .vendas-title { font-size: 1.25rem; }
  .relatorio-panel { flex-direction: column; align-items: flex-start; gap: .75rem; }
  .relatorio-actions { margin-left: 0; }
  .pg-count { display: none; }
}

/* Charts */
.charts-row {
  display: grid;
  gap: .65rem;
  margin-bottom: 1rem;
  align-items: stretch;
}
.charts-4 { grid-template-columns: 210px 1fr 210px 1fr; }
.charts-3 { grid-template-columns: 210px 1fr 210px; }
@media(max-width:1100px){ .charts-4, .charts-3 { grid-template-columns: 1fr 1fr; } }
@media(max-width:600px){  .charts-4, .charts-3 { grid-template-columns: 1fr; } }

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .5rem;
  padding: .9rem 0 .25rem;
}
.pg-btn {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  border-radius: var(--radius-sm);
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  font-size: .9rem;
  transition: all var(--transition);
}
.pg-btn:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.pg-btn:disabled { opacity: .3; cursor: not-allowed; }
.pg-info { font-size: .8rem; color: var(--text-2); padding: 0 .5rem; }
.pg-info strong { color: var(--text); }
.pg-count { color: var(--text-3); }
</style>

<template>
  <div class="view-retencao">

    <!-- Header -->
    <div class="ret-header">
      <div>
        <h1 class="ret-title">Retenção de Clientes</h1>
        <p class="ret-sub">Comissionamento por metas de retenção</p>
      </div>
      <button class="btn-refresh" @click="load" :disabled="loading">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Atualizar
      </button>
    </div>

    <!-- Metas de comissão (sempre visíveis) -->
    <div class="metas-bar">
      <div v-for="meta in METAS" :key="meta.qtd" class="meta-card" :class="meta.cls">
        <span class="meta-qtd">{{ meta.qtd }}+ retenções</span>
        <span class="meta-val">{{ fmt(meta.valor) }}</span>
      </div>
    </div>

    <!-- Filtros -->
    <div class="filter-bar">
      <PeriodFilter
        v-model:model-period="period"
        v-model:model-month="customMonth"
        v-model:model-year="customYear"
        @change="onPeriodChange"
      />
      <div v-if="isGestor" class="filter-group">
        <label class="filter-label">Operador</label>
        <select v-model="f.operador" @change="load">
          <option value="">Todos</option>
          <option v-for="op in operadores" :key="op" :value="op">{{ op }}</option>
        </select>
      </div>
      <button class="btn-filter-clear" @click="clearFilters">Limpar</button>
    </div>

    <!-- Estado -->
    <div v-if="loading" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando retenções...
    </div>
    <div v-else-if="error" class="state-msg" style="color:var(--error)">{{ error }}</div>

    <template v-else>

      <!-- KPIs -->
      <div class="kpi-row">
        <div class="kpi-card">
          <span class="kpi-label">Tratadas</span>
          <span class="kpi-value">{{ kpis?.totalTratadas ?? 0 }}</span>
          <span class="kpi-detail">chamados no período</span>
        </div>
        <div class="kpi-card accent-green">
          <span class="kpi-label">Retidas</span>
          <span class="kpi-value upgrade">{{ kpis?.totalRetidas ?? 0 }}</span>
          <span class="kpi-detail">clientes retidos</span>
        </div>
        <div class="kpi-card accent-red">
          <span class="kpi-label">Não Retidas</span>
          <span class="kpi-value downgrade">{{ kpis?.totalNaoRetidas ?? 0 }}</span>
          <span class="kpi-detail">cancelamentos</span>
        </div>
        <div class="kpi-card accent">
          <span class="kpi-label">% Reversão</span>
          <span class="kpi-value amber">{{ kpis?.pctReversaoGeral ?? 0 }}%</span>
          <span class="kpi-detail">taxa de reversão geral</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total Comissões</span>
          <span class="kpi-value">{{ fmt(kpis?.totalComissoes ?? 0) }}</span>
          <span class="kpi-detail">{{ kpis?.operadoresNaMeta ?? 0 }} operador(es) na meta</span>
        </div>
      </div>

      <!-- Gráficos -->
      <div v-if="result?.operadores.length" class="charts-row charts-3">
        <ChartDonut
          title="Resultado das Retenções"
          center-label="tratadas"
          :segments="[
            { label: 'Retidas',     value: kpis?.totalRetidas    ?? 0, color: '#c7ff00' },
            { label: 'Não Retidas', value: kpis?.totalNaoRetidas ?? 0, color: '#ff2a5f' },
          ]"
        />
        <ChartBars
          title="Retenções por Operador"
          :bars="barData"
        />
        <ChartRanking
          v-if="isGestor"
          title="Ranking de Retenção"
          :items="rankingData"
          :max-items="8"
          :highlight-name="user?.nome"
        />
        <!-- Consultor: progresso pessoal -->
        <div v-else class="progress-card">
          <div class="progress-title">Meu Progresso</div>
          <div v-if="meuDado" class="progress-body">
            <div class="progress-meta">{{ meuDado.qtd_retidas }} de {{ proximaMeta?.qtd ?? '—' }} retenções</div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-track">
                <div class="progress-bar-fill" :style="{ width: progressoPct + '%' }"></div>
              </div>
              <span class="progress-pct">{{ progressoPct }}%</span>
            </div>
            <div class="progress-faixa" :class="meuDado.comissao > 0 ? 'achieved' : ''">
              {{ meuDado.faixa }}
            </div>
          </div>
          <div v-else class="progress-empty">Sem dados no período</div>
        </div>
      </div>

      <!-- Tabela por operador -->
      <div class="section-label">Desempenho por Operador</div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Operador</th>
              <th class="ta-r">Tratadas</th>
              <th class="ta-r">Retidas</th>
              <th class="ta-r">Não Retidas</th>
              <th class="ta-r">% Reversão</th>
              <th>Faixa</th>
              <th class="ta-r">Comissão</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="op in result?.operadores" :key="op.nome_operador"
                :class="op.nome_operador === user?.nome ? 'row-highlight' : ''">
              <td class="td-nome">{{ op.nome_operador }}</td>
              <td class="ta-r td-mono">{{ op.qtd_tratadas }}</td>
              <td class="ta-r"><span class="badge-retida">{{ op.qtd_retidas }}</span></td>
              <td class="ta-r"><span class="badge-nao-retida">{{ op.qtd_nao_retidas }}</span></td>
              <td class="ta-r td-pct">
                <div class="pct-bar-wrap">
                  <div class="pct-bar-track">
                    <div class="pct-bar-fill" :style="{ width: Math.min(op.pct_reversao, 100) + '%' }"></div>
                  </div>
                  <span>{{ op.pct_reversao }}%</span>
                </div>
              </td>
              <td>
                <span :class="['pill-faixa', op.comissao > 0 ? 'meta-atingida' : 'sem-meta']">
                  {{ op.comissao > 0 ? faixaLabel(op.qtd_retidas) : 'Abaixo da meta' }}
                </span>
              </td>
              <td class="ta-r td-comissao">
                <span :class="op.comissao > 0 ? 'val-ok' : 'val-zero'">
                  {{ op.comissao > 0 ? fmt(op.comissao) : '—' }}
                </span>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="isGestor && result?.operadores.length">
            <tr>
              <td><strong>Total</strong></td>
              <td class="ta-r td-mono"><strong>{{ kpis?.totalTratadas }}</strong></td>
              <td class="ta-r"><strong>{{ kpis?.totalRetidas }}</strong></td>
              <td class="ta-r"><strong>{{ kpis?.totalNaoRetidas }}</strong></td>
              <td class="ta-r td-pct"><strong>{{ kpis?.pctReversaoGeral }}%</strong></td>
              <td></td>
              <td class="ta-r td-comissao"><strong class="val-ok">{{ fmt(kpis?.totalComissoes ?? 0) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Detalhe de retenções -->
      <div class="detalhe-header">
        <div class="section-label" style="margin:0">Retenções Detalhadas</div>
        <div class="detalhe-search">
          <input
            v-model="buscaDetalhe"
            class="detalhe-input"
            placeholder="Buscar por O.S. ou nome do cliente..."
          />
          <span v-if="buscaDetalhe" class="detalhe-clear" @click="buscaDetalhe = ''">×</span>
        </div>
      </div>
      <div v-if="loadingDetalhe" class="state-msg">
        <span class="loading-dots"><span/><span/><span/></span> Carregando detalhes...
      </div>
      <div v-else class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>O.S.</th>
              <th>Data</th>
              <th>Operador</th>
              <th>Cliente</th>
              <th class="ta-r">Valor Mensal</th>
              <th class="ta-c">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="detalheFiltrado.length === 0">
              <td colspan="6" class="state-msg">Nenhuma retenção encontrada.</td>
            </tr>
            <tr v-for="d in detalheFiltrado" :key="d.id_chamado">
              <td class="td-mono td-os">{{ d.id_chamado }}</td>
              <td class="td-mono td-date">{{ fmtDate(d.data_abertura) }}</td>
              <td class="td-nome">{{ d.nome_operador }}</td>
              <td>
                <div>{{ d.nome_cliente || '—' }}</div>
                <div v-if="d.negociacao" class="negociacao-badge" title="Retenção com negociação de valor">
                  Negociado: {{ fmt(d.negociacao.valor_negociado) }}
                </div>
              </td>
              <td class="ta-r td-mono">{{ d.valor_mensal > 0 ? fmt(d.valor_mensal) : '—' }}</td>
              <td class="ta-c">
                <button class="btn-action" @click="abrirModalNegociacao(d)">
                  {{ d.negociacao ? 'Editar' : 'Registrar' }}
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="detalheFiltrado.length > 0">
            <tr>
              <td colspan="4"><strong>Total ({{ detalheFiltrado.length }} retenções)</strong></td>
              <td class="ta-r td-mono"><strong class="val-ok">{{ fmt(totalValorFiltrado) }}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

    </template>

    <!-- Modal Negociação -->
    <div v-if="modalNegociacao.open" class="modal-overlay" @click.self="fecharModalNegociacao">
      <div class="modal-content">
        <h3 class="modal-title">Registrar Negociação</h3>
        <p class="modal-sub">O.S. {{ modalNegociacao.id_chamado }} — {{ modalNegociacao.nome_cliente }}</p>

        <form @submit.prevent="salvarNegociacao" class="modal-form">
          <div class="form-group">
            <label>Valor Original (R$)</label>
            <input type="number" step="0.01" v-model.number="modalNegociacao.valor_original" required />
          </div>
          <div class="form-group">
            <label>Valor Negociado (R$)</label>
            <input type="number" step="0.01" v-model.number="modalNegociacao.valor_negociado" required disabled />
          </div>
          <div class="form-group">
            <label>Descrição (opcional mas recomendado)</label>
            <textarea v-model="modalNegociacao.descricao" rows="3" placeholder="Ex: Cliente queria cancelar por preço, ofertamos desconto..."></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="fecharModalNegociacao" :disabled="salvandoNegociacao">Cancelar</button>
            <button v-if="modalNegociacao.isEdit" type="button" class="btn-danger" @click="excluirNegociacao" :disabled="salvandoNegociacao">Remover</button>
            <button type="submit" class="btn-submit" :disabled="salvandoNegociacao">
              {{ salvandoNegociacao ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { retencaoApiClient, type RetencaoResult, type RetencaoKpis, type RetencaoDetalhe } from '../services/api';
import { useAuth } from '../composables/useAuth';
import { type Period, getPeriodRange } from '../composables/useDateRange';
import PeriodFilter  from '../components/PeriodFilter.vue';
import ChartDonut    from '../components/ChartDonut.vue';
import ChartBars     from '../components/ChartBars.vue';
import ChartRanking  from '../components/ChartRanking.vue';

const props = defineProps<{ refresh: number }>();
watch(() => props.refresh, load);

const { user, isGestor } = useAuth();

const result         = ref<RetencaoResult | null>(null);
const loading        = ref(false);
const error          = ref('');
const detalhe        = ref<RetencaoDetalhe[]>([]);
const loadingDetalhe = ref(false);

// Modal state
const salvandoNegociacao = ref(false);
const modalNegociacao = ref({
  open: false,
  isEdit: false,
  id_chamado: '',
  nome_cliente: '',
  valor_original: 0,
  valor_negociado: 0,
  descricao: '' as string | null,
});

const period      = ref<Period>('this_month');
const customMonth = ref(new Date().getMonth());
const customYear  = ref(new Date().getFullYear());
const f = ref({ ...getPeriodRange('this_month'), operador: '' });

function onPeriodChange() {
  const range = getPeriodRange(period.value, customYear.value, customMonth.value);
  f.value.dateFrom = range.dateFrom;
  f.value.dateTo   = range.dateTo;
  load();
}

// ── Metas ─────────────────────────────────────────────────────────────────────
const METAS = [
  { qtd: 70,  valor: 400, cls: 'meta-bronze' },
  { qtd: 90,  valor: 550, cls: 'meta-silver' },
  { qtd: 110, valor: 750, cls: 'meta-gold'   },
];

function faixaLabel(qtd: number): string {
  if (qtd >= 110) return '110+ retenções';
  if (qtd >= 90)  return '90+ retenções';
  if (qtd >= 70)  return '70+ retenções';
  return 'Abaixo da meta';
}

// ── Computed ──────────────────────────────────────────────────────────────────
const kpis = computed((): RetencaoKpis | null => result.value?.kpis ?? null);

const operadores = computed(() =>
  [...new Set(result.value?.operadores.map((o) => o.nome_operador) ?? [])].sort()
);

const barData = computed(() =>
  (result.value?.operadores ?? []).map((o) => ({
    label: o.nome_operador.split(' ')[0],
    value: o.qtd_retidas,
    color: o.comissao > 0 ? '#c7ff00' : '#00f0ff',
  }))
);

const rankingData = computed(() =>
  (result.value?.operadores ?? []).map((o) => ({
    name:  o.nome_operador,
    count: o.qtd_tratadas,
    value: o.qtd_retidas,
  }))
);

const meuDado = computed(() =>
  result.value?.operadores.find((o) => o.nome_operador === user.value?.nome) ?? null
);

const proximaMeta = computed(() => {
  const qtd = meuDado.value?.qtd_retidas ?? 0;
  return METAS.find((m) => m.qtd > qtd) ?? null;
});

const progressoPct = computed(() => {
  if (!meuDado.value) return 0;
  const meta = proximaMeta.value?.qtd ?? METAS[METAS.length - 1].qtd;
  const prev = METAS.filter((m) => m.qtd <= meuDado.value!.qtd_retidas).pop()?.qtd ?? 0;
  return Math.min(Math.round(((meuDado.value.qtd_retidas - prev) / (meta - prev)) * 100), 100);
});

const buscaDetalhe = ref('');

const detalheRetidas = computed(() =>
  detalhe.value.filter((d) => d.resultado === 'RETIDO')
);

const detalheFiltrado = computed(() => {
  const q = buscaDetalhe.value.trim().toLowerCase();
  if (!q) return detalheRetidas.value;
  return detalheRetidas.value.filter((d) =>
    d.id_chamado.toLowerCase().includes(q) ||
    d.nome_cliente.toLowerCase().includes(q)
  );
});

const totalValorFiltrado = computed(() =>
  detalheFiltrado.value.reduce((s, d) => s + (d.valor_mensal ?? 0), 0)
);

// ── Load ──────────────────────────────────────────────────────────────────────
onMounted(load);

async function load() {
  loading.value = true; error.value = '';
  loadingDetalhe.value = true;
  const params = {
    dateFrom: f.value.dateFrom || undefined,
    dateTo:   f.value.dateTo   || undefined,
    operador: isGestor.value && f.value.operador ? f.value.operador : undefined,
  };
  try {
    const [res, det] = await Promise.all([
      retencaoApiClient.get(params),
      retencaoApiClient.getDetalhe(params),
    ]);
    result.value  = res;
    detalhe.value = det;
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message ?? 'Erro ao carregar dados de retenção.';
  } finally {
    loading.value        = false;
    loadingDetalhe.value = false;
  }
}

function clearFilters() {
  period.value      = 'this_month';
  customMonth.value = new Date().getMonth();
  customYear.value  = new Date().getFullYear();
  f.value = { ...getPeriodRange('this_month'), operador: '' };
  load();
}

function abrirModalNegociacao(d: RetencaoDetalhe) {
  modalNegociacao.value = {
    open: true,
    isEdit: !!d.negociacao,
    id_chamado: d.id_chamado,
    nome_cliente: d.nome_cliente || 'Cliente sem nome',
    valor_original: d.negociacao ? d.negociacao.valor_original : (0 as any as number),
    valor_negociado: d.negociacao ? d.negociacao.valor_negociado : d.valor_mensal,
    descricao: d.negociacao ? d.negociacao.descricao : '',
  };
}

function fecharModalNegociacao() {
  modalNegociacao.value.open = false;
}

async function salvarNegociacao() {
  if (!modalNegociacao.value.id_chamado) return;
  salvandoNegociacao.value = true;
  try {
    const res = await retencaoApiClient.registerNegociacao({
      id_chamado: modalNegociacao.value.id_chamado,
      valor_original: modalNegociacao.value.valor_original,
      valor_negociado: modalNegociacao.value.valor_negociado,
      descricao: modalNegociacao.value.descricao || undefined,
    });
    
    // Atualiza localmente
    const d = detalhe.value.find(x => x.id_chamado === modalNegociacao.value.id_chamado);
    if (d) d.negociacao = res;
    
    fecharModalNegociacao();
  } catch (e: any) {
    alert(e.response?.data?.error || 'Erro ao salvar negociação');
  } finally {
    salvandoNegociacao.value = false;
  }
}

async function excluirNegociacao() {
  if (!confirm('Deseja realmente remover esta negociação?')) return;
  salvandoNegociacao.value = true;
  try {
    await retencaoApiClient.deleteNegociacao(modalNegociacao.value.id_chamado);
    
    // Atualiza localmente
    const d = detalhe.value.find(x => x.id_chamado === modalNegociacao.value.id_chamado);
    if (d) d.negociacao = null;
    
    fecharModalNegociacao();
  } catch (e: any) {
    alert(e.response?.data?.error || 'Erro ao excluir negociação');
  } finally {
    salvandoNegociacao.value = false;
  }
}

const fmt     = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR');
</script>

<style scoped>
.view-retencao { width: 100%; }

.ret-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.25rem; flex-wrap:wrap; gap:1rem; }
.ret-title  { font-family:var(--font-display); font-size:1.6rem; font-weight:700; letter-spacing:-.01em; }
.ret-sub    { font-size:.875rem; color:var(--text-2); margin-top:.25rem; }

/* Metas bar */
.metas-bar {
  display: flex; gap: .65rem; margin-bottom: 1.1rem; flex-wrap: wrap;
}
.meta-card {
  flex: 1; min-width: 130px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: .2rem; padding: .7rem 1rem;
  border-radius: var(--radius); border: 1px solid var(--border);
  background: var(--surface);
}
.meta-qtd { font-size: .72rem; font-weight: 600; color: var(--text-2); letter-spacing:.05em; text-transform:uppercase; }
.meta-val { font-family: var(--font-mono); font-size: 1.1rem; font-weight: 700; }

.meta-bronze { border-color: rgba(205,127,50,.3); }
.meta-bronze .meta-val { color: #cd7f32; }
.meta-silver { border-color: rgba(192,192,192,.3); }
.meta-silver .meta-val { color: #c0c0c0; }
.meta-gold   { border-color: rgba(255,215,0,.3); }
.meta-gold   .meta-val { color: #ffd700; }

/* KPIs */
.kpi-row { display:grid; grid-template-columns:repeat(5,1fr); gap:.65rem; margin-bottom:1.1rem; }
@media(max-width:900px)  { .kpi-row{ grid-template-columns:repeat(3,1fr); } }
@media(max-width:540px)  { .kpi-row{ grid-template-columns:repeat(2,1fr); } }
@media(max-width:360px)  { .kpi-row{ grid-template-columns:1fr; } }
.kpi-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:.9rem 1.1rem; display:flex; flex-direction:column; gap:.15rem; }
.kpi-card.accent      { border-color:rgba(0,240,255,.25); }
.kpi-card.accent-green{ border-color:rgba(199,255,0,.2); }
.kpi-card.accent-red  { border-color:rgba(255,42,95,.2); }
.kpi-label   { font-size:.7rem; font-weight:600; color:var(--text-2); letter-spacing:.06em; text-transform:uppercase; }
.kpi-value   { font-family:var(--font-mono); font-size:1.3rem; font-weight:700; color:var(--text); line-height:1.2; }
.kpi-value.amber    { color:var(--accent); }
.kpi-value.upgrade  { color:var(--upgrade); }
.kpi-value.downgrade{ color:var(--downgrade); }
.kpi-detail  { font-size:.7rem; color:var(--text-3); }

/* Charts */
.charts-row { display:grid; gap:.65rem; margin-bottom:1rem; align-items:stretch; }
.charts-3   { grid-template-columns: 210px 1fr 1fr; }
@media(max-width:1100px){ .charts-3{ grid-template-columns:1fr 1fr; } }
@media(max-width:600px){  .charts-3{ grid-template-columns:1fr; } }

/* Progress card (consultor) */
.progress-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1rem 1.25rem;
  display: flex; flex-direction: column; gap: .75rem;
}
.progress-title { font-size:.75rem; font-weight:600; color:var(--text-2); letter-spacing:.08em; text-transform:uppercase; }
.progress-body  { display:flex; flex-direction:column; gap:.6rem; }
.progress-meta  { font-size:.9rem; color:var(--text); font-weight:600; }
.progress-bar-wrap { display:flex; align-items:center; gap:.6rem; }
.progress-bar-track { flex:1; height:8px; background:var(--surface-3); border-radius:4px; overflow:hidden; }
.progress-bar-fill  { height:100%; background:linear-gradient(90deg, #00c8e8, #c7ff00); border-radius:4px; transition:width .5s ease; }
.progress-pct  { font-size:.75rem; font-family:var(--font-mono); color:var(--text-2); min-width:32px; text-align:right; }
.progress-faixa { font-size:.78rem; color:var(--text-3); }
.progress-faixa.achieved { color: var(--upgrade); font-weight:600; }
.progress-empty { font-size:.85rem; color:var(--text-3); padding:.5rem 0; }

/* Table */
.section-label { font-size:.75rem; font-weight:600; color:var(--text-2); letter-spacing:.1em; text-transform:uppercase; margin-bottom:.65rem; margin-top:.25rem; }
.td-nome  { font-weight:500; }
.ta-r     { text-align:right; }
.td-mono  { font-family:var(--font-mono); }
.td-pct   { min-width:110px; }
.td-comissao { font-family:var(--font-mono); }

.badge-retida, .badge-nao-retida {
  display:inline-block; padding:.15rem .55rem; border-radius:3px;
  font-size:.78rem; font-weight:700; font-family:var(--font-mono);
}
.badge-retida     { background:rgba(199,255,0,.1); color:var(--upgrade); border:1px solid rgba(199,255,0,.2); }
.badge-nao-retida { background:rgba(255,42,95,.1);  color:var(--downgrade); border:1px solid rgba(255,42,95,.2); }

.pct-bar-wrap  { display:flex; align-items:center; gap:.5rem; justify-content:flex-end; }
.pct-bar-track { width:60px; height:5px; background:var(--surface-3); border-radius:3px; overflow:hidden; }
.pct-bar-fill  { height:100%; background:var(--accent); border-radius:3px; }

.pill-faixa {
  display:inline-block; padding:.2rem .55rem; border-radius:3px;
  font-size:.7rem; font-weight:700; letter-spacing:.03em; text-transform:uppercase;
}
.meta-atingida { background:rgba(199,255,0,.1); color:var(--upgrade);   border:1px solid rgba(199,255,0,.2); }
.sem-meta      { background:var(--surface-3);   color:var(--text-3);   border:1px solid var(--border); }

.val-ok   { color:var(--upgrade); font-weight:700; }
.val-zero { color:var(--text-3); }

.row-highlight { background:rgba(0,240,255,.04) !important; outline:1px solid rgba(0,240,255,.12); }

tfoot tr td { border-top:1px solid var(--border-2); padding-top:.6rem; }
.td-date { white-space: nowrap; }
.td-os   { color: var(--accent); font-size: .8rem; }

.detalhe-header {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: .75rem;
  margin-top: 1.25rem; margin-bottom: .65rem;
}
.detalhe-search {
  position: relative; display: flex; align-items: center;
}
.detalhe-input {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text);
  font-family: var(--font-body); font-size: .82rem;
  padding: .4rem 2rem .4rem .75rem;
  width: 280px; outline: none;
  transition: border-color var(--transition);
}
.detalhe-input:focus { border-color: var(--accent); }
.detalhe-input::placeholder { color: var(--text-3); }
.detalhe-clear {
  position: absolute; right: .55rem;
  color: var(--text-3); cursor: pointer; font-size: 1rem; line-height: 1;
  transition: color var(--transition);
}
.detalhe-clear:hover { color: var(--text); }

/* Loading */
.loading-dots { display:inline-flex; gap:4px; margin-right:.5rem; }
.loading-dots span { width:5px; height:5px; border-radius:50%; background:var(--text-2); animation:ldot .8s ease-in-out infinite; }
.loading-dots span:nth-child(2){ animation-delay:.16s; }
.loading-dots span:nth-child(3){ animation-delay:.32s; }
@keyframes ldot{ 0%,80%,100%{transform:scale(.5);opacity:.3} 40%{transform:scale(1);opacity:1} }

/* Negociação Feature */
.btn-action {
  background: transparent; border: 1px solid var(--accent); color: var(--accent);
  padding: .25rem .65rem; border-radius: var(--radius-sm); font-size: .75rem;
  font-weight: 600; cursor: pointer; transition: all .2s;
}
.btn-action:hover { background: rgba(0,240,255, .1); }
.ta-c { text-align: center; }

.negociacao-badge {
  display: inline-block; font-size: .7rem; font-family: var(--font-mono);
  background: rgba(199,255,0,.15); color: var(--upgrade);
  padding: .1rem .4rem; border-radius: 3px; margin-top: .2rem;
  border: 1px solid rgba(199,255,0,.3);
}

/* Modal */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0, .6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); width: 100%; max-width: 400px;
  padding: 1.5rem; box-shadow: 0 10px 30px rgba(0,0,0,.5);
}
.modal-title { font-size: 1.25rem; font-weight: 700; margin-bottom: .25rem; color: var(--text); }
.modal-sub   { font-size: .85rem; color: var(--text-3); margin-bottom: 1.25rem; font-family: var(--font-mono); }
.modal-form { display: flex; flex-direction: column; gap: 1rem; }
.form-group { display: flex; flex-direction: column; gap: .4rem; }
.form-group label { font-size: .8rem; font-weight: 600; color: var(--text-2); }
.form-group input, .form-group textarea {
  background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
  padding: .65rem; border-radius: var(--radius-sm); font-family: var(--font-body); outline: none;
}
.form-group input:focus, .form-group textarea:focus { border-color: var(--accent); }
.modal-actions { display: flex; justify-content: flex-end; gap: .75rem; margin-top: .5rem; }
.btn-cancel, .btn-danger, .btn-submit {
  padding: .5rem 1rem; border-radius: var(--radius-sm); font-weight: 600; font-size: .85rem;
  cursor: pointer; transition: all .2s; border: none;
}
.btn-cancel { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
.btn-cancel:hover { background: var(--surface-3); color: var(--text); }
.btn-danger { background: rgba(255,42,95,.15); color: var(--downgrade); border: 1px solid rgba(255,42,95,.3); }
.btn-danger:hover { background: rgba(255,42,95,.3); }
.btn-submit { background: var(--accent); color: var(--surface); }
.btn-submit:hover { opacity: .9; }
.btn-submit:disabled, .btn-cancel:disabled, .btn-danger:disabled { opacity: .5; cursor: not-allowed; }

</style>

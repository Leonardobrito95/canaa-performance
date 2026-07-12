<template>
  <div class="view-atendimento">
    <div class="atendimento-header">
      <div>
        <h1 class="atendimento-title">{{ titulo }}</h1>
        <p class="atendimento-sub">{{ subtitulo }}</p>
      </div>
      <div class="header-actions">
        <PeriodFilter
          v-if="aba === 'dashboard'"
          v-model:model-period="period"
          v-model:model-month="customMonth"
          v-model:model-year="customYear"
          @change="onPeriodChange"
        />
        <button class="btn-refresh" @click="carregarTudo" :disabled="loadingKpis">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Atualizar
        </button>
      </div>
    </div>

    <div class="atd-tabs">
      <button :class="['atd-tab', { active: aba === 'dashboard' }]" @click="aba = 'dashboard'">Dashboard</button>
      <button :class="['atd-tab', { active: aba === 'alertas' }]" @click="aba = 'alertas'">
        Alertas
        <span v-if="alertas.length" class="atd-tab-badge">{{ alertas.length }}</span>
      </button>
    </div>

    <template v-if="aba === 'dashboard'">
    <!-- Cards por setor -->
    <div v-if="loadingKpis" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando indicadores…
    </div>
    <div v-else class="setor-cards">
      <div v-for="k in kpis" :key="k.setor" class="setor-card">
        <div class="setor-card-header">
          <span class="setor-nome">{{ nomeSetor(k.setor) }}</span>
          <div class="setor-volume-bloco">
            <span class="setor-volume">{{ k.volume }}</span>
            <span class="setor-volume-label">Volume total</span>
          </div>
        </div>
        <div class="setor-stat-row">
          <div class="setor-stat" title="TMR — quanto tempo o atendente HUMANO demora pra responder uma mensagem do cliente (nunca conta resposta da URA/IZA, nem mensagem que o atendente manda por conta própria)">
            <span class="setor-stat-label">TMR · resposta</span>
            <span class="setor-stat-valor">{{ formatarDuracao(k.tmrMs) }}</span>
            <span class="setor-stat-detalhe">{{ amostraPequena(k.volume) }}</span>
          </div>
          <div class="setor-stat" title="TME — tempo em fila/URA/IZA até um atendente HUMANO de verdade assumir o atendimento (mede fila/espera)">
            <span class="setor-stat-label">TME · espera</span>
            <span class="setor-stat-valor">{{ formatarDuracao(k.tmeMs) }}</span>
            <span class="setor-stat-detalhe">{{ amostraPequena(k.volume) }}</span>
          </div>
          <div class="setor-stat" title="TMA — só o tempo que o atendente humano passou de fato com o cliente">
            <span class="setor-stat-label">TMA · atendimento</span>
            <span class="setor-stat-valor">{{ formatarDuracao(k.tmaMs) }}</span>
            <span class="setor-stat-detalhe">{{ amostraPequena(k.volume) }}</span>
          </div>
          <div class="setor-stat">
            <span class="setor-stat-label">Satisfação</span>
            <span class="setor-stat-valor">{{ k.notaMediaSatisfacao !== null ? `${k.notaMediaSatisfacao}/5` : '—' }}</span>
            <span class="setor-stat-detalhe">{{ k.qtdAvaliados }} avaliações{{ k.qtdAvaliados > 0 && k.qtdAvaliados < AMOSTRA_MINIMA ? ' · amostra pequena' : '' }}</span>
          </div>
          <div v-if="k.pctEscalonamento !== null" class="setor-stat">
            <span class="setor-stat-label">Escalonado</span>
            <span class="setor-stat-valor">{{ k.escalonamentos }}</span>
            <span class="setor-stat-detalhe">{{ k.pctEscalonamento ?? 0 }}% do volume</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Volume por setor + composição -->
    <div v-if="!loadingKpis && kpis.length" class="charts-row charts-3">
      <ChartBars title="Volume de Atendimentos por Setor" :bars="volumeBarData" />
      <ChartRanking title="Ranking de Atendentes" :items="rankingAtendentesData" :max-items="8" monochrome />
      <ChartRanking title="Motivos de Atendimento" :items="motivosData" :max-items="8" monochrome />
    </div>
    </template>

    <!-- Alertas operacionais em tempo real -->
    <template v-if="aba === 'alertas'">
    <p class="atd-aviso">
      Conversa parada, fila sem 1ª resposta, agente ausente demais, fila acumulada — atualiza a
      cada 30s. Feed interno, não manda e-mail nem WhatsApp.
    </p>
    <div v-if="loadingAlertas" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando alertas…
    </div>
    <div v-else class="alertas-lista">
      <div v-if="!alertas.length" class="state-msg">Nenhum alerta aberto agora. 🎉</div>
      <div v-for="a in alertas" :key="a.id" :class="['alerta-card', a.severidade === 'CRITICO' ? 'alerta-critico' : 'alerta-aviso']">
        <div class="alerta-topo">
          <span :class="['alerta-badge', a.severidade === 'CRITICO' ? 'badge-critico' : 'badge-aviso']">{{ a.severidade }}</span>
          <span class="alerta-titulo">{{ a.titulo }}</span>
          <button class="btn-resolver" @click="resolver(a.id)" :disabled="resolvendoId === a.id">
            {{ resolvendoId === a.id ? 'Resolvendo…' : 'Resolver' }}
          </button>
        </div>
        <p class="alerta-descricao">{{ a.descricao }}</p>
        <span class="alerta-meta">{{ a.setor }} · aberto {{ tempoRelativo(a.criado_em) }}</span>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import PeriodFilter from './PeriodFilter.vue';
import ChartBars from './ChartBars.vue';
import ChartRanking from './ChartRanking.vue';
import { type Period, getPeriodRange } from '../composables/useDateRange';
import {
  atendimentoApiClient,
  NOMES_SETOR,
  CORES_SETOR,
  type KpisAtendimento,
  type SetorAtendimento,
  type RankingsAtendimento,
  type AlertaOperacional,
} from '../services/atendimentoApi';

type Aba = 'dashboard' | 'alertas';

const props = defineProps<{
  titulo:    string;
  subtitulo: string;
  /// Só os setores desse grupo aparecem — cada página (Centro de Solução,
  /// Comercial) passa o seu próprio subconjunto, ver SETORES_CENTRO_SOLUCAO
  /// / SETORES_COMERCIAL em atendimentoApi.ts.
  setores:   SetorAtendimento[];
}>();

// Abaixo disso, mediana/nota fica ruidosa demais pra ser um número
// representativo (ex: N2 com só 2 atendimentos no mês, um deles um outlier
// gigante) — sinaliza em vez de mostrar como se fosse um valor confiável.
const AMOSTRA_MINIMA = 5;
function amostraPequena(n: number): string { return n < AMOSTRA_MINIMA ? 'amostra pequena' : 'mediana'; }
function nomeSetor(s: SetorAtendimento) { return NOMES_SETOR[s] ?? s; }

function formatarDuracao(ms: number | null): string {
  if (ms === null) return '—';
  // TMR normalmente é questão de segundos — arredondar pra minuto mostraria
  // "0min" pra quase todo mundo.
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? `${m}min` : ''}`;
}

function tempoRelativo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${min % 60 > 0 ? `${min % 60}min` : ''}`;
}

const aba         = ref<Aba>('dashboard');
const period      = ref<Period>('this_month');
const customMonth = ref(new Date().getMonth());
const customYear  = ref(new Date().getFullYear());

const kpis = ref<KpisAtendimento[]>([]);
const rankings = ref<RankingsAtendimento>({ atendentes: [], motivos: [] });
const loadingKpis = ref(false);

const alertas        = ref<AlertaOperacional[]>([]);
const loadingAlertas = ref(false);
const resolvendoId   = ref<string | null>(null);

async function carregarKpis() {
  loadingKpis.value = true;
  try {
    const range = getPeriodRange(period.value, customYear.value, customMonth.value);
    const r = await atendimentoApiClient.getResumo({ ...range, setores: props.setores });
    kpis.value = r.kpis;
    rankings.value = r.rankings;
  } finally {
    loadingKpis.value = false;
  }
}

function onPeriodChange() {
  carregarKpis();
}

const volumeBarData = computed(() =>
  kpis.value.map((k) => ({ label: nomeSetor(k.setor), value: k.volume, color: CORES_SETOR[k.setor] })),
);

// ChartRanking foi feito pra métricas Qtd/Valor (Valor em R$) — como aqui não
// há um "valor" monetário, usamos a mesma contagem nos dois pra não formatar
// um número genérico como moeda (o toggle Qtd/Valor vira um no-op inofensivo).
const rankingAtendentesData = computed(() =>
  rankings.value.atendentes.map((a) => ({ name: a.nome, count: a.qtd, value: a.qtd })),
);
const motivosData = computed(() =>
  rankings.value.motivos.map((m) => ({ name: m.motivo, count: m.qtd, value: m.qtd })),
);

async function carregarAlertas() {
  loadingAlertas.value = true;
  try {
    const r = await atendimentoApiClient.getAlertasOperacionais();
    alertas.value = r.itens;
  } finally {
    loadingAlertas.value = false;
  }
}

async function resolver(id: string) {
  resolvendoId.value = id;
  try {
    await atendimentoApiClient.resolverAlertaOperacional(id);
    alertas.value = alertas.value.filter((a) => a.id !== id);
  } finally {
    resolvendoId.value = null;
  }
}

function carregarTudo() {
  carregarKpis();
  carregarAlertas();
}

let pollingId: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  carregarTudo();
  // Alertas operacionais são "tempo real" — atualiza sozinho sem precisar
  // clicar em Atualizar. Não usa WebSocket (sem essa infra no projeto ainda),
  // polling é suficiente pro cron de 2 em 2 min que gera os alertas.
  pollingId = setInterval(carregarAlertas, 30000);
});
onUnmounted(() => { if (pollingId) clearInterval(pollingId); });
</script>

<style scoped>
.view-atendimento { width: 100%; }

.atendimento-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: .75rem; }
.atendimento-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -.01em; }
.atendimento-sub { font-size: .875rem; color: var(--text-2); margin-top: .25rem; }
.header-actions { display: flex; align-items: flex-end; gap: .75rem; flex-wrap: wrap; }
.header-actions .btn-refresh { height: 38px; }

.atd-tabs { display: flex; gap: .3rem; border-bottom: 1px solid var(--border); margin-bottom: 1.25rem; }
.atd-tab {
  background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-2);
  padding: .6rem .9rem; font-size: .82rem; font-weight: 600; font-family: var(--font-body);
  cursor: pointer; transition: all var(--transition); display: flex; align-items: center; gap: .4rem;
}
.atd-tab:hover { color: var(--text); }
.atd-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.atd-tab-badge { background: var(--error-bg); color: var(--error); font-size: .68rem; font-weight: 700; padding: .1rem .4rem; border-radius: 10px; }

.atd-aviso { font-size: .8rem; color: var(--text-2); margin-bottom: 1rem; max-width: 720px; line-height: 1.5; }

.alertas-lista { display: flex; flex-direction: column; gap: .7rem; }
.alerta-card { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--border); border-radius: var(--radius); padding: .9rem 1.1rem; display: flex; flex-direction: column; gap: .4rem; }
.alerta-aviso { border-left-color: #f59e0b; }
.alerta-critico { border-left-color: var(--error); }
.alerta-topo { display: flex; align-items: center; gap: .6rem; }
.alerta-badge { font-size: .64rem; font-weight: 700; padding: .15rem .5rem; border-radius: 20px; text-transform: uppercase; letter-spacing: .04em; }
.badge-aviso { background: rgba(245, 158, 11, .12); color: #f59e0b; }
.badge-critico { background: var(--error-bg); color: var(--error); }
.alerta-titulo { font-weight: 700; color: var(--text); font-size: .88rem; flex: 1; }
.btn-resolver { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); border-radius: var(--radius-sm); padding: .3rem .7rem; font-size: .74rem; cursor: pointer; white-space: nowrap; }
.btn-resolver:hover:not(:disabled) { color: var(--text); border-color: var(--border-2); }
.btn-resolver:disabled { opacity: .5; cursor: not-allowed; }
.alerta-descricao { font-size: .8rem; color: var(--text-2); line-height: 1.4; }
.alerta-meta { font-size: .7rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .03em; }

.setor-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: .8rem; margin-bottom: 1.25rem; }
@media (max-width: 600px) { .setor-cards { grid-template-columns: 1fr; } }
.setor-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: .8rem; }
.setor-card-header { display: flex; align-items: flex-start; justify-content: space-between; }
.setor-nome { font-family: var(--font-mono); font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-2); padding-top: .2rem; }
.setor-volume-bloco { display: flex; flex-direction: column; align-items: flex-end; gap: .1rem; }
.setor-volume { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--text); line-height: 1; }
.setor-volume-label { font-size: .64rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.setor-stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: .9rem .7rem; }
.setor-stat { display: flex; flex-direction: column; gap: .1rem; }
.setor-stat-label { font-size: .68rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.setor-stat-valor { font-family: var(--font-mono); font-size: 1rem; font-weight: 700; color: var(--text); }
.setor-stat-detalhe { font-size: .7rem; color: var(--text-2); }

.charts-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: .8rem; margin-bottom: 1.5rem; }
@media (max-width: 1100px) { .charts-3 { grid-template-columns: 1fr 1fr; } }
@media (max-width: 700px)  { .charts-3 { grid-template-columns: 1fr; } }

.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--text-3); animation: dot-pulse 1.1s ease-in-out infinite; }
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
</style>

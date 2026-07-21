<template>
  <div class="view-rh">
    <div class="rh-header">
      <div>
        <h1 class="rh-title">RH</h1>
        <p class="rh-sub">Indicadores de pessoas do Centro de Solução e Comercial, cruzando todos os setores</p>
      </div>
    </div>

    <div class="rh-tabs">
      <button :class="['rh-tab', { active: pagina === 'indicadores-atendimento' }]" @click="pagina = 'indicadores-atendimento'">
        Indicadores de Atendimento
      </button>
    </div>

    <template v-if="pagina === 'indicadores-atendimento'">
      <p class="rh-desc">
        Tempo real logado por operador no período (produtivo, pausa, ausente) e volume atendido,
        para todos os 9 setores de atendimento de uma vez, incluindo equipe terceirizada. Escolha os
        setores e o período abaixo.
      </p>

      <div class="rh-filtros">
        <div class="rh-filtro-setores">
          <span class="rh-filtro-label">Setores</span>
          <div class="rh-setor-chips">
            <button
              v-for="s in SETORES_ATENDIMENTO_ORDEM"
              :key="s"
              type="button"
              :class="['rh-setor-chip', { active: setoresSelecionados.includes(s) }]"
              :style="setoresSelecionados.includes(s) ? { borderColor: CORES_SETOR[s], color: CORES_SETOR[s] } : {}"
              @click="toggleSetor(s)"
            >
              {{ NOMES_SETOR[s] }}
            </button>
            <button type="button" class="rh-setor-chip-acao" @click="selecionarTodos">Todos</button>
            <button type="button" class="rh-setor-chip-acao" @click="limparSetores">Limpar</button>
          </div>
        </div>
        <PeriodFilter
          v-model:model-period="period"
          v-model:model-month="customMonth"
          v-model:model-year="customYear"
          @change="carregar"
        />
      </div>

      <div v-if="loading" class="state-msg">
        <span class="loading-dots"><span/><span/><span/></span> Calculando jornada (pode levar alguns segundos)…
      </div>
      <div v-else-if="!setoresSelecionados.length" class="state-msg">Selecione ao menos um setor.</div>
      <IndicadorJornadaTable v-else :indicadores="indicadores" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import PeriodFilter from '../components/PeriodFilter.vue';
import IndicadorJornadaTable from '../components/shared/IndicadorJornadaTable.vue';
import { type Period, getPeriodRange } from '../composables/useDateRange';
import {
  atendimentoApiClient,
  NOMES_SETOR,
  CORES_SETOR,
  SETORES_ATENDIMENTO_ORDEM,
  type SetorAtendimento,
  type IndicadorJornadaOperador,
} from '../services/atendimentoApi';

type Pagina = 'indicadores-atendimento';
const pagina = ref<Pagina>('indicadores-atendimento');

const setoresSelecionados = ref<SetorAtendimento[]>([...SETORES_ATENDIMENTO_ORDEM]);
const period      = ref<Period>('this_month');
const customMonth = ref(new Date().getMonth());
const customYear  = ref(new Date().getFullYear());
const indicadores = ref<IndicadorJornadaOperador[]>([]);
const loading     = ref(false);

function toggleSetor(s: SetorAtendimento) {
  const idx = setoresSelecionados.value.indexOf(s);
  if (idx >= 0) setoresSelecionados.value.splice(idx, 1);
  else setoresSelecionados.value.push(s);
  carregar();
}
function selecionarTodos() { setoresSelecionados.value = [...SETORES_ATENDIMENTO_ORDEM]; carregar(); }
function limparSetores() { setoresSelecionados.value = []; indicadores.value = []; }

async function carregar() {
  if (!setoresSelecionados.value.length) { indicadores.value = []; return; }
  loading.value = true;
  try {
    const d = getPeriodRange(period.value, customYear.value, customMonth.value);
    const r = await atendimentoApiClient.getIndicadoresJornada({ dateFrom: d.dateFrom, dateTo: d.dateTo, setores: setoresSelecionados.value });
    indicadores.value = r.indicadores;
  } finally {
    loading.value = false;
  }
}

carregar();
</script>

<style scoped>
.view-rh { width: 100%; }

.rh-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: .75rem; }
.rh-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -.01em; }
.rh-sub { font-size: .875rem; color: var(--text-2); margin-top: .25rem; }

.rh-tabs { display: flex; gap: .3rem; border-bottom: 1px solid var(--border); margin-bottom: 1.25rem; }
.rh-tab {
  background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-2);
  padding: .6rem .9rem; font-size: .82rem; font-weight: 600; font-family: var(--font-body);
  cursor: pointer; transition: all var(--transition);
}
.rh-tab:hover { color: var(--text); }
.rh-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

.rh-desc { font-size: .85rem; color: var(--text-2); max-width: 760px; line-height: 1.5; margin-bottom: 1rem; }

.rh-filtros { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
.rh-filtro-setores { display: flex; flex-direction: column; gap: .5rem; }
.rh-filtro-label { font-size: .68rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.rh-setor-chips { display: flex; flex-wrap: wrap; gap: .4rem; }

.rh-setor-chip {
  background: var(--surface); border: 1px solid var(--border); color: var(--text-2);
  padding: .3rem .7rem; border-radius: 20px; font-size: .75rem; font-weight: 600;
  cursor: pointer; transition: all var(--transition);
}
.rh-setor-chip:hover { border-color: var(--border-2); color: var(--text); }
.rh-setor-chip.active { font-weight: 700; }

.rh-setor-chip-acao {
  background: none; border: none; color: var(--text-3); text-decoration: underline;
  padding: .3rem .3rem; font-size: .75rem; cursor: pointer;
}
.rh-setor-chip-acao:hover { color: var(--text); }

.state-msg { padding: 3rem 1rem; text-align: center; color: var(--text-3); font-size: 0.9rem; border: 1px solid var(--border); border-radius: var(--radius); }
.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--text-3); animation: dot-pulse 1.1s ease-in-out infinite; }
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
</style>

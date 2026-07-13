<template>
  <div class="alertas-hub-view">
    <div class="view-header">
      <div>
        <h1 class="view-title">Central de Alertas</h1>
        <p class="view-sub">Agregador unificado de alertas operacionais pendentes.</p>
      </div>
      <div class="header-actions">
        <button class="btn-refresh" @click="carregar" :disabled="loading">
          <i class="fa-solid fa-rotate-right" :class="{ 'fa-spin': loading }"></i> Atualizar
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <i class="fa-solid fa-circle-notch fa-spin"></i> Carregando alertas...
    </div>

    <div v-else-if="error" class="error-state">
      <i class="fa-solid fa-circle-exclamation"></i> {{ error }}
    </div>

    <div v-else>
      <div class="alertas-stats">
        <div class="stat-card stat-critico">
          <div class="stat-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
          <div class="stat-info">
            <span class="stat-label">Críticos</span>
            <span class="stat-value">{{ resumo?.contagem.critico || 0 }}</span>
          </div>
        </div>
        <div class="stat-card stat-aviso">
          <div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div class="stat-info">
            <span class="stat-label">Avisos</span>
            <span class="stat-value">{{ resumo?.contagem.aviso || 0 }}</span>
          </div>
        </div>
        <div class="stat-card stat-geral">
          <div class="stat-icon"><i class="fa-solid fa-headset"></i></div>
          <div class="stat-info">
            <span class="stat-label">Atendimento</span>
            <span class="stat-value">{{ resumo?.contagem.porOrigem.atendimento || 0 }}</span>
          </div>
        </div>
        <div class="stat-card stat-geral">
          <div class="stat-icon"><i class="fa-solid fa-tower-cell"></i></div>
          <div class="stat-info">
            <span class="stat-label">Infraestrutura</span>
            <span class="stat-value">{{ resumo?.contagem.porOrigem.vistoria || 0 }}</span>
          </div>
        </div>
      </div>

      <div v-if="resumo?.itens.length" class="alertas-hub-content">
        <div class="setor-tabs">
          <button 
            v-for="(lista, setor) in alertasPorSetor" 
            :key="setor"
            :class="['setor-tab', { active: setorAtivo === setor }]"
            @click="setorAtivo = String(setor)"
          >
            {{ setor }} <span class="setor-badge">{{ lista.length }}</span>
          </button>
        </div>
        
        <div class="alertas-grid" v-if="setorAtivo && alertasPorSetor[setorAtivo]">
          <AlertaCard
            v-for="alerta in alertasPorSetor[setorAtivo]" 
            :key="`${alerta.origem}-${alerta.id}`" 
            :alerta="alerta"
            :podeResolver="true"
            :resolvendo="resolvendo === alerta.id"
            @resolver="resolver"
          />
        </div>
      </div>
      
      <div v-else class="empty-state">
        <i class="fa-solid fa-check-circle"></i>
        <p>Nenhum alerta pendente no momento.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { fetchAlertasHub, resolverAlertaHub, type AlertaHubResumo, type AlertaHubItem } from '../services/alertasHubApi';
import AlertaCard from '../components/shared/AlertaCard.vue';

const props = defineProps<{ refresh: number }>();

const resumo = ref<AlertaHubResumo | null>(null);
const loading = ref(true);
const error = ref('');
const resolvendo = ref<string | null>(null);
const setorAtivo = ref<string | null>(null);

const MACRO_AREAS = [
  'Centro de Solução',
  'Comercial',
  'Infraestrutura',
  'Campo',
  'Estoque',
  'Compras'
];

function obterMacroArea(item: AlertaHubItem): string {
  if (item.origem === 'vistoria') return 'Infraestrutura';
  
  const ctx = (item.contexto || '').toUpperCase();
  if (ctx.includes('VENDAS') || ctx.includes('POS VENDAS') || ctx.includes('PÓS VENDAS')) {
    return 'Comercial';
  }
  
  if (ctx.includes('O.S') || ctx.includes('POS INSTALACAO') || ctx.includes('PÓS INSTALAÇÃO')) {
    return 'Campo';
  }

  // Fallback pra Atendimento: a grande maioria das filas (SAC, Suporte N1/N2, Cobrança, Retenção...)
  // pertence ao Centro de Solução.
  if (item.origem === 'atendimento') {
    return 'Centro de Solução';
  }
  
  return 'Geral';
}

const alertasPorSetor = computed(() => {
  if (!resumo.value?.itens) return {};
  const grupos: Record<string, AlertaHubItem[]> = {};
  
  for (const area of MACRO_AREAS) {
    grupos[area] = [];
  }
  
  for (const item of resumo.value.itens) {
    const area = obterMacroArea(item);
    if (!grupos[area]) grupos[area] = [];
    grupos[area].push(item);
  }
  
  return grupos;
});

watch(alertasPorSetor, (novosGrupos) => {
  if (!setorAtivo.value || !novosGrupos[setorAtivo.value]) {
    const chaves = Object.keys(novosGrupos);
    setorAtivo.value = chaves.length > 0 ? chaves[0] : null;
  }
});

async function carregar() {
  loading.value = true;
  error.value = '';
  try {
    resumo.value = await fetchAlertasHub();
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Falha ao carregar alertas';
  } finally {
    loading.value = false;
  }
}

async function resolver(alerta: AlertaHubItem) {
  if (!confirm('Confirmar resolução deste alerta?')) return;
  resolvendo.value = alerta.id;
  try {
    await resolverAlertaHub(alerta.origem, alerta.id);
    await carregar();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Erro ao resolver alerta');
  } finally {
    resolvendo.value = null;
  }
}



watch(() => props.refresh, carregar);
onMounted(carregar);
</script>

<style scoped>
.alertas-hub-view { display: flex; flex-direction: column; gap: 1.5rem; height: 100%; max-width: 1400px; margin: 0 auto; width: 100%; padding: 0 1rem; }
.view-header { display: flex; justify-content: space-between; align-items: flex-start; }
.btn-refresh { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: .5rem 1rem; border-radius: var(--radius-sm); cursor: pointer; display: flex; gap: .5rem; align-items: center; transition: all var(--transition); }
.btn-refresh:hover:not(:disabled) { background: var(--surface-3); border-color: var(--accent); }
.btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

.alertas-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 1rem; }
.stat-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem; display: flex; align-items: center; gap: 1.25rem; position: relative; overflow: hidden; transition: transform var(--transition), box-shadow var(--transition); }
.stat-card:hover { transform: translateY(-3px); box-shadow: var(--shadow); border-color: var(--border-2); }
.stat-icon { width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; background: var(--surface-3); color: var(--text-2); }
.stat-info { display: flex; flex-direction: column; gap: 0.15rem; }
.stat-critico .stat-icon { background: rgba(255, 42, 95, 0.1); color: var(--error); box-shadow: 0 0 15px rgba(255,42,95,0.15); }
.stat-aviso .stat-icon { background: rgba(245, 158, 11, 0.1); color: #f59e0b; box-shadow: 0 0 15px rgba(245,158,11,0.15); }
.stat-geral .stat-icon { background: rgba(0, 240, 255, 0.1); color: var(--accent); box-shadow: 0 0 15px rgba(0,240,255,0.15); }
.stat-label { font-size: 0.72rem; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
.stat-value { font-size: 1.8rem; font-family: var(--font-mono); font-weight: 700; color: var(--text); line-height: 1; }

.alertas-hub-content { display: flex; flex-direction: column; gap: 1.5rem; }
.setor-tabs { display: flex; gap: 0.5rem; background: var(--surface-2); padding: 0.4rem; border-radius: var(--radius-sm); border: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
.setor-tabs::-webkit-scrollbar { display: none; }
.setor-tab { background: transparent; border: none; color: var(--text-2); padding: 0.6rem 1.25rem; font-size: 0.85rem; font-weight: 600; font-family: var(--font-body); cursor: pointer; border-radius: calc(var(--radius-sm) - 2px); transition: all var(--transition); display: flex; align-items: center; gap: 0.6rem; text-transform: capitalize; white-space: nowrap; }
.setor-tab:hover { color: var(--text); background: rgba(255,255,255,0.03); }
.setor-tab.active { background: var(--surface-3); color: var(--text); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.setor-badge { background: var(--border); font-size: .7rem; padding: .15rem .5rem; border-radius: 20px; color: var(--text); font-family: var(--font-mono); transition: all var(--transition); }
.setor-tab.active .setor-badge { background: var(--accent); color: var(--surface); box-shadow: 0 0 8px rgba(0,240,255,0.4); }

.alertas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1rem; }

.empty-state, .loading-state, .error-state { padding: 4rem; text-align: center; color: var(--text-2); display: flex; flex-direction: column; align-items: center; gap: 1rem; font-size: 1.1rem; }
.empty-state i { font-size: 3rem; color: var(--success); opacity: 0.8; }
.error-state i { font-size: 3rem; color: var(--error); }
.loading-state i { font-size: 3rem; color: var(--accent); }
</style>

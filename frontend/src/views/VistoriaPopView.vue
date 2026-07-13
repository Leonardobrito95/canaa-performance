<template>
  <div class="view-vistoria-pop">
    <div class="vp-header">
      <div>
        <h1 class="vp-title">Vistoria de POP</h1>
        <p class="vp-sub">
          Inspeção técnica de POP (rack, gerador, baterias, ar-condicionado, extintor) — dado lido
          direto do sistema de campo. O formulário de vistoria continua sendo preenchido lá, sem
          mudança de fluxo pro técnico.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn-refresh" @click="carregarTudo" :disabled="loading">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11.5 6.5A5 5 0 1 1 6.5 1.5M6.5 1.5L9 4M6.5 1.5L4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Atualizar
        </button>
        <button class="btn-primary" @click="abrirVistoria" :disabled="abrindoLink">
          {{ abrindoLink ? 'Abrindo…' : 'Fazer Vistoria ↗' }}
        </button>
      </div>
    </div>

    <div class="vp-tabs">
      <button :class="['vp-tab', { active: aba === 'status' }]" @click="aba = 'status'">Status por POP</button>
      <button :class="['vp-tab', { active: aba === 'alertas' }]" @click="aba = 'alertas'">
        Alertas
        <span v-if="alertas.length" class="vp-tab-badge">{{ alertas.length }}</span>
      </button>
    </div>

    <template v-if="aba === 'status'">
      <div v-if="loading" class="state-msg">
        <span class="loading-dots"><span/><span/><span/></span> Carregando…
      </div>
      <div v-else class="pop-grid">
        <div v-for="p in pops" :key="p.popName" class="pop-card">
          <div class="pop-card-header">
            <span class="pop-nome">{{ p.popName }}</span>
            <span v-if="p.pendenciasAbertas > 0" class="vp-badge vp-badge-alerta">{{ p.pendenciasAbertas }} pendência(s)</span>
            <span v-else class="vp-badge vp-badge-ok">Em dia</span>
          </div>
          <p class="pop-detalhe">
            Última vistoria: {{ p.ultimaVistoria ? fmtData(p.ultimaVistoria) : 'nunca vistoriado' }}
            <template v-if="p.diasDesde !== null"> ({{ p.diasDesde }} dia(s) atrás)</template>
          </p>
          <p class="pop-detalhe" v-if="p.inspetor">Inspetor: {{ p.inspetor }}</p>
          <div v-if="pendenciasPorPop[p.popName]?.length" class="pop-pendencias">
            <div v-for="pd in pendenciasPorPop[p.popName]" :key="pd.id" class="pendencia-item">
              <span :class="['vp-badge', categoriaSeguranca(pd.categoria) ? 'vp-badge-critico' : 'vp-badge-aviso']">{{ pd.categoria }}</span>
              <span class="pendencia-desc">{{ pd.descricao }}</span>
              <span class="pendencia-dias">{{ pd.diasAberta }}d aberta</span>
            </div>
          </div>
          <button class="btn-historico" @click="verHistorico(p.popName)">Ver histórico</button>
        </div>
        <div v-if="!pops.length" class="state-msg">Nenhum POP encontrado.</div>
      </div>
    </template>

    <template v-else>
      <p class="vp-aviso">
        Pendência de segurança (Extintor/Gerador/Banco de Baterias) aberta há muito tempo, ou POP
        atrasado pra vistoria — atualiza a cada carregamento da página. Feed interno, não manda
        e-mail nem WhatsApp.
      </p>
      <div v-if="loadingAlertas" class="state-msg">
        <span class="loading-dots"><span/><span/><span/></span> Carregando alertas…
      </div>
      <div v-else class="alertas-lista">
        <div v-if="!alertas.length" class="state-msg">Nenhum alerta aberto agora.</div>
        <div v-for="a in alertas" :key="a.id" :class="['alerta-card', a.severidade === 'CRITICO' ? 'alerta-critico' : 'alerta-aviso']">
          <div class="alerta-topo">
            <span :class="['alerta-badge', a.severidade === 'CRITICO' ? 'badge-critico' : 'badge-aviso']">{{ a.severidade }}</span>
            <span class="alerta-titulo">{{ a.titulo }}</span>
            <button class="btn-resolver" @click="resolver(a.id)" :disabled="resolvendoId === a.id">
              {{ resolvendoId === a.id ? 'Resolvendo…' : 'Resolver' }}
            </button>
          </div>
          <p class="alerta-descricao">{{ a.descricao }}</p>
          <span class="alerta-meta">{{ a.pop_name }} · aberto {{ tempoRelativo(a.criado_em) }}</span>
        </div>
      </div>
    </template>

    <!-- Modal histórico do POP -->
    <div v-if="modalPop" class="modal-overlay" @click.self="modalPop = null">
      <div class="modal-content modal-historico">
        <h3 class="modal-title">Histórico — {{ modalPop }}</h3>
        <div v-if="loadingHistorico" class="state-msg">Carregando…</div>
        <div v-else class="historico-lista">
          <div v-for="h in historico" :key="h.submissionId" class="historico-item">
            <div class="historico-cabecalho">
              <span>{{ fmtData(h.submissionTime) }}</span>
              <span>{{ h.inspectorName }}</span>
            </div>
            <p v-if="h.photos.length" class="historico-fotos">{{ h.photos.length }} foto(s) anexada(s)</p>
          </div>
          <div v-if="!historico.length" class="state-msg">Sem histórico registrado.</div>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="modalPop = null">Fechar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  vistoriaPopApiClient,
  type VistoriaResumoPop, type VistoriaPendencia, type VistoriaAlerta, type VistoriaHistoricoItem,
} from '../services/vistoriaPopApi';

type Aba = 'status' | 'alertas';

function fmtData(s: string | null): string { return s ? new Date(s).toLocaleDateString('pt-BR') : '—'; }
function tempoRelativo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}
function categoriaSeguranca(categoria: string): boolean {
  return (['Extintor', 'Gerador', 'Banco de Baterias'] as readonly string[]).includes(categoria);
}

const aba = ref<Aba>('status');
const loading = ref(false);
const pops = ref<VistoriaResumoPop[]>([]);
const pendencias = ref<VistoriaPendencia[]>([]);
const abrindoLink = ref(false);

const pendenciasPorPop = computed(() => {
  const acc: Record<string, VistoriaPendencia[]> = {};
  for (const p of pendencias.value) {
    if (!acc[p.popName]) acc[p.popName] = [];
    acc[p.popName].push(p);
  }
  return acc;
});

async function carregarStatus() {
  loading.value = true;
  try {
    const r = await vistoriaPopApiClient.getResumo();
    pops.value = r.pops;
    pendencias.value = r.pendencias;
  } finally {
    loading.value = false;
  }
}

const alertas = ref<VistoriaAlerta[]>([]);
const loadingAlertas = ref(false);
const resolvendoId = ref<string | null>(null);

async function carregarAlertas() {
  loadingAlertas.value = true;
  try {
    const r = await vistoriaPopApiClient.getAlertas();
    alertas.value = r.itens;
  } finally {
    loadingAlertas.value = false;
  }
}

async function resolver(id: string) {
  resolvendoId.value = id;
  try {
    await vistoriaPopApiClient.resolverAlerta(id);
    alertas.value = alertas.value.filter((a) => a.id !== id);
  } finally {
    resolvendoId.value = null;
  }
}

async function carregarTudo() {
  await Promise.all([carregarStatus(), carregarAlertas()]);
}

async function abrirVistoria() {
  abrindoLink.value = true;
  try {
    const { url } = await vistoriaPopApiClient.getLink();
    window.open(url, '_blank');
  } finally {
    abrindoLink.value = false;
  }
}

const modalPop = ref<string | null>(null);
const historico = ref<VistoriaHistoricoItem[]>([]);
const loadingHistorico = ref(false);

async function verHistorico(popName: string) {
  modalPop.value = popName;
  loadingHistorico.value = true;
  try {
    const r = await vistoriaPopApiClient.getHistoricoPop(popName);
    historico.value = r.itens;
  } finally {
    loadingHistorico.value = false;
  }
}

onMounted(carregarTudo);
</script>

<style scoped>
.view-vistoria-pop { width: 100%; }

.vp-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: .75rem; }
.vp-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; letter-spacing: -.01em; }
.vp-sub { font-size: .875rem; color: var(--text-2); margin-top: .25rem; max-width: 760px; line-height: 1.5; }
.header-actions { display: flex; align-items: flex-end; gap: .75rem; flex-wrap: wrap; }

.btn-refresh {
  display: inline-flex; align-items: center; gap: .4rem; height: 38px; padding: 0 .9rem;
  background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
  border-radius: var(--radius-sm); font-size: .8rem; font-weight: 600; cursor: pointer; transition: all var(--transition);
}
.btn-refresh:hover:not(:disabled) { color: var(--text); border-color: var(--border-2); }
.btn-refresh:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { height: 38px; padding: 0 1.1rem; border-radius: var(--radius-sm); font-weight: 600; font-size: .82rem; cursor: pointer; border: none; background: var(--accent); color: var(--surface); }
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

.vp-tabs { display: flex; gap: .3rem; border-bottom: 1px solid var(--border); margin-bottom: 1.25rem; }
.vp-tab {
  background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-2);
  padding: .6rem .9rem; font-size: .82rem; font-weight: 600; font-family: var(--font-body);
  cursor: pointer; transition: all var(--transition); display: flex; align-items: center; gap: .4rem;
}
.vp-tab:hover { color: var(--text); }
.vp-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.vp-tab-badge { background: var(--error-bg); color: var(--error); font-size: .68rem; font-weight: 700; padding: .1rem .4rem; border-radius: 10px; }
.vp-aviso { font-size: .8rem; color: #f59e0b; background: rgba(245, 158, 11, .1); border: 1px solid rgba(245, 158, 11, .3); border-radius: var(--radius-sm); padding: .55rem .7rem; margin-bottom: 1rem; }

.state-msg { color: var(--text-3); font-size: .85rem; text-align: center; padding: 2rem; }
.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--text-3); animation: dot-pulse 1.1s ease-in-out infinite; }
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }

.pop-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: .9rem; }
.pop-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: .5rem; }
.pop-card-header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.pop-nome { font-weight: 700; font-size: .92rem; color: var(--text); text-transform: capitalize; }
.pop-detalhe { font-size: .78rem; color: var(--text-2); }
.pop-pendencias { display: flex; flex-direction: column; gap: .35rem; margin-top: .3rem; padding-top: .5rem; border-top: 1px dashed var(--border); }
.pendencia-item { display: flex; align-items: center; gap: .5rem; font-size: .74rem; }
.pendencia-desc { flex: 1; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pendencia-dias { color: var(--text-3); font-family: var(--font-mono); white-space: nowrap; }
.btn-historico { align-self: flex-start; margin-top: .3rem; background: none; border: none; color: var(--accent); font-size: .76rem; font-weight: 600; cursor: pointer; padding: 0; }
.btn-historico:hover { text-decoration: underline; }

.vp-badge { display: inline-block; padding: .18rem .5rem; border-radius: 20px; font-size: .68rem; font-weight: 700; white-space: nowrap; }
.vp-badge-alerta { background: var(--error-bg); color: var(--error); }
.vp-badge-ok { background: var(--success-bg); color: var(--success); }
.vp-badge-critico { background: var(--error-bg); color: var(--error); }
.vp-badge-aviso { background: rgba(245, 158, 11, .12); color: #f59e0b; }

.alertas-lista { display: flex; flex-direction: column; gap: .7rem; }
.alerta-card { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--border); border-radius: var(--radius); padding: .9rem 1.1rem; display: flex; flex-direction: column; gap: .4rem; }
.alerta-critico { border-left-color: var(--error); }
.alerta-aviso { border-left-color: #f59e0b; }
.alerta-topo { display: flex; align-items: center; gap: .6rem; }
.alerta-badge { font-size: .64rem; font-weight: 700; padding: .15rem .5rem; border-radius: 20px; text-transform: uppercase; letter-spacing: .04em; }
.badge-critico { background: var(--error-bg); color: var(--error); }
.badge-aviso { background: rgba(245, 158, 11, .12); color: #f59e0b; }
.alerta-titulo { flex: 1; font-weight: 600; font-size: .85rem; color: var(--text); }
.alerta-descricao { font-size: .8rem; color: var(--text-2); }
.alerta-meta { font-size: .72rem; color: var(--text-3); }
.btn-resolver { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); border-radius: var(--radius-sm); padding: .3rem .7rem; font-size: .74rem; cursor: pointer; white-space: nowrap; }
.btn-resolver:hover:not(:disabled) { color: var(--text); border-color: var(--border-2); }
.btn-resolver:disabled { opacity: .5; cursor: not-allowed; }

.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0, .6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
.modal-content { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: 100%; padding: 1.5rem; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
.modal-historico { max-width: 480px; max-height: 80vh; overflow-y: auto; }
.modal-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: var(--text); text-transform: capitalize; }
.historico-lista { display: flex; flex-direction: column; gap: .6rem; }
.historico-item { border-bottom: 1px dashed var(--border); padding-bottom: .5rem; font-size: .82rem; }
.historico-cabecalho { display: flex; justify-content: space-between; color: var(--text-2); }
.historico-fotos { font-size: .74rem; color: var(--text-3); margin-top: .2rem; }
.modal-actions { display: flex; justify-content: flex-end; margin-top: 1rem; }
.btn-cancel { padding: .5rem 1rem; border-radius: var(--radius-sm); font-weight: 600; font-size: .85rem; cursor: pointer; background: transparent; color: var(--text-2); border: 1px solid var(--border); }
.btn-cancel:hover { background: var(--surface-3); color: var(--text); }
</style>

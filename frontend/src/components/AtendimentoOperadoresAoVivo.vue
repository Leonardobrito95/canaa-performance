<template>
  <div class="operadores-ao-vivo">
    <div class="op-header-row">
      <p class="op-desc">
        Acompanhamento em tempo real da "Sala de Controle". Atualiza automaticamente a cada 2 minutos. O TMA, TME e TMR representam a performance individual do dia até este instante.
      </p>
      <div class="op-legend">
        <span class="legend-item"><span class="dot on"></span>Online</span>
        <span class="legend-item"><span class="dot au"></span>Ausente</span>
        <span class="legend-item"><span class="dot pause"></span>Pausa</span>
      </div>
    </div>

    <div v-if="loading && !operadores.length" class="state-msg">
      <span class="loading-dots"><span/><span/><span/></span> Carregando operadores...
    </div>
    
    <div v-else-if="!operadores.length" class="state-msg">
      Nenhum operador online no momento.
    </div>

    <div v-else class="op-table-container">
      <table class="op-table">
        <thead>
          <tr>
            <th>Operador</th>
            <th>Setor</th>
            <th>Status (Tempo)</th>
            <th class="num">Volume Hoje</th>
            <th class="num" title="Mediana do Tempo de Espera das conversas que este operador assumiu (chat + ligação)">TME (Espera)</th>
            <th class="num" title="Mediana do Tempo de Atendimento individual do operador (chat + ligação)">TMA (Atendimento)</th>
            <th class="num" title="Mediana do Tempo de Resposta a mensagens, só chat, ligação não tem essa métrica">TMR (Resposta · chat)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="op in operadoresSorted" :key="op.nome">
            <td class="font-bold">{{ op.nome }}</td>
            <td class="td-setor"><span class="setor-badge" :style="{ backgroundColor: corSetor(op.setor) }">{{ nomeSetor(op.setor) }}</span></td>
            <td>
              <div class="status-cell">
                <span class="dot" :class="op.status"></span>
                <span class="status-text" :class="op.status">{{ textoStatus(op.status) }}</span>
                <span class="status-time">há {{ formatarDuracao(op.tempoStatusMs) }}</span>
              </div>
            </td>
            <td class="num font-mono">{{ op.volumeHoje }}</td>
            <td class="num font-mono">
              {{ formatarDuracao(op.tmeMs) }}
              <div v-if="op.volumeLigacao > 0" class="cel-canal">
                <span class="canal-chip canal-chip-chat"><i class="fa-solid fa-comment"></i>{{ formatarDuracao(op.tmeMsChat) }}</span>
                <span class="canal-chip canal-chip-lig"><i class="fa-solid fa-phone"></i>{{ formatarDuracao(op.tmeMsLigacao) }}</span>
              </div>
            </td>
            <td class="num font-mono">
              {{ formatarDuracao(op.tmaMs) }}
              <div v-if="op.volumeLigacao > 0" class="cel-canal">
                <span class="canal-chip canal-chip-chat"><i class="fa-solid fa-comment"></i>{{ formatarDuracao(op.tmaMsChat) }}</span>
                <span class="canal-chip canal-chip-lig"><i class="fa-solid fa-phone"></i>{{ formatarDuracao(op.tmaMsLigacao) }}</span>
              </div>
            </td>
            <td class="num font-mono">{{ formatarDuracao(op.tmrMs) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { atendimentoApiClient, NOMES_SETOR, CORES_SETOR, type SetorAtendimento, type OperadorAoVivo } from '../services/atendimentoApi';

const props = defineProps<{
  setores: SetorAtendimento[];
}>();

const operadores = ref<OperadorAoVivo[]>([]);
const loading = ref(false);

function nomeSetor(s: string) {
  return NOMES_SETOR[s as SetorAtendimento] ?? s;
}

function corSetor(s: string) {
  return CORES_SETOR[s as SetorAtendimento] ?? 'var(--text-3)';
}

function textoStatus(s: string) {
  if (s === 'on') return 'Online';
  if (s === 'au') return 'Ausente';
  if (s === 'pause') return 'Pausa';
  return s;
}

function formatarDuracao(ms: number | null): string {
  if (ms === null || ms === 0) return '—';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? `${m}m` : ''}`;
}

const operadoresSorted = computed(() => {
  return [...operadores.value].sort((a, b) => {
    // Ordenar primeiro por status (on > pause > au)
    const order = { on: 1, pause: 2, au: 3 };
    const aOrder = order[a.status] || 4;
    const bOrder = order[b.status] || 4;
    if (aOrder !== bOrder) return aOrder - bOrder;
    // Depois alfabético
    return a.nome.localeCompare(b.nome);
  });
});

async function carregar() {
  loading.value = true;
  try {
    const r = await atendimentoApiClient.getOperadoresAoVivo(props.setores);
    operadores.value = r.operadores;
  } catch (err) {
    console.error('Falha ao carregar operadores ao vivo', err);
  } finally {
    loading.value = false;
  }
}

let pollingId: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  carregar();
  // Atualiza sozinho a cada 2 minutos
  pollingId = setInterval(carregar, 120000);
});

onUnmounted(() => {
  if (pollingId) clearInterval(pollingId);
});
</script>

<style scoped>
.operadores-ao-vivo { width: 100%; display: flex; flex-direction: column; gap: 1rem; }

.op-header-row { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 0.5rem; }
.op-desc { font-size: .85rem; color: var(--text-2); max-width: 700px; line-height: 1.5; }
.op-legend { display: flex; gap: 1rem; background: var(--surface); padding: 0.5rem 1rem; border-radius: var(--radius); border: 1px solid var(--border); }
.legend-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.05em; }

.op-table-container { 
  width: 100%; 
  overflow-x: auto; 
  background: var(--surface); 
  border: 1px solid var(--border); 
  border-radius: var(--radius); 
  box-shadow: 0 4px 15px rgba(0,0,0,0.03);
}

.op-table { width: 100%; border-collapse: collapse; text-align: left; }
.op-table th { 
  padding: 1rem; 
  font-size: 0.75rem; 
  text-transform: uppercase; 
  letter-spacing: 0.05em; 
  color: var(--text-3); 
  font-weight: 700; 
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.op-table td { 
  padding: 1rem; 
  font-size: 0.85rem; 
  color: var(--text);
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.op-table tr:last-child td { border-bottom: none; }
.op-table tr:hover td { background: var(--hover); }

.num { text-align: right; }
.font-bold { font-weight: 600; }
.font-mono { font-family: var(--font-mono); font-weight: 600; }
.cel-canal { display: flex; justify-content: flex-end; gap: .3rem; margin-top: .25rem; }
.canal-chip {
  display: inline-flex; align-items: center; gap: .3rem;
  font-family: var(--font-mono); font-size: .64rem; font-weight: 600; color: var(--text-2);
  background: var(--bg); border-radius: 5px; padding: .1rem .4rem; white-space: nowrap;
}
.canal-chip i { font-size: .6rem; }
.canal-chip-chat { color: var(--accent); }
.canal-chip-chat i { color: var(--accent); }
.canal-chip-lig { color: var(--warning); }
.canal-chip-lig i { color: var(--warning); }

.setor-badge { 
  padding: 0.2rem 0.6rem; 
  border-radius: 12px; 
  font-size: 0.7rem; 
  font-weight: 700; 
  color: #000; 
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.status-cell { display: flex; align-items: center; gap: 0.5rem; }
.status-text { font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
.status-time { font-size: 0.75rem; color: var(--text-3); }

.status-text.on { color: var(--success); }
.status-text.au { color: var(--warning); }
.status-text.pause { color: var(--warning); }

.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.on { background: var(--success); box-shadow: 0 0 8px var(--success); }
.dot.au { background: var(--warning); opacity: 0.7; }
.dot.pause { background: var(--warning); opacity: 0.7; }

.state-msg { padding: 3rem 1rem; text-align: center; color: var(--text-3); font-size: 0.9rem; border: 1px solid var(--border); border-radius: var(--radius); }
.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--text-3); animation: dot-pulse 1.1s ease-in-out infinite; }
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
</style>

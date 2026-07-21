<template>
  <div class="live-stats">
    <div class="stat-live" :class="{ 'stat-live-ativo': emLigacaoAgora > 0 }">
      <i class="fa-solid fa-phone"></i>
      <div class="stat-live-body">
        <span class="stat-live-value">{{ emLigacaoAgora }}</span>
        <span class="stat-live-label">Em ligação agora</span>
      </div>
    </div>
    <div class="stat-live" :class="{ 'stat-live-critico': filaCritica }" :title="filaCritica ? `Acima do limiar de ${LIMIAR_FILA_CRITICA} clientes na fila` : ''">
      <i :class="filaCritica ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-hourglass-half'"></i>
      <div class="stat-live-body">
        <span class="stat-live-value">{{ naFilaAgora }}</span>
        <span class="stat-live-label">Na fila de espera</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { atendimentoApiClient, type SetorAtendimento } from '../services/atendimentoApi';

const props = defineProps<{
  setores: SetorAtendimento[];
}>();

// Mesmo limiar do alerta de WhatsApp pra gestora (backend,
// LIMIAR_FILA_CRITICA_WHATSAPP em atendimento.alerta-fila-whatsapp.ts). Não
// compartilha config de verdade entre front/back neste monorepo, mas o
// número tem que ser o mesmo pros dois lados contarem a mesma história.
const LIMIAR_FILA_CRITICA = 5;

const operadores  = ref<{ status: string }[]>([]);
const naFilaAgora = ref(0);

const emLigacaoAgora = computed(() => operadores.value.filter((op) => op.status === 'call').length);
const filaCritica     = computed(() => naFilaAgora.value > LIMIAR_FILA_CRITICA);

async function carregar() {
  try {
    const [opRes, filaRes] = await Promise.all([
      atendimentoApiClient.getOperadoresAoVivo(props.setores),
      atendimentoApiClient.getFilaAoVivo(props.setores),
    ]);
    operadores.value = opRes.operadores;
    naFilaAgora.value = filaRes.naFila;
  } catch (err) {
    console.error('Falha ao carregar estatísticas ao vivo de atendimento', err);
  }
}

let pollingId: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  carregar();
  pollingId = setInterval(carregar, 120000);
});
onUnmounted(() => { if (pollingId) clearInterval(pollingId); });
</script>

<style scoped>
.live-stats { display: flex; gap: 1rem; flex-wrap: wrap; }
.stat-live {
  display: flex; align-items: center; gap: .75rem;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: .75rem 1.25rem; min-width: 180px; transition: all var(--transition);
}
.stat-live i { font-size: 1.1rem; color: var(--accent); transition: all var(--transition); }
.stat-live-body { display: flex; flex-direction: column; }
.stat-live-value { font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; color: var(--text); line-height: 1.1; }
.stat-live-label { font-size: .7rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .05em; }

/* Em ligação: pulso sutil só pra indicar atividade ao vivo, não é alerta,
   por isso não muda de cor, só "respira". */
.stat-live-ativo i { animation: pulso-ligacao 2s ease-in-out infinite; }
@keyframes pulso-ligacao {
  0%, 100% { text-shadow: 0 0 0 transparent; }
  50%      { text-shadow: 0 0 10px var(--accent-glow); }
}

/* Fila acima do limiar: vira vermelho e troca o ícone, não depende só da
   cor pra ficar claro que é crítico. */
.stat-live-critico { border-color: var(--error); background: var(--error-bg); }
.stat-live-critico i,
.stat-live-critico .stat-live-value { color: var(--error); }
</style>

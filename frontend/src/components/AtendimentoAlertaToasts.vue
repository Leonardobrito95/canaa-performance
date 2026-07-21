<template>
  <Teleport to="body">
    <div class="alerta-toasts">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          :class="['alerta-toast', t.severidade.toLowerCase()]"
          @click="fechar(t.id)"
        >
          <i :class="['fa-solid', t.severidade === 'CRITICO' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation']"></i>
          <div class="alerta-toast-corpo">
            <span class="alerta-toast-titulo">{{ t.titulo }}</span>
            <span class="alerta-toast-desc">{{ t.descricao }}</span>
          </div>
          <button class="alerta-toast-fechar" @click.stop="fechar(t.id)" aria-label="Fechar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Notificação flutuante pra alerta operacional NOVO de Atendimento (conversa
// parada, SLA de fila, agente ausente, fila acumulada, fila crítica).
// Aparece em qualquer aba do app (não só dentro de Atendimento), some
// sozinha depois de alguns segundos. Reaproveita o mesmo endpoint da aba
// Alertas, com polling próprio e independente.
import { ref, onMounted, onUnmounted } from 'vue';
import { atendimentoApiClient, type AlertaOperacional } from '../services/atendimentoApi';

interface Toast {
  id:         string;
  titulo:     string;
  descricao:  string;
  severidade: string;
}

const DURACAO_MS = 10000;
const INTERVALO_POLLING_MS = 30000;

const toasts = ref<Toast[]>([]);
const idsConhecidos = new Set<string>();
// Na primeira carga, só registra o que já está aberto, não notifica,
// senão todo alerta pré-existente viraria um toast assim que o app abre.
let primeiraCarga = true;

function fechar(id: string) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

function mostrar(a: AlertaOperacional) {
  toasts.value.push({ id: a.id, titulo: a.titulo, descricao: a.descricao, severidade: a.severidade });
  setTimeout(() => fechar(a.id), DURACAO_MS);
}

async function verificar() {
  try {
    const r = await atendimentoApiClient.getAlertasOperacionais();
    for (const a of r.itens) {
      if (idsConhecidos.has(a.id)) continue;
      idsConhecidos.add(a.id);
      if (!primeiraCarga) mostrar(a);
    }
    primeiraCarga = false;
  } catch {
    // Notificação é um extra, uma falha aqui nunca pode quebrar o resto do app.
  }
}

let pollingId: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  verificar();
  pollingId = setInterval(verificar, INTERVALO_POLLING_MS);
});
onUnmounted(() => { if (pollingId) clearInterval(pollingId); });
</script>

<style scoped>
.alerta-toasts {
  position: fixed; top: 1.25rem; right: 1.25rem; z-index: 9999;
  display: flex; flex-direction: column; gap: .6rem;
  width: 340px; max-width: calc(100vw - 2rem);
  pointer-events: none;
}
.alerta-toast {
  pointer-events: auto;
  display: flex; align-items: flex-start; gap: .65rem;
  background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--warning);
  border-radius: var(--radius); padding: .85rem 1rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  cursor: pointer;
}
.alerta-toast.critico { border-left-color: var(--error); }
.alerta-toast i { font-size: 1rem; margin-top: .1rem; color: var(--warning); }
.alerta-toast.critico i { color: var(--error); }
.alerta-toast-corpo { display: flex; flex-direction: column; gap: .2rem; flex: 1; min-width: 0; }
.alerta-toast-titulo { font-size: .85rem; font-weight: 700; color: var(--text); }
.alerta-toast-desc { font-size: .78rem; color: var(--text-2); line-height: 1.4; }
.alerta-toast-fechar { background: none; border: none; color: var(--text-3); cursor: pointer; padding: .1rem; flex-shrink: 0; }
.alerta-toast-fechar:hover { color: var(--text); }

.toast-enter-active, .toast-leave-active { transition: all .25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(30px); }
</style>

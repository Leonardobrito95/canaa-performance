<template>
  <div :class="['alerta-card', alerta.severidade.toLowerCase()]">
    <div class="alerta-header">
      <span :class="['alerta-origem', alerta.origem]">{{ tituloOrigem }}</span>
      <span class="alerta-tempo">{{ tempoRelativo }}</span>
    </div>
    <h3 class="alerta-titulo">
      <i :class="['fa-solid', iconeSeveridade, corSeveridade]"></i> 
      {{ tituloLimpo }}
    </h3>
    <p class="alerta-desc">{{ alerta.descricao }}</p>
    <div class="alerta-footer">
      <span v-if="alerta.contexto" class="alerta-contexto">
        <i class="fa-solid fa-location-dot"></i> {{ alerta.contexto }}
      </span>
      <button v-if="podeResolver" class="btn-resolver" @click="$emit('resolver', alerta)" :disabled="resolvendo">
        <i class="fa-solid fa-check" v-if="!resolvendo"></i>
        <i class="fa-solid fa-spinner fa-spin" v-else></i>
        Resolver
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  alerta: {
    id: string;
    origem: 'atendimento' | 'vistoria' | string;
    severidade: string;
    titulo: string;
    descricao: string;
    contexto?: string | null;
    criado_em: string | Date;
  };
  podeResolver?: boolean;
  resolvendo?: boolean;
}>();

defineEmits<{ (e: 'resolver', alerta: any): void }>();

const tituloOrigem = computed(() => {
  if (props.alerta.origem === 'atendimento') return 'Atendimento';
  if (props.alerta.origem === 'vistoria') return 'Infraestrutura';
  return props.alerta.origem;
});

const tempoRelativo = computed(() => {
  const d = new Date(props.alerta.criado_em);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
});
const tituloLimpo = computed(() => {
  // Remove o travessão ou hífen usado como separador
  return props.alerta.titulo.replace(/\s*[—\-]\s*/g, ' - ').replace(' - ', ' ').trim();
});

const iconeSeveridade = computed(() => {
  return props.alerta.severidade.toLowerCase() === 'critico' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation';
});

const corSeveridade = computed(() => {
  return props.alerta.severidade.toLowerCase() === 'critico' ? 'text-critico' : 'text-aviso';
});
</script>

<style scoped>
.alerta-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.1rem; display: flex; flex-direction: column; gap: .85rem; transition: border-color var(--transition); }
.alerta-card:hover { border-color: var(--border-2); }

.alerta-header { display: flex; justify-content: space-between; align-items: center; font-size: .7rem; font-family: var(--font-mono); }
.alerta-origem { padding: .15rem .4rem; border-radius: 4px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; background: var(--surface-2); color: var(--text-2); }
.alerta-origem.atendimento { color: var(--accent); background: rgba(0, 212, 255, 0.1); }
.alerta-origem.vistoria { color: #f59e0b; background: rgba(245, 158, 11, 0.1); }
.alerta-tempo { color: var(--text-3); font-weight: 600; }

.alerta-titulo { font-size: .95rem; font-weight: 600; margin: 0; color: var(--text); line-height: 1.3; display: flex; align-items: flex-start; gap: .5rem; }
.text-critico { color: var(--error); font-size: 1rem; margin-top: .15rem; }
.text-aviso { color: #f59e0b; font-size: 1rem; margin-top: .15rem; }
.alerta-desc { font-size: .8rem; color: var(--text-2); line-height: 1.5; flex-grow: 1; padding-left: 1.5rem; }

.alerta-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: .85rem; border-top: 1px solid var(--border); }
.alerta-contexto { font-size: .75rem; color: var(--text-3); display: flex; align-items: center; gap: .4rem; text-transform: capitalize; }
.alerta-contexto i { color: var(--text-2); }

.btn-resolver { background: transparent; color: var(--text-2); border: 1px solid var(--border); padding: .35rem .75rem; border-radius: var(--radius-sm); cursor: pointer; font-size: .75rem; font-weight: 600; display: flex; gap: .4rem; align-items: center; transition: all var(--transition); }
.btn-resolver:hover:not(:disabled) { background: var(--success-bg); color: var(--success); border-color: rgba(199,255,0,0.3); }
.btn-resolver:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

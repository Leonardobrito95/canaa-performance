<template>
  <div class="chart-ranking-wrap">
    <div class="ranking-header">
      <span class="chart-title">{{ title }}</span>
      <div class="metric-toggle">
        <button :class="['tog', { active: metric === 'count' }]" @click="metric = 'count'">Qtd</button>
        <button :class="['tog', { active: metric === 'value' }]" @click="metric = 'value'">Valor</button>
      </div>
    </div>

    <div class="ranking-list">
      <div
        v-for="(item, i) in topItems"
        :key="item.name"
        :class="['rank-row', { 'rank-highlight': highlightName && item.name === highlightName }]"
        :style="{ animationDelay: `${i * 0.07}s` }"
      >
        <span class="rank-pos">{{ i + 1 }}</span>
        <div class="rank-info">
          <div class="rank-name-row">
            <span class="rank-name">{{ item.name }}</span>
            <span class="rank-val">{{ item.displayValue ?? (metric === 'value' ? fmtR(item.value) : item.count) }}</span>
          </div>
          <div class="rank-bar-bg">
            <div
              class="rank-bar-fill"
              :style="{
                width: `${pct(metric === 'value' ? item.value : item.count)}%`,
                background: barColor(i),
              }"
            />
          </div>
        </div>
      </div>

      <div v-if="!topItems.length" class="rank-empty">Sem dados</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface RankItem { name: string; count: number; value: number; displayValue?: string; }

const props = defineProps<{
  title: string;
  items: RankItem[];
  maxItems?: number;
  highlightName?: string;
  /// Quando a cor da barra não representa categoria/setor nenhum (ex: ranking
  /// de atendentes, motivos de atendimento — é só ordem), o multicolorido vira
  /// ruído visual. Nesses casos usa só a cor de destaque do tema, com opacidade
  /// decrescente por posição, em vez da paleta padrão.
  monochrome?: boolean;
}>();

const metric = ref<'count' | 'value'>('count');

const topItems = computed(() => {
  const sorted = [...props.items].sort((a, b) =>
    metric.value === 'value' ? b.value - a.value : b.count - a.count
  );
  return sorted.slice(0, props.maxItems ?? 8);
});

const maxRaw = computed(() => {
  if (!topItems.value.length) return 1;
  return metric.value === 'value'
    ? Math.max(...topItems.value.map((x) => x.value))
    : Math.max(...topItems.value.map((x) => x.count));
});

function pct(v: number) { return maxRaw.value ? (v / maxRaw.value) * 100 : 0; }

const COLORS = ['#00f0ff', '#c7ff00', '#a855f7', '#f59e0b', '#f472b6', '#34d399', '#60a5fa', '#fb923c'];
function barColor(i: number) {
  if (props.monochrome) {
    // --accent (#00f0ff) com opacidade decrescente por posição — foca a
    // atenção no comprimento da barra, não numa cor sem significado.
    const opacity = Math.max(1 - i * 0.09, 0.35);
    return `rgba(0, 240, 255, ${opacity})`;
  }
  return COLORS[i % COLORS.length];
}

const fmtR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
</script>

<style scoped>
.chart-ranking-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: .7rem;
}
.ranking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.chart-title {
  font-size: .7rem;
  font-weight: 700;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: .08em;
}
.metric-toggle {
  display: flex;
  gap: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px;
}
.tog {
  background: none;
  border: none;
  color: var(--text-3);
  font-size: .68rem;
  font-weight: 600;
  padding: .2rem .5rem;
  cursor: pointer;
  border-radius: 2px;
  font-family: var(--font-body);
  text-transform: uppercase;
  letter-spacing: .05em;
  transition: all .15s;
}
.tog.active { background: var(--accent-dim); color: var(--accent); }

.ranking-list { display: flex; flex-direction: column; gap: .45rem; }

.rank-row {
  display: flex;
  align-items: center;
  gap: .6rem;
  animation: rankSlide .35s cubic-bezier(.4,0,.2,1) both;
}
@keyframes rankSlide {
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: none; }
}
.rank-pos {
  font-family: var(--font-mono);
  font-size: .7rem;
  color: var(--text-3);
  width: 14px;
  text-align: right;
  flex-shrink: 0;
}
.rank-info { flex: 1; min-width: 0; }
.rank-name-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: .2rem;
}
.rank-name {
  font-size: .78rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
}
.rank-val {
  font-family: var(--font-mono);
  font-size: .75rem;
  font-weight: 700;
  color: var(--text);
  flex-shrink: 0;
}
.rank-bar-bg {
  height: 8px;
  background: var(--surface-3);
  border-radius: 4px;
  overflow: hidden;
}
.rank-bar-fill {
  height: 100%;
  border-radius: 4px;
  animation: barGrow .6s cubic-bezier(.4,0,.2,1) both;
  animation-delay: inherit;
}
@keyframes barGrow {
  from { width: 0 !important; }
}
.rank-empty { color: var(--text-3); font-size: .8rem; text-align: center; padding: 1rem; }

.rank-highlight {
  background: rgba(0, 240, 255, 0.05);
  border-radius: 4px;
  padding: 2px 4px;
  margin: -2px -4px;
  outline: 1px solid rgba(0, 240, 255, 0.2);
}
.rank-highlight .rank-name { color: var(--accent); }
.rank-highlight .rank-val  { color: var(--accent); }
</style>

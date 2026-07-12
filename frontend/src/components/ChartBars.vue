<template>
  <div class="chart-bars-wrap">
    <div class="chart-title">{{ title }}</div>
    <div class="bars-body">
      <svg :viewBox="`0 0 ${W} ${H}`" class="bars-svg" preserveAspectRatio="xMidYMid meet">
        <!-- Grid lines -->
        <line
          v-for="tick in gridTicks"
          :key="tick"
          :x1="PAD_L" :y1="yPos(tick)"
          :x2="W - PAD_R" :y2="yPos(tick)"
          stroke="var(--border)"
          stroke-width="1"
        />
        <!-- Bars -->
        <g v-for="(bar, i) in bars" :key="i">
          <rect
            :x="barX(i)"
            :y="H - PAD_B"
            :width="BAR_W"
            height="0"
            :fill="bar.color"
            rx="2"
            class="bar-rect"
            :style="{ '--bar-y': `${yPos(bar.value)}px`, '--bar-h': `${H - PAD_B - yPos(bar.value)}px`, animationDelay: `${i * 0.1}s` }"
          />
          <!-- Value label -->
          <text
            :x="barX(i) + BAR_W / 2"
            :y="yPos(bar.value) - 5"
            text-anchor="middle"
            class="bar-val"
            :fill="bar.color"
          >{{ bar.value }}</text>
          <!-- X label — rotacionado pra não encavalar com muitas categorias (ex:
               8 setores de atendimento); tooltip nativo cobre o nome completo. -->
          <text
            :x="barX(i) + BAR_W / 2"
            :y="H - PAD_B + 9"
            text-anchor="end"
            :transform="`rotate(-40, ${barX(i) + BAR_W / 2}, ${H - PAD_B + 9})`"
            class="bar-lbl"
          >{{ bar.label }}<title>{{ bar.label }}: {{ bar.value }}</title></text>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Bar { label: string; value: number; color: string; }

const props = defineProps<{ title: string; bars: Bar[] }>();

const W = 260; const H = 160;
// PAD_B maior que o padrão pra caber o rótulo do eixo X rotacionado (-40°)
// sem cortar nem encavalar, mesmo com várias categorias (ex: 8 setores).
const PAD_L = 30; const PAD_R = 10; const PAD_T = 20; const PAD_B = 40;
const INNER_H = H - PAD_T - PAD_B;

const BAR_W = computed(() => {
  const count = props.bars.length || 1;
  const avail = W - PAD_L - PAD_R;
  return Math.min(42, (avail / count) * 0.55);
});

const maxVal = computed(() => Math.max(...props.bars.map((b) => b.value), 1));

function yPos(v: number) { return PAD_T + INNER_H * (1 - v / maxVal.value); }

function barX(i: number) {
  const count  = props.bars.length || 1;
  const avail  = W - PAD_L - PAD_R;
  const slot   = avail / count;
  return PAD_L + slot * i + (slot - BAR_W.value) / 2;
}

const gridTicks = computed(() => {
  const max = maxVal.value;
  const step = Math.ceil(max / 4);
  return [0, step, step * 2, step * 3, step * 4].filter((t) => t <= max + step);
});
</script>

<style scoped>
.chart-bars-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: .6rem;
  height: 100%;
}
.chart-title {
  font-size: .7rem;
  font-weight: 700;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: .08em;
}
.bars-body { display: flex; justify-content: center; align-items: center; flex: 1; }
.bars-svg  { width: 100%; max-width: 320px; height: 100%; min-height: 130px; overflow: visible; }

.bar-rect {
  animation: barRise .5s cubic-bezier(.4,0,.2,1) both;
}
@keyframes barRise {
  from { y: calc(160px - 40px); height: 0; opacity: 0; }
  to   { y: var(--bar-y); height: var(--bar-h); opacity: 1; }
}

.bar-val {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  animation: fadeIn .4s ease both;
  animation-delay: .3s;
}
.bar-lbl {
  font-size: 9px;
  fill: var(--text-3);
  text-transform: uppercase;
  letter-spacing: .04em;
}
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>

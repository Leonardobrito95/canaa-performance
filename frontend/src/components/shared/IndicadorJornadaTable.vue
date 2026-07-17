<template>
  <div class="jornada-wrap">
    <p v-if="indicadores.length" class="jornada-aviso-ligacao">
      Atendimento por ligação (telefone) ainda tem medição limitada: TMA e TME são as fontes
      confiáveis hoje, mas volume e eficiência aqui podem sair mais baixos que o real pra quem
      atende muito por ligação. O setor mostrado também pode não refletir o time real do operador
      quando ele atende fora do próprio departamento.
    </p>

    <!-- KPIs agregados do período/filtro atual -->
    <div v-if="indicadores.length" class="jornada-kpis">
      <div class="jornada-kpi">
        <span class="jornada-kpi-label">Volume total</span>
        <span class="jornada-kpi-valor">{{ kpisAgregados.volumeTotal }}</span>
        <span class="jornada-kpi-detalhe">atendimentos</span>
      </div>
      <div class="jornada-kpi">
        <span class="jornada-kpi-label">Eficiência média</span>
        <span class="jornada-kpi-valor">{{ kpisAgregados.eficienciaMedia !== null ? `${kpisAgregados.eficienciaMedia}/h` : '—' }}</span>
        <span class="jornada-kpi-detalhe">atendimentos por hora produtiva</span>
      </div>
      <div class="jornada-kpi">
        <span class="jornada-kpi-label">Índice de produtividade</span>
        <span class="jornada-kpi-valor">{{ kpisAgregados.indiceProdutividade !== null ? `${kpisAgregados.indiceProdutividade}%` : '—' }}</span>
        <span class="jornada-kpi-detalhe">do tempo logado</span>
      </div>
      <div class="jornada-kpi">
        <span class="jornada-kpi-label">Taxa de indisponibilidade</span>
        <span class="jornada-kpi-valor">{{ kpisAgregados.taxaIndisponibilidade !== null ? `${kpisAgregados.taxaIndisponibilidade}%` : '—' }}</span>
        <span class="jornada-kpi-detalhe">ausente + pausa</span>
      </div>
    </div>

    <!-- Filtros da lista -->
    <div v-if="indicadores.length" class="jornada-filtros">
      <div class="jornada-setor-chips">
        <button
          v-for="s in setoresPresentes"
          :key="s"
          type="button"
          :class="['jornada-setor-chip', { active: setoresFiltro.includes(s) }]"
          :style="setoresFiltro.includes(s) ? { borderColor: CORES_SETOR[s], color: CORES_SETOR[s] } : {}"
          @click="toggleSetorFiltro(s)"
        >
          {{ NOMES_SETOR[s] ?? s }}
        </button>
        <button v-if="setoresFiltro.length !== setoresPresentes.length" type="button" class="jornada-filtro-acao" @click="setoresFiltro = [...setoresPresentes]">Todos</button>
      </div>
      <input v-model="busca" type="text" class="jornada-busca" placeholder="Buscar operador..." />
    </div>

    <div v-if="!indicadores.length" class="state-msg">Nenhum operador com dado de jornada neste período.</div>
    <div v-else-if="!indicadoresOrdenados.length" class="state-msg">Nenhum operador bate com o filtro atual.</div>
    <div v-else class="jornada-table-container">
      <table class="jornada-table">
        <thead>
          <tr>
            <th class="sortable" @click="ordenarPor('nome')">Operador<span class="seta">{{ setaDe('nome') }}</span></th>
            <th>Setor</th>
            <th class="num sortable" @click="ordenarPor('volumeAtendimentos')">Atendimentos<span class="seta">{{ setaDe('volumeAtendimentos') }}</span></th>
            <th class="num sortable" @click="ordenarPor('tempoLogadoMs')">Tempo logado<span class="seta">{{ setaDe('tempoLogadoMs') }}</span></th>
            <th class="num sortable" @click="ordenarPor('eficiencia')" title="Atendimentos por hora produtiva: normaliza o volume pelo tempo de fato disponível, pra comparar quem trabalhou mais horas com quem trabalhou menos">
              Eficiência<span class="seta">{{ setaDe('eficiencia') }}</span>
            </th>
            <th class="num sortable" @click="ordenarPor('pctProdutivo')" title="Tempo em status Online, Ocupado ou Em ligação">Produtivo<span class="seta">{{ setaDe('pctProdutivo') }}</span></th>
            <th class="num sortable" @click="ordenarPor('pctPausa')">Pausa<span class="seta">{{ setaDe('pctPausa') }}</span></th>
            <th class="num sortable" @click="ordenarPor('pctAusente')" title="Fora do sistema durante o expediente, sem ser pausa formal: o sinal mais direto de algo que merece uma conversa">Ausente<span class="seta">{{ setaDe('pctAusente') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="op in indicadoresOrdenados" :key="op.nome">
            <td class="font-bold">{{ op.nome }}<span v-if="ehTerceirizado(op.nome)" class="tag-terceirizado">Terceirizado</span></td>
            <td><span class="setor-badge-jornada" :style="{ backgroundColor: CORES_SETOR[op.setor] }">{{ NOMES_SETOR[op.setor] ?? op.setor }}</span></td>
            <td class="num font-mono">{{ op.volumeAtendimentos }}</td>
            <td class="num font-mono">{{ formatarHoras(op.tempoLogadoMs) }}</td>
            <td class="num font-mono" :class="classeEficiencia(op)">
              {{ op.amostraPequena ? 'amostra pequena' : (op.eficiencia !== null ? `${op.eficiencia}/h` : '—') }}
            </td>
            <td class="num font-mono">{{ formatarHoras(op.tempoProdutivoMs) }} <span v-if="op.pctProdutivo !== null" class="pct">({{ op.pctProdutivo }}%)</span></td>
            <td class="num font-mono">{{ formatarHoras(op.tempoPausaMs) }} <span v-if="op.pctPausa !== null" class="pct">({{ op.pctPausa }}%)</span></td>
            <td class="num font-mono" :class="{ 'valor-alerta': op.pctAusente !== null && op.pctAusente > config.limiteIndisponibilidadePct }">
              {{ formatarHoras(op.tempoAusenteMs) }} <span v-if="op.pctAusente !== null" class="pct">({{ op.pctAusente }}%)</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { atendimentoApiClient, NOMES_SETOR, CORES_SETOR, type IndicadorJornadaOperador, type SetorAtendimento, type ConfigJornada } from '../../services/atendimentoApi';

const props = defineProps<{
  indicadores: IndicadorJornadaOperador[];
}>();

// Aprimorar é empresa terceirizada que reforça o Centro de Solução (não é
// conta de teste) — marcada visualmente pra não confundir com quadro próprio.
function ehTerceirizado(nome: string): boolean {
  return /^aprimorar/i.test(nome);
}

function formatarHoras(ms: number): string {
  if (ms <= 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return `${h}h${m > 0 ? `${m}min` : ''}`;
  const d = Math.floor(h / 24);
  const hRestante = h % 24;
  return `${d}d${hRestante > 0 ? ` ${hRestante}h` : ''}`;
}

// Limites configurados pela gestão (Regras de Negócio, categoria ATENDIMENTO):
// busca 1x, RBAC já garante que só quem vê essa tabela chega aqui. Sem regra
// cadastrada, o backend já devolve um padrão sensato (15% ausente).
const config = ref<ConfigJornada>({ limiteIndisponibilidadePct: 15, metasEficienciaPorSetor: {} });
onMounted(async () => {
  try {
    config.value = await atendimentoApiClient.getConfigJornada();
  } catch {
    // Mantém o padrão local se a busca falhar, não trava a tabela por isso.
  }
});

// Eficiência: atendimentos por hora produtiva. Volume bruto sozinho não é
// comparável entre quem logou 8h e quem logou 2h; essa é a métrica
// normalizada que de fato responde "quem rende mais por hora de trabalho".
// Abaixo de 30min produtivos no período a divisão fica instável (poucos
// minutos no denominador geram número irrealista): sinaliza "amostra
// pequena" em vez de mostrar um valor enganoso.
const AMOSTRA_MINIMA_MS = 30 * 60 * 1000;

type ComEficiencia = IndicadorJornadaOperador & { eficiencia: number | null; amostraPequena: boolean };

const comEficiencia = computed<ComEficiencia[]>(() =>
  props.indicadores.map((op) => {
    const amostraPequena = op.tempoProdutivoMs < AMOSTRA_MINIMA_MS;
    return {
      ...op,
      amostraPequena,
      eficiencia: op.tempoProdutivoMs > 0 && !amostraPequena
        ? Math.round((op.volumeAtendimentos / (op.tempoProdutivoMs / 3600000)) * 10) / 10
        : null,
    };
  }),
);

function classeEficiencia(op: ComEficiencia): string {
  if (op.eficiencia === null) return '';
  const meta = config.value.metasEficienciaPorSetor[op.setor];
  if (meta === undefined) return '';
  return op.eficiencia >= meta ? 'valor-ok' : 'valor-alerta';
}

// Setores que de fato aparecem nesta lista (evita mostrar chip de setor sem
// nenhum operador, ex: Vendas dentro da tela do Centro de Solução).
const setoresPresentes = computed<SetorAtendimento[]>(() => {
  const vistos = new Set<SetorAtendimento>();
  for (const op of props.indicadores) vistos.add(op.setor);
  return Array.from(vistos).sort();
});

const setoresFiltro = ref<SetorAtendimento[]>([]);
function toggleSetorFiltro(s: SetorAtendimento) {
  // Primeiro clique num universo "tudo selecionado" (implícito) vira um
  // filtro explícito só daquele setor, não desmarca 1 de N.
  if (!setoresFiltro.value.length) { setoresFiltro.value = [s]; return; }
  const idx = setoresFiltro.value.indexOf(s);
  if (idx >= 0) setoresFiltro.value.splice(idx, 1);
  else setoresFiltro.value.push(s);
}

const busca = ref('');

const filtrados = computed(() => {
  const setoresAtivos = setoresFiltro.value.length ? setoresFiltro.value : setoresPresentes.value;
  const termo = busca.value.trim().toLowerCase();
  return comEficiencia.value.filter((op) =>
    setoresAtivos.includes(op.setor) && (!termo || op.nome.toLowerCase().includes(termo)),
  );
});

// KPIs somados de verdade (não média de percentuais): evita que 1 operador
// com pouquíssimo tempo logado distorça a média geral da operação.
const kpisAgregados = computed(() => {
  const lista = filtrados.value;
  const volumeTotal = lista.reduce((s, op) => s + op.volumeAtendimentos, 0);
  const tempoProdutivoTotal = lista.reduce((s, op) => s + op.tempoProdutivoMs, 0);
  const tempoLogadoTotal = lista.reduce((s, op) => s + op.tempoLogadoMs, 0);
  const tempoIndisponivelTotal = lista.reduce((s, op) => s + op.tempoAusenteMs + op.tempoPausaMs, 0);

  return {
    volumeTotal,
    eficienciaMedia: tempoProdutivoTotal > 0 ? Math.round((volumeTotal / (tempoProdutivoTotal / 3600000)) * 10) / 10 : null,
    indiceProdutividade: tempoLogadoTotal > 0 ? Math.round((tempoProdutivoTotal / tempoLogadoTotal) * 1000) / 10 : null,
    taxaIndisponibilidade: tempoLogadoTotal > 0 ? Math.round((tempoIndisponivelTotal / tempoLogadoTotal) * 1000) / 10 : null,
  };
});

type ColunaOrdenavel = 'nome' | 'volumeAtendimentos' | 'tempoLogadoMs' | 'eficiencia' | 'pctProdutivo' | 'pctPausa' | 'pctAusente';

// Padrão pedido pela gestão: melhor eficiência primeiro (reconhecimento),
// não mais ausência primeiro. O destaque visual em vermelho já cobre os
// casos de atenção em qualquer posição da lista.
const colunaOrdenacao = ref<ColunaOrdenavel>('eficiencia');
const ordemDesc = ref(true);

function ordenarPor(coluna: ColunaOrdenavel) {
  if (colunaOrdenacao.value === coluna) {
    ordemDesc.value = !ordemDesc.value;
  } else {
    colunaOrdenacao.value = coluna;
    ordemDesc.value = true;
  }
}

function setaDe(coluna: ColunaOrdenavel): string {
  if (colunaOrdenacao.value !== coluna) return '';
  return ordemDesc.value ? ' ↓' : ' ↑';
}

const indicadoresOrdenados = computed(() => {
  const col = colunaOrdenacao.value;
  const sinal = ordemDesc.value ? -1 : 1;
  return [...filtrados.value].sort((a, b) => {
    const va = a[col];
    const vb = b[col];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'string' || typeof vb === 'string') {
      return sinal * String(va).localeCompare(String(vb));
    }
    return sinal * ((va as number) - (vb as number));
  });
});
</script>

<style scoped>
.jornada-wrap { display: flex; flex-direction: column; gap: 1rem; }

.jornada-aviso-ligacao {
  font-size: .78rem; color: var(--text-2); line-height: 1.5; margin: 0;
  padding: .6rem .9rem; background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.jornada-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: .8rem; }
@media (max-width: 900px) { .jornada-kpis { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 500px) { .jornada-kpis { grid-template-columns: 1fr; } }
.jornada-kpi {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: .9rem 1rem; display: flex; flex-direction: column; gap: .25rem;
}
.jornada-kpi-label { font-size: .68rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.jornada-kpi-valor { font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; color: var(--text); }
.jornada-kpi-detalhe { font-size: .7rem; color: var(--text-2); }

.jornada-filtros { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .75rem; }
.jornada-setor-chips { display: flex; flex-wrap: wrap; gap: .4rem; }
.jornada-setor-chip {
  background: var(--surface); border: 1px solid var(--border); color: var(--text-2);
  padding: .3rem .7rem; border-radius: 20px; font-size: .75rem; font-weight: 600;
  cursor: pointer; transition: all var(--transition);
}
.jornada-setor-chip:hover { border-color: var(--border-2); color: var(--text); }
.jornada-setor-chip.active { font-weight: 700; }
.jornada-filtro-acao { background: none; border: none; color: var(--text-3); text-decoration: underline; font-size: .75rem; cursor: pointer; }
.jornada-filtro-acao:hover { color: var(--text); }

.jornada-busca {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--text); padding: .45rem .8rem; font-size: .82rem; min-width: 220px;
}
.jornada-busca:focus { outline: none; border-color: var(--accent); }

.state-msg { padding: 3rem 1rem; text-align: center; color: var(--text-3); font-size: 0.9rem; border: 1px solid var(--border); border-radius: var(--radius); }

.jornada-table-container {
  width: 100%;
  overflow-x: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.jornada-table { width: 100%; border-collapse: collapse; text-align: left; }
.jornada-table th {
  padding: .85rem 1rem;
  font-size: .7rem;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--text-3);
  font-weight: 700;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.jornada-table td { padding: .8rem 1rem; font-size: .85rem; color: var(--text); border-bottom: 1px solid var(--border); vertical-align: middle; }
.jornada-table tr:last-child td { border-bottom: none; }
.jornada-table tr:hover td { background: var(--hover); }

.jornada-table .num { text-align: right; }
.jornada-table .font-bold { font-weight: 600; }
.jornada-table .font-mono { font-family: var(--font-mono); font-weight: 600; }
.jornada-table .pct { font-family: var(--font-mono); font-weight: 400; color: var(--text-3); font-size: .78rem; }

.jornada-table th.sortable { cursor: pointer; user-select: none; }
.jornada-table th.sortable:hover { color: var(--text); }
.jornada-table .seta { color: var(--accent); font-size: .8rem; }

.jornada-table .valor-alerta { color: var(--error); }
.jornada-table .valor-ok { color: var(--success); }

.tag-terceirizado {
  font-size: .6rem;
  font-weight: 700;
  color: var(--text-3);
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 .4rem;
  margin-left: .5rem;
  text-transform: uppercase;
  letter-spacing: .03em;
  white-space: nowrap;
}

.setor-badge-jornada {
  padding: .2rem .6rem;
  border-radius: 12px;
  font-size: .7rem;
  font-weight: 700;
  color: #000;
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: .02em;
}
</style>

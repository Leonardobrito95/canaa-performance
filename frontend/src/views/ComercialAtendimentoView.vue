<template>
  <AtendimentoResumoPanel
    titulo="Atendimento"
    subtitulo="Vendas e Pós-Vendas - indicadores de volume, tempo e satisfação"
    :setores="SETORES_COMERCIAL"
  />
</template>

<script setup lang="ts">
import AtendimentoResumoPanel from '../components/AtendimentoResumoPanel.vue';
import { SETORES_COMERCIAL } from '../services/atendimentoApi';
</script>

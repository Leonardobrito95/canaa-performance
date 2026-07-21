<template>
  <AtendimentoResumoPanel
    titulo="Atendimento"
    subtitulo="SAC, Suporte, Cobrança, Retenção, Backoffice e Ouvidoria: indicadores de volume, tempo e satisfação"
    :setores="SETORES_CENTRO_SOLUCAO"
  />
</template>

<script setup lang="ts">
import AtendimentoResumoPanel from '../components/AtendimentoResumoPanel.vue';
import { SETORES_CENTRO_SOLUCAO } from '../services/atendimentoApi';
</script>

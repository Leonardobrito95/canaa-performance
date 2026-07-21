<template>
  <div class="view-diagnostico">
    <div class="diag-shell">

      <!-- Sidebar: marca, navegação entre modos e (em Gestão) o painel de métricas —
           aproveita o espaço que antes ficava vazio nas laterais do chat centralizado. -->
      <aside class="diag-sidebar">
        <div class="diag-brand">
          <span class="diag-brand-icon">
            <svg width="22" height="22" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="1.1" r="0.75" fill="currentColor"/>
              <path d="M7.5 1.85v1.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              <rect x="2.5" y="3.15" width="10" height="7.3" rx="2.6" stroke="currentColor" stroke-width="1.3"/>
              <path d="M2.5 5.8h-1.2M13.5 5.8h1.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              <path d="M4.9 6.3c.5-.75 1.2-.75 1.7 0" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8.4 6.3c.5-.75 1.2-.75 1.7 0" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5.6 8.6h3.8" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>
              <path d="M4.2 10.45v1.15M10.8 10.45v1.15" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="diag-brand-title">C.A.I.O.</span>
        </div>

        <nav v-if="isGestor || isHubAdmin" class="diag-nav">
          <button :class="['diag-nav-item', { active: modo === 'consulta' }]" @click="modo = 'consulta'">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 3.5h12a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2.5v-2.5H2a1 1 0 01-1-1v-6a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
            <span>Consulta</span>
          </button>
          <button v-if="isGestor" :class="['diag-nav-item', { active: modo === 'gestao' }]" @click="modo = 'gestao'">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="8.5" width="3" height="6" rx=".5" stroke="currentColor" stroke-width="1.3"/><rect x="6.5" y="4.5" width="3" height="10" rx=".5" stroke="currentColor" stroke-width="1.3"/><rect x="11.5" y="1.5" width="3" height="13" rx=".5" stroke="currentColor" stroke-width="1.3"/></svg>
            <span>Painel de Gestão</span>
          </button>
          <button v-if="isHubAdmin" :class="['diag-nav-item', { active: modo === 'regras' }]" @click="modo = 'regras'">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l5.5 2v4c0 3.5-2.3 5.9-5.5 7-3.2-1.1-5.5-3.5-5.5-7v-4l5.5-2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
            <span>Regras de Negócio</span>
          </button>
        </nav>

        <!-- Painel de métricas (só em modo Gestão) — mesma lógica: usa a lateral em
             vez de disputar espaço com o chat, que fica maximizado no conteúdo principal.
             Fica num scroll PRÓPRIO, separado da navegação acima: rolar os dados nunca
             esconde os links de Consulta/Gestão/Regras, que ficam fixos no topo. -->
        <template v-if="modo === 'gestao'">
          <div class="diag-sidebar-divisor"></div>
          <div class="diag-sidebar-scroll">
          <div class="diag-sidebar-painel">
            <div v-if="loadingResumo" class="state-msg">
              <span class="loading-dots"><span/><span/><span/></span> Carregando painel…
            </div>

            <template v-else-if="resumoGestaoData">
              <div class="stat-cards">
                <div v-if="melhorVendedor" class="stat-card">
                  <div class="stat-icon stat-icon-vendedor">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.2" r="2.6" stroke="currentColor" stroke-width="1.3"/><path d="M2.3 14c0-3.1 2.6-4.8 5.7-4.8s5.7 1.7 5.7 4.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                  </div>
                  <div class="stat-label">Melhor vendedor · {{ formatarMesRef(mesMaisRecenteVendas) }}</div>
                  <div class="stat-valor">{{ melhorVendedor.nomeVendedor }}</div>
                  <div class="stat-sub">{{ formatarMoeda(melhorVendedor.valorLiberado) }} liberado · {{ melhorVendedor.qtdContratos }} contratos</div>
                </div>

                <div v-if="resumoVendasMesAtual" class="stat-card">
                  <div class="stat-icon stat-icon-vendas">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 12.5l4-4.5 3 2.5 5.5-6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.3 3.3h3.7V7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </div>
                  <div class="stat-label">Vendas liberadas · {{ formatarMesRef(mesMaisRecenteVendas) }}</div>
                  <div class="stat-valor">{{ formatarMoeda(resumoVendasMesAtual.totalLiberado) }}</div>
                  <div
                    v-if="variacaoLiberado !== null"
                    class="stat-sub"
                    :class="variacaoLiberado >= 0 ? 'stat-alta' : 'stat-baixa'"
                  >{{ variacaoLiberado >= 0 ? '▲' : '▼' }} {{ Math.abs(variacaoLiberado).toFixed(1) }}% vs {{ formatarMesRef(mesAnteriorVendas) }}</div>
                </div>

                <div v-if="redeResumo" class="stat-card">
                  <div class="stat-icon stat-icon-rede">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 6.2c3.5-3 8.5-3 12 0M4 8.6c2.2-2 5.8-2 8 0M6.3 11c1-.9 2.4-.9 3.4 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="13.3" r=".9" fill="currentColor"/></svg>
                  </div>
                  <div class="stat-label">Rede agora · {{ resumoGestaoData.pops.length }} POPs</div>
                  <div class="stat-valor">{{ redeResumo.totalAlerta }} ONUs em alerta</div>
                  <div class="stat-sub">de {{ redeResumo.totalOnus }} monitoradas</div>
                  <div v-if="resumoGestaoData.piorGeral" class="stat-sub stat-sub-destaque">
                    Pior sinal: <strong>{{ resumoGestaoData.piorGeral.nome }}</strong> ({{ resumoGestaoData.piorGeral.pop }}, {{ resumoGestaoData.piorGeral.sinalRx.toFixed(1) }}dBm)
                  </div>
                </div>

                <div v-if="resumoGestaoData.retencaoMes && resumoGestaoData.retencaoMes.totalTratadas > 0" class="stat-card">
                  <div class="stat-icon stat-icon-retencao">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 8.3l1.8 1.8 3.6-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </div>
                  <div class="stat-label">Retenção · mês em andamento</div>
                  <div class="stat-valor">{{ resumoGestaoData.retencaoMes.totalRetidas }}/{{ resumoGestaoData.retencaoMes.totalTratadas }} retidas</div>
                  <div class="stat-sub">{{ resumoGestaoData.retencaoMes.pctReversaoGeral.toFixed(1) }}% de reversão · {{ formatarMoeda(resumoGestaoData.retencaoMes.totalComissoes) }} em comissão</div>
                </div>
              </div>

              <template v-if="resumoGestaoData.piores.length">
                <p class="secao-titulo">Piores sinais hoje</p>
                <div class="piores-lista">
                  <div v-for="c in resumoGestaoData.piores" :key="c.idCliente" class="pior-item">
                    <span class="pior-nome">{{ c.nome }}</span>
                    <span class="pior-detalhe">OLT {{ c.olt }} · RX {{ c.rxHoje.toFixed(1) }}dBm (era {{ c.rxAnterior.toFixed(1) }}dBm)</span>
                  </div>
                </div>
              </template>

              <p class="secao-titulo">Status de rede por POP</p>
              <div class="pop-legenda-global">
                <span class="legenda-item"><span class="legenda-dot seg-normal"></span>Normal</span>
                <span class="legenda-item"><span class="legenda-dot seg-atencao"></span>Atenção</span>
                <span class="legenda-item"><span class="legenda-dot seg-critico"></span>Crítico</span>
                <span class="legenda-item"><span class="legenda-dot seg-fora"></span>Fora de operação</span>
                <span class="legenda-item"><span class="legenda-dot seg-semleitura"></span>Sem leitura</span>
              </div>
              <div class="pops-grid">
                <div
                  v-for="(p, idx) in popsOrdenados"
                  :key="p.pop"
                  :class="['pop-card', `pop-card-${p.nivel}`, { 'pop-card-destaque': idx === 0 && p.nivel === 'critico' }]"
                >
                  <div class="pop-cabecalho">
                    <span class="pop-nome">{{ p.pop }}</span>
                    <div class="pop-cabecalho-direita">
                      <span class="pop-total">{{ p.totalOnus }} ONUs</span>
                      <span :class="['pop-badge', `pop-badge-${p.nivel}`]">{{ p.nivel === 'critico' ? 'Crítico' : p.nivel === 'atencao' ? 'Atenção' : 'Normal' }}</span>
                    </div>
                  </div>
                  <div class="pop-barra">
                    <span class="seg seg-normal" :style="{ flexGrow: p.normal }" :title="`${p.normal} normal`"></span>
                    <span class="seg seg-atencao" :style="{ flexGrow: p.atencao }" :title="`${p.atencao} atenção`"></span>
                    <span class="seg seg-critico" :style="{ flexGrow: p.critico }" :title="`${p.critico} crítico`"></span>
                    <span class="seg seg-fora" :style="{ flexGrow: p.foraDeOperacao }" :title="`${p.foraDeOperacao} fora de operação`"></span>
                    <span class="seg seg-semleitura" :style="{ flexGrow: p.semLeitura }" :title="`${p.semLeitura} sem leitura`"></span>
                  </div>
                  <div class="pop-legenda">
                    <span>{{ p.critico + p.foraDeOperacao }} em alerta ({{ (p.pctAlerta * 100).toFixed(0) }}%)</span>
                    <span v-if="p.piorSinalRx !== null">pior sinal {{ p.piorSinalRx.toFixed(1) }}dBm</span>
                  </div>
                </div>
              </div>

              <template v-if="resumoGestaoData.auditoriaRetencao">
                <p class="secao-titulo">Auditoria de retenção (negociação real)</p>
                <p class="auditoria-aviso">
                  {{ resumoGestaoData.auditoriaRetencao.totalGeralClassificado }} de
                  {{ resumoGestaoData.auditoriaRetencao.totalGeralOsRetencao }} O.S. auditadas
                  ({{ resumoGestaoData.auditoriaRetencao.totalGeralPendente }} pendentes). É relatório, não altera comissão paga.
                </p>
                <div v-if="resumoGestaoData.auditoriaRetencao.porOperador.length" class="auditoria-lista">
                  <div v-for="o in resumoGestaoData.auditoriaRetencao.porOperador" :key="o.nomeOperador" class="auditoria-item">
                    <span class="auditoria-nome">{{ o.nomeOperador }}</span>
                    <span class="auditoria-detalhe">
                      {{ o.totalClassificado }} auditadas ·
                      <strong class="auditoria-ok">{{ o.negociacaoReal }} negociação real</strong> ·
                      <strong class="auditoria-erro">{{ o.semNegociacao }} sem negociação</strong>
                      <span v-if="o.indefinido"> · {{ o.indefinido }} indefinido</span>
                    </span>
                  </div>
                </div>
              </template>
            </template>

            <div class="gestao-divisor"></div>

            <div v-if="loadingAgregados" class="state-msg">
              <span class="loading-dots"><span/><span/><span/></span> Carregando padrões…
            </div>
            <div v-else-if="agregados.length === 0" class="empty-agregado">
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="17" stroke="currentColor" stroke-width="1.3" opacity=".35"/>
                <path d="M13 24l5-7 4 4 6-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <p class="empty-title">Nenhum padrão calculado ainda</p>
              <p class="empty-sub">
                Correlações validadas em SQL (ex: técnico com reincidência acima da média) aparecem
                aqui assim que a rotina de agregação rodar pela primeira vez.
              </p>
            </div>
            <div v-else class="agregado-grid">
              <div v-for="a in agregados" :key="a.chave" class="agregado-card">
                <div class="agregado-dim">{{ a.dimensao }}</div>
                <div class="agregado-chave">{{ a.chave }}</div>
                <p v-if="a.narrativa" class="agregado-narrativa">{{ a.narrativa }}</p>
              </div>
            </div>
          </div>
          </div>
        </template>

        <!-- Indicador de uso diário do CAIO — barra que enche conforme o
             gasto do dia sobe (mesma ideia do indicador de limite do Claude
             Code); clique expande o valor exato e o teto. -->
        <div v-if="isHubAdmin && usoCaio" class="diag-uso-caio">
          <button type="button" class="diag-uso-caio-toggle" @click="usoCaioExpandido = !usoCaioExpandido">
            <div class="diag-uso-caio-linha">
              <span>Uso do CAIO hoje</span>
              <span>{{ usoCaioPct }}%</span>
            </div>
            <div class="diag-uso-caio-barra">
              <div :class="['diag-uso-caio-fill', `nivel-${usoCaioNivel}`]" :style="{ width: usoCaioPct + '%' }"></div>
            </div>
          </button>
          <div v-if="usoCaioExpandido" class="diag-uso-caio-detalhe">
            <div>US$ {{ usoCaio.gastoHojeUsd.toFixed(2) }} de US$ {{ usoCaio.limiteUsd.toFixed(2) }} usados hoje</div>
            <div class="diag-uso-caio-nota">Teto compartilhado entre todos com acesso ao CAIO · reinicia à meia-noite</div>
          </div>
        </div>
      </aside>

      <!-- Conteúdo principal: chat maximizado (Consulta/Gestão) ou lista de regras -->
      <main class="diag-main">

    <!-- ═══════════ MODO CONSULTA (chat) ═══════════ -->
    <template v-if="modo === 'consulta'">
      <div :class="['chat-shell', { 'chat-shell-vazio': chatVazio }]">
        <div v-if="chatVazio" class="chat-hero">
          <h2 class="chat-hero-title">{{ saudacaoHero }}</h2>
        </div>
        <div v-else class="chat-scroll" ref="scrollRef">
          <div v-for="(turno, i) in turnos" :key="i" :class="['turno', turno.tipo === 'assistente' ? 'turno-ia' : 'turno-usuario']">
            <div class="turno-cabecalho">
              <span class="turno-label">{{ turno.tipo === 'assistente' ? 'C.A.I.O.' : (user?.nome?.split(' ')[0] || 'Você') }}</span>
              <span v-if="turno.criadoEm" class="turno-hora">{{ formatarHoraCurta(turno.criadoEm) }}</span>
            </div>

            <p v-if="turno.texto && turno.tipo === 'usuario'" class="turno-texto">{{ turno.texto }}</p>
            <div v-else-if="turno.texto" class="turno-texto" v-html="renderizarMarkdown(turno.texto)"></div>

            <!-- candidatos pra escolher -->
            <div v-if="turno.candidatos" class="candidatos-lista">
              <template v-for="c in turno.candidatos" :key="c.id">
                <!-- mais de um contrato ativo: um botão por contrato, "ID - NOME" -->
                <template v-if="c.contratosAtivos.length > 1">
                  <button
                    v-for="idContrato in c.contratosAtivos"
                    :key="`${c.id}-${idContrato}`"
                    class="candidato-btn"
                    @click="escolherCandidato(c)"
                  >
                    <span class="candidato-nome">{{ idContrato }} - {{ c.nome }}</span>
                    <span class="candidato-doc">{{ c.cpfCnpj }}<span v-if="c.endereco"> · {{ c.endereco }}</span></span>
                  </button>
                </template>
                <button v-else class="candidato-btn" @click="escolherCandidato(c)">
                  <span class="candidato-nome">{{ c.nome }}</span>
                  <span class="candidato-doc">{{ c.cpfCnpj }}<span v-if="c.endereco"> · {{ c.endereco }}</span></span>
                </button>
              </template>
            </div>

            <!-- resumo leve: pergunta se quer o diagnóstico completo -->
            <button
              v-if="turno.pedirConfirmacaoDiagnostico && i === turnos.length - 1"
              class="candidato-btn diagnostico-completo-btn"
              @click="turno.pedirConfirmacaoDiagnostico = false; rodarAnalise()"
            >
              <span class="candidato-nome">Gerar diagnóstico completo</span>
            </button>

            <!-- resultado: estruturado (3 seções) ou texto livre (fora de escopo) -->
            <div v-if="turno.resultado?.estruturado" class="result-secoes">
              <div class="result-secao">
                <div class="result-secao-cabecalho">
                  <span class="result-label label-diagnostico">Diagnóstico</span>
                  <button class="btn-copiar" @click="copiarSecao(`diag-${i}`, turno.resultado.diagnostico)">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="4.5" y="4.5" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 9.5v-7a1 1 0 011-1h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                    {{ secaoCopiada === `diag-${i}` ? 'Copiado!' : 'Copiar' }}
                  </button>
                </div>
                <div v-html="renderizarMarkdown(turno.resultado.diagnostico)"></div>
              </div>
              <div class="result-secao">
                <div class="result-secao-cabecalho">
                  <span :class="['result-label', causaIndicaFalha(turno.resultado.erro) ? 'label-erro' : 'label-erro-ok']">Causa identificada</span>
                  <button class="btn-copiar" @click="copiarSecao(`erro-${i}`, turno.resultado.erro)">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="4.5" y="4.5" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 9.5v-7a1 1 0 011-1h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                    {{ secaoCopiada === `erro-${i}` ? 'Copiado!' : 'Copiar' }}
                  </button>
                </div>
                <div v-html="renderizarMarkdown(turno.resultado.erro)"></div>
              </div>
              <div class="result-secao">
                <div class="result-secao-cabecalho">
                  <span class="result-label label-sugestao">Sugestão <em>(para avaliação humana)</em></span>
                  <button class="btn-copiar" @click="copiarSecao(`sug-${i}`, turno.resultado.sugestao)">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="4.5" y="4.5" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 9.5v-7a1 1 0 011-1h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                    {{ secaoCopiada === `sug-${i}` ? 'Copiado!' : 'Copiar' }}
                  </button>
                </div>
                <div v-html="renderizarMarkdown(turno.resultado.sugestao)"></div>

                <div v-if="!turno.feedback" class="feedback-row">
                  <button class="feedback-btn feedback-btn-up" @click="darFeedback(turno, turno.resultado.consultaId, 'POSITIVO')">
                    <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M5 6.5v6h6.3a1 1 0 001-.8l.8-4a1 1 0 00-1-1.2H9V3.5a1.5 1.5 0 00-1.5-1.5L6 6" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M2 6.5h3v6H2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                    Validar e encerrar
                  </button>
                  <button class="feedback-btn feedback-btn-down" @click="darFeedback(turno, turno.resultado.consultaId, 'NEGATIVO')">
                    <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M10 8.5v-6H3.7a1 1 0 00-1 .8l-.8 4a1 1 0 001 1.2H6V11a1.5 1.5 0 001.5 1.5L9 8.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M13 8.5h-3v-6h3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                    Reportar problema
                  </button>
                </div>
                <div v-else class="feedback-chip" :class="turno.feedback === 'POSITIVO' ? 'feedback-chip-ok' : 'feedback-chip-erro'">
                  <svg v-if="turno.feedback === 'POSITIVO'" width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.3l3 3 6-6.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <svg v-else width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                  <span>{{ turno.feedback === 'POSITIVO' ? 'Validado' : 'Reportado' }}</span>
                </div>
              </div>
            </div>
            <div v-else-if="turno.resultado" class="turno-texto" v-html="renderizarMarkdown(turno.resultado.textoCompleto)"></div>

            <div v-if="turno.resultado && !turno.resultado.estruturado" class="feedback-row">
              <template v-if="!turno.feedback">
                <span class="feedback-pergunta">Essa resposta estava correta?</span>
                <button class="feedback-btn feedback-btn-up" title="Marcar como correto" @click="darFeedback(turno, turno.resultado.consultaId, 'POSITIVO')">
                  <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M5 6.5v6h6.3a1 1 0 001-.8l.8-4a1 1 0 00-1-1.2H9V3.5a1.5 1.5 0 00-1.5-1.5L6 6" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M2 6.5h3v6H2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                </button>
                <button class="feedback-btn feedback-btn-down" title="Marcar como incorreto" @click="darFeedback(turno, turno.resultado.consultaId, 'NEGATIVO')">
                  <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M10 8.5v-6H3.7a1 1 0 00-1 .8l-.8 4a1 1 0 001 1.2H6V11a1.5 1.5 0 001.5 1.5L9 8.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M13 8.5h-3v-6h3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                </button>
              </template>
              <div v-else class="feedback-chip" :class="turno.feedback === 'POSITIVO' ? 'feedback-chip-ok' : 'feedback-chip-erro'">
                <svg v-if="turno.feedback === 'POSITIVO'" width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.3l3 3 6-6.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg v-else width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                <span>{{ turno.feedback === 'POSITIVO' ? 'Validado' : 'Reportado' }}</span>
              </div>
            </div>
          </div>

          <div v-if="loading" class="turno turno-ia">
            <div class="turno-cabecalho"><span class="turno-label">C.A.I.O.</span></div>
            <span class="loading-dots"><span/><span/><span/></span>
            <span class="loading-label">{{ loadingLabel }}</span>
          </div>
        </div>

        <div class="chat-input-shell">
          <div class="chat-toolbar">
            <button class="btn-trocar" @click="novaConversa" title="Limpar esta conversa e começar de novo">Novo chat</button>
          </div>
          <div v-if="clienteAtivo" class="chat-cliente-ativo">
            <span>Analisando: <strong>{{ clienteAtivo.nome }}</strong></span>
            <button class="btn-trocar" @click="trocarCliente">Trocar cliente</button>
          </div>
          <div class="chat-input-row">
            <input
              v-model="inputAtual"
              :placeholder="placeholderInput"
              :disabled="loading"
              @keydown.enter="enviar"
            />
            <button class="btn-enviar" :disabled="loading || !inputAtual.trim()" @click="enviar">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M1.5 7.5 13 2 8.5 13 6.5 8.5 1.5 7.5z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════ MODO GESTÃO (painel na lateral, chat maximizado) ═══════════ -->
    <template v-else-if="modo === 'gestao'">
      <div class="chat-shell">
        <div class="chat-scroll" ref="scrollGestaoRef">
          <div v-for="(turno, i) in turnosGestao" :key="i" :class="['turno', turno.tipo === 'assistente' ? 'turno-ia' : 'turno-usuario']">
            <div class="turno-cabecalho">
              <span class="turno-label">{{ turno.tipo === 'assistente' ? 'C.A.I.O.' : (user?.nome?.split(' ')[0] || 'Você') }}</span>
              <span v-if="turno.criadoEm" class="turno-hora">{{ formatarHoraCurta(turno.criadoEm) }}</span>
            </div>
            <p v-if="turno.tipo === 'usuario'" class="turno-texto">{{ turno.texto }}</p>
            <div v-else class="turno-texto" v-html="renderizarMarkdown(turno.texto)"></div>

            <button
              v-if="turno.arquivo"
              class="btn-baixar-arquivo"
              :disabled="baixandoArquivo === turno.arquivo.nome"
              @click="baixarArquivoGestao(turno.arquivo)"
            >
              <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M7.5 2v8m0 0L4 6.5M7.5 10L11 6.5M2.5 12.5h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {{ baixandoArquivo === turno.arquivo.nome ? 'Baixando…' : `Baixar ${turno.arquivo.formato.toUpperCase()}` }}
            </button>

            <div v-if="turno.consultaId" class="feedback-row">
              <template v-if="!turno.feedback">
                <span class="feedback-pergunta">Essa resposta estava correta?</span>
                <button class="feedback-btn feedback-btn-up" title="Marcar como correto" @click="darFeedback(turno, turno.consultaId, 'POSITIVO')">
                  <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M5 6.5v6h6.3a1 1 0 001-.8l.8-4a1 1 0 00-1-1.2H9V3.5a1.5 1.5 0 00-1.5-1.5L6 6" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M2 6.5h3v6H2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                </button>
                <button class="feedback-btn feedback-btn-down" title="Marcar como incorreto" @click="darFeedback(turno, turno.consultaId, 'NEGATIVO')">
                  <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M10 8.5v-6H3.7a1 1 0 00-1 .8l-.8 4a1 1 0 001 1.2H6V11a1.5 1.5 0 001.5 1.5L9 8.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M13 8.5h-3v-6h3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                </button>
              </template>
              <div v-else class="feedback-chip" :class="turno.feedback === 'POSITIVO' ? 'feedback-chip-ok' : 'feedback-chip-erro'">
                <svg v-if="turno.feedback === 'POSITIVO'" width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.3l3 3 6-6.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg v-else width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                <span>{{ turno.feedback === 'POSITIVO' ? 'Validado' : 'Reportado' }}</span>
              </div>
            </div>
          </div>
          <div v-if="loadingGestao" class="turno turno-ia">
            <div class="turno-cabecalho"><span class="turno-label">C.A.I.O.</span></div>
            <span class="loading-dots"><span/><span/><span/></span>
          </div>
        </div>

        <div class="chat-input-shell">
          <div class="chat-toolbar">
            <button class="btn-trocar" @click="novaConversaGestao" title="Limpar esta conversa e começar de novo">Novo chat</button>
          </div>
          <div class="gestao-sugestoes">
            <button
              v-for="s in SUGESTOES_GESTAO"
              :key="s"
              class="chip-sugestao"
              :disabled="loadingGestao"
              @click="enviarSugestaoGestao(s)"
            >{{ s }}</button>
          </div>
          <div class="chat-input-row">
            <input
              v-model="inputGestao"
              placeholder="Pergunte algo…"
              :disabled="loadingGestao"
              @keydown.enter="enviarGestao()"
            />
            <button class="btn-enviar" :disabled="loadingGestao || !inputGestao.trim()" @click="enviarGestao()">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M1.5 7.5 13 2 8.5 13 6.5 8.5 1.5 7.5z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════ MODO REGRAS DE NEGÓCIO ═══════════ -->
    <template v-else>
      <div class="regras-shell">
        <div class="regras-toolbar">
          <p class="regras-info">
            Base de referência lida pela IA ao montar o diagnóstico (metas, faixas, padrões de campo).
            Não altera regras de comissão/cobrança em produção, é só o que a IA enxerga.
          </p>
          <button class="btn-nova-regra" v-if="!formAberto" @click="abrirNovaRegra">+ Nova regra</button>
        </div>

        <div v-if="formAberto" class="regra-form">
          <div class="regra-form-grid">
            <label>Chave
              <input v-model="novaRegra.chave" placeholder="EX_NOME_REGRA" />
            </label>
            <label>Categoria
              <select v-model="novaRegra.categoria">
                <option v-for="c in CATEGORIAS" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
            <label>Valor
              <input v-model="novaRegra.valor" placeholder="Valor ou fato curto" />
            </label>
          </div>
          <label class="regra-form-descricao">Descrição
            <textarea v-model="novaRegra.descricao" rows="2" placeholder="Contexto que a IA deve considerar…"></textarea>
          </label>
          <div v-if="erroRegra" class="regra-erro">{{ erroRegra }}</div>
          <div class="regra-form-acoes">
            <button class="btn-cancelar" @click="cancelarNovaRegra">Cancelar</button>
            <button class="btn-salvar" :disabled="salvandoRegra" @click="salvarNovaRegra">Salvar</button>
          </div>
        </div>

        <div v-if="loadingRegras" class="state-msg">
          <span class="loading-dots"><span/><span/><span/></span> Carregando regras…
        </div>
        <div v-else class="regras-lista">
          <div v-for="r in regras" :key="r.chave" class="regra-row">
            <template v-if="editandoChave === r.chave">
              <div class="regra-form-grid">
                <div class="regra-chave-fixa">{{ r.chave }}</div>
                <label>Categoria
                  <select v-model="regraEmEdicao.categoria">
                    <option v-for="c in CATEGORIAS" :key="c" :value="c">{{ c }}</option>
                  </select>
                </label>
                <label>Valor
                  <input v-model="regraEmEdicao.valor" />
                </label>
              </div>
              <label class="regra-form-descricao">Descrição
                <textarea v-model="regraEmEdicao.descricao" rows="2"></textarea>
              </label>
              <div v-if="erroRegra" class="regra-erro">{{ erroRegra }}</div>
              <div class="regra-form-acoes">
                <button class="btn-cancelar" @click="cancelarEdicao">Cancelar</button>
                <button class="btn-salvar" :disabled="salvandoRegra" @click="salvarEdicao(r.chave)">Salvar</button>
              </div>
            </template>
            <template v-else>
              <div class="regra-main">
                <span class="regra-categoria">{{ r.categoria }}</span>
                <span class="regra-chave">{{ r.chave }}</span>
                <span class="regra-valor">{{ r.valor }}</span>
              </div>
              <p class="regra-descricao">{{ r.descricao }}</p>
              <div class="regra-rodape">
                <span class="regra-meta">atualizado por {{ r.atualizado_por }} · {{ formatarDataHora(r.atualizado_em) }}</span>
                <div class="regra-acoes">
                  <button class="icon-btn" title="Editar" @click="iniciarEdicao(r)">
                    <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M10.5 1.5l3 3-8 8-3.5 1 1-3.5 8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>
                  </button>
                  <button
                    class="icon-btn"
                    :class="{ 'icon-btn-perigo': excluindoChave === r.chave }"
                    :title="excluindoChave === r.chave ? 'Confirmar exclusão' : 'Excluir'"
                    @click="confirmarExclusao(r.chave)"
                  >
                    <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M2.5 4h10M5.5 4V2.5a1 1 0 011-1h2a1 1 0 011 1V4M3.1 4l.6 8a1 1 0 001 .9h5.6a1 1 0 001-.9l.6-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span v-if="excluindoChave === r.chave" class="icon-btn-confirm-label">Confirmar?</span>
                  </button>
                </div>
              </div>
            </template>
          </div>
          <p v-if="regras.length === 0" class="empty-sub">Nenhuma regra cadastrada ainda.</p>
        </div>
      </div>
    </template>

      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useAuth } from '../composables/useAuth';
import {
  buscarCliente,
  buscarResumoCliente,
  consultarDiagnostico,
  buscarAgregados,
  buscarResumoGestao,
  consultarGestao,
  exportarRelatorioGestao,
  enviarFeedback,
  listarRegras,
  criarRegra,
  editarRegra,
  excluirRegra,
  buscarStatusGemini,
  type DiagnosticoResultado,
  type DiagnosticoAgregadoItem,
  type ClienteCandidato,
  type ResumoCliente,
  type RegraNegocio,
  type CategoriaRegra,
  type HistoricoTurnoConversa,
  type TipoFeedback,
  type ResumoGestao,
  type PopStatusEntry,
  type ArquivoGeradoGestao,
  type StatusGeminiCaio,
} from '../services/diagnosticoApi';

const { user, isGestor, isHubAdmin } = useAuth();

// ── Uso diário do CAIO (custo do Gemini) — indicador estilo Claude Code:
// barra que enche conforme o gasto do dia sobe, clique expande o detalhe.
// Só quem tem acesso ao CAIO (isHubAdmin) enxerga — mesmo público que já
// consegue ver /diagnostico/_health/gemini no backend.
const usoCaio = ref<StatusGeminiCaio | null>(null);
const usoCaioExpandido = ref(false);
const usoCaioPct = computed(() => {
  if (!usoCaio.value || usoCaio.value.limiteUsd <= 0) return 0;
  return Math.min(100, Math.round((usoCaio.value.gastoHojeUsd / usoCaio.value.limiteUsd) * 100));
});
const usoCaioNivel = computed(() => {
  if (usoCaioPct.value >= 90) return 'critico';
  if (usoCaioPct.value >= 70) return 'atencao';
  return 'normal';
});
async function carregarUsoCaio() {
  if (!isHubAdmin.value) return;
  try {
    const status = await buscarStatusGemini();
    usoCaio.value = status.caio;
  } catch {
    // indicador é só informativo — uma falha aqui não deve travar o chat
  }
}

type Modo = 'consulta' | 'gestao' | 'regras';
const modo = ref<Modo>('consulta');

// ── Persistência local do chat (F5 não perde a conversa) ──────────────────
// O backend não guarda sessão de propósito — tudo aqui é só pra sobreviver
// a um reload de página, não é a fonte de verdade (essa é o banco).
const STORAGE_KEY_CONSULTA = 'diagnostico_chat_consulta_v1';
const STORAGE_KEY_GESTAO = 'diagnostico_chat_gestao_v1';
const LIMITE_TURNOS_PERSISTIDOS = 50;

function carregarDoStorage<T>(chave: string, padrao: T): T {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}

function salvarNoStorage(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // localStorage cheio/indisponível (modo anônimo etc.) — não é crítico, ignora.
  }
}

// ── Markdown-lite (negrito + listas) para respostas da IA ─────────────────
// Suficiente para o que o prompt gera (negrito e listas com "- "/"1. ") —
// não é um parser completo, só o bastante pra sair de prosa corrida.
function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMd(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderizarMarkdown(texto: string): string {
  const linhas = escaparHtml(texto).split('\n');
  const blocos: string[] = [];
  let listaAtual: string[] | null = null;
  let tipoLista: 'ul' | 'ol' | null = null;

  function fecharLista() {
    if (listaAtual && tipoLista) {
      blocos.push(`<${tipoLista}>${listaAtual.map((li) => `<li>${inlineMd(li)}</li>`).join('')}</${tipoLista}>`);
    }
    listaAtual = null;
    tipoLista = null;
  }

  for (const linhaRaw of linhas) {
    const linha = linhaRaw.trim();
    const bullet = /^[-*•]\s+(.*)/.exec(linha);
    const numerada = /^\d+[.)]\s+(.*)/.exec(linha);
    if (bullet) {
      if (tipoLista !== 'ul') { fecharLista(); tipoLista = 'ul'; listaAtual = []; }
      listaAtual!.push(bullet[1]);
    } else if (numerada) {
      if (tipoLista !== 'ol') { fecharLista(); tipoLista = 'ol'; listaAtual = []; }
      listaAtual!.push(numerada[1]);
    } else {
      fecharLista();
      if (linha) blocos.push(`<p>${inlineMd(linha)}</p>`);
    }
  }
  fecharLista();
  return blocos.join('');
}

interface Turno {
  tipo: 'usuario' | 'assistente';
  texto?: string;
  candidatos?: ClienteCandidato[];
  resultado?: DiagnosticoResultado;
  feedback?: TipoFeedback;
  criadoEm?: string;
  /// true no turno do resumo leve, mostra o botão "Gerar diagnóstico
  /// completo" (só dispara o Gemini/fotos quando o usuário confirmar).
  pedirConfirmacaoDiagnostico?: boolean;
}

async function darFeedback(turno: { feedback?: TipoFeedback }, consultaId: string, feedback: TipoFeedback) {
  if (turno.feedback) return;
  turno.feedback = feedback;
  try {
    await enviarFeedback(consultaId, feedback);
  } catch {
    turno.feedback = undefined;
  }
}

function formatarHoraCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Heurística: o rótulo "Causa identificada" só faz sentido em vermelho quando
// há de fato uma falha — se o texto diz explicitamente que não há falha, a
// cor vira neutra/positiva em vez de soar como alarme falso.
function causaIndicaFalha(erro: string): boolean {
  return !/n[ãa]o h[áa].{0,40}falha|sem falhas?\b|nenhuma falha/i.test(erro);
}

const secaoCopiada = ref<string | null>(null);
async function copiarSecao(id: string, texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    secaoCopiada.value = id;
    setTimeout(() => { if (secaoCopiada.value === id) secaoCopiada.value = null; }, 1500);
  } catch {
    // clipboard indisponível (contexto não seguro, permissão negada) — ignora.
  }
}

const SAUDACAO_INICIAL: Turno = { tipo: 'assistente', texto: 'Olá! Me diga o nome ou o ID do cliente que você quer analisar.', criadoEm: new Date().toISOString() };
const estadoConsultaSalvo = carregarDoStorage(STORAGE_KEY_CONSULTA, {
  turnos: [SAUDACAO_INICIAL] as Turno[],
  clienteAtivo: null as { id: number; nome: string } | null,
  historicoConversa: [] as HistoricoTurnoConversa[],
});

const turnos = ref<Turno[]>(estadoConsultaSalvo.turnos);
const clienteAtivo = ref<{ id: number; nome: string } | null>(estadoConsultaSalvo.clienteAtivo);
// Backend não guarda sessão — mantemos aqui as últimas perguntas/respostas
// dessa conversa para a IA entender referências curtas ("e os atendimentos?").
const historicoConversa = ref<HistoricoTurnoConversa[]>(estadoConsultaSalvo.historicoConversa);
const inputAtual = ref('');
const loading = ref(false);
const loadingLabel = ref('Analisando…');
const scrollRef = ref<HTMLElement | null>(null);

const placeholderInput = computed(() =>
  clienteAtivo.value ? 'Pergunte algo sobre esse cliente…' : 'Nome ou ID do cliente…'
);

// Tela inicial (sem troca de mensagens ainda) mostra uma saudação grande e
// centralizada, no estilo Gemini, em vez do histórico de chat vazio.
const chatVazio = computed(() => turnos.value.length <= 1);
const saudacaoHero = computed(() => {
  const nome = user.value?.nome?.split(' ')[0];
  return nome ? `Qual cliente vamos analisar, ${nome}?` : 'Qual cliente vamos analisar?';
});

watch([turnos, clienteAtivo, historicoConversa], () => {
  salvarNoStorage(STORAGE_KEY_CONSULTA, {
    turnos: turnos.value.slice(-LIMITE_TURNOS_PERSISTIDOS),
    clienteAtivo: clienteAtivo.value,
    historicoConversa: historicoConversa.value,
  });
}, { deep: true });

function rolarParaFinal() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
  });
}

function adicionarTurno(t: Turno) {
  turnos.value.push({ ...t, criadoEm: t.criadoEm ?? new Date().toISOString() });
  rolarParaFinal();
}

async function enviar() {
  const texto = inputAtual.value.trim();
  if (!texto || loading.value) return;
  inputAtual.value = '';
  adicionarTurno({ tipo: 'usuario', texto });

  const pareceOutroIdCliente =
    clienteAtivo.value && /^\d+$/.test(texto) && Number(texto) !== clienteAtivo.value.id;

  if (!clienteAtivo.value || pareceOutroIdCliente) {
    clienteAtivo.value = null;
    historicoConversa.value = [];
    await resolverCliente(texto);
  } else {
    await rodarAnalise(texto);
  }
}

async function resolverCliente(termo: string) {
  if (/^\d+$/.test(termo)) {
    clienteAtivo.value = { id: Number(termo), nome: `cliente #${termo}` };
    await mostrarResumo();
    return;
  }

  loading.value = true;
  loadingLabel.value = 'Procurando cliente…';
  try {
    const candidatos = await buscarCliente(termo);
    if (candidatos.length === 0) {
      adicionarTurno({ tipo: 'assistente', texto: 'Não encontrei nenhum cliente com esse nome ou documento. Tente novamente (nome completo, CPF/CNPJ ou ID).' });
    } else if (candidatos.length === 1 && candidatos[0].contratosAtivos.length <= 1) {
      clienteAtivo.value = { id: candidatos[0].id, nome: candidatos[0].nome };
      loading.value = false;
      await mostrarResumo();
      return;
    } else if (candidatos.length === 1) {
      // 1 cliente, mas com mais de um contrato ativo — não auto-seleciona,
      // mostra os contratos pra deixar claro qual vai ser analisado.
      adicionarTurno({ tipo: 'assistente', texto: 'Esse cliente tem mais de um contrato ativo. Qual deles?', candidatos });
    } else {
      adicionarTurno({ tipo: 'assistente', texto: 'Encontrei mais de um cliente com esse nome. Qual deles?', candidatos });
    }
  } catch {
    adicionarTurno({ tipo: 'assistente', texto: 'Não consegui buscar o cliente agora. Tente de novo em instantes.' });
  } finally {
    loading.value = false;
  }
}

function escolherCandidato(c: ClienteCandidato) {
  clienteAtivo.value = { id: c.id, nome: c.nome };
  historicoConversa.value = [];
  mostrarResumo();
}

function formatarDataCurta(iso: string | null): string {
  if (!iso) return 'data não registrada';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarResumo(r: ResumoCliente): string {
  const linhas: string[] = [];
  linhas.push(`**${r.nomeCliente}**${r.contratoAtivoId ? ` · contrato ${r.contratoAtivoId} ativo` : ' · sem contrato ativo no momento'}`);

  if (r.sinalAtualDbm !== null) {
    linhas.push(`- Sinal atual: ${r.sinalAtualDbm}dBm${r.sinalNivel ? ` (${r.sinalNivel})` : ''}`);
  } else {
    linhas.push('- Sem dado de sinal disponível agora');
  }

  if (r.equipamento) {
    const aviso = r.equipamento.fonteIncerta ? ' (fonte incerta, sem comodato confirmado no IXC)' : '';
    linhas.push(`- Equipamento: ${r.equipamento.descricao} (S/N ${r.equipamento.numeroSerie})${aviso}`);
  }

  linhas.push(`- ${r.qtdOsRecentes} O.S. e ${r.qtdAtendimentosRecentes} atendimento(s) recentes`);
  if (r.ultimaOs) {
    linhas.push(`- Última O.S.: #${r.ultimaOs.id} (${r.ultimaOs.status}), aberta em ${formatarDataCurta(r.ultimaOs.dataAbertura)}`);
  }
  if (r.qtdFotosDisponiveis > 0) {
    linhas.push(`- ${r.qtdFotosDisponiveis} foto(s) de instalação disponível(is) pra análise visual`);
  }

  linhas.push('', 'Quer que eu gere o diagnóstico completo (causa + sugestão)?');
  return linhas.join('\n');
}

/// Resumo leve, sem Gemini nem fotos (rápido e sem custo). Só quando o
/// usuário confirmar (botão "Gerar diagnóstico completo") é que
/// rodarAnalise() roda de verdade, com a mesma lógica de sempre.
async function mostrarResumo() {
  if (!clienteAtivo.value) return;
  loading.value = true;
  loadingLabel.value = 'Buscando resumo…';
  try {
    const resumo = await buscarResumoCliente(clienteAtivo.value.id);
    clienteAtivo.value = { id: resumo.idCliente, nome: resumo.nomeCliente };
    adicionarTurno({ tipo: 'assistente', texto: formatarResumo(resumo), pedirConfirmacaoDiagnostico: true });
  } catch (e: any) {
    const msg = e?.response?.data?.message || 'Não consegui buscar o resumo desse cliente agora.';
    adicionarTurno({ tipo: 'assistente', texto: msg });
  } finally {
    loading.value = false;
  }
}

async function rodarAnalise(pergunta?: string) {
  if (!clienteAtivo.value) return;
  loading.value = true;
  loadingLabel.value = pergunta ? 'Buscando resposta…' : 'Cruzando rede, instalação e comercial…';
  try {
    const resultado = await consultarDiagnostico(clienteAtivo.value.id, pergunta, historicoConversa.value);
    adicionarTurno({ tipo: 'assistente', resultado });
    historicoConversa.value.push({ pergunta: pergunta || 'Diagnóstico geral do cliente', resposta: resultado.textoCompleto });
    if (historicoConversa.value.length > 6) historicoConversa.value.shift();
  } catch (e: any) {
    const msg = e?.response?.data?.message || 'Não consegui gerar o diagnóstico agora.';
    adicionarTurno({ tipo: 'assistente', texto: msg });
  } finally {
    loading.value = false;
    carregarUsoCaio();
  }
}

function trocarCliente() {
  clienteAtivo.value = null;
  historicoConversa.value = [];
  adicionarTurno({ tipo: 'assistente', texto: 'Beleza. Qual o próximo cliente (nome ou ID)?' });
}

// Diferente de trocarCliente: apaga o histórico visível da conversa (não só troca
// o cliente ativo). É o que falta pro usuário não precisar limpar o localStorage
// na mão pelo DevTools quando quiser começar do zero.
function novaConversa() {
  turnos.value = [{ ...SAUDACAO_INICIAL, criadoEm: new Date().toISOString() }];
  clienteAtivo.value = null;
  historicoConversa.value = [];
}

const agregados = ref<DiagnosticoAgregadoItem[]>([]);
const loadingAgregados = ref(false);

async function carregarAgregados() {
  loadingAgregados.value = true;
  try {
    agregados.value = await buscarAgregados();
  } finally {
    loadingAgregados.value = false;
  }
}

// ── Painel de gestão (cards com dado direto, sem passar pelo Gemini) ──────
const resumoGestaoData = ref<ResumoGestao | null>(null);
const loadingResumo = ref(false);

async function carregarResumoGestao() {
  loadingResumo.value = true;
  try {
    resumoGestaoData.value = await buscarResumoGestao();
  } finally {
    loadingResumo.value = false;
  }
}

function formatarMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatarMesRef(mesRef: string | null): string {
  if (!mesRef) return '';
  const [ano, mes] = mesRef.split('-');
  return `${NOMES_MES[Number(mes) - 1]}/${ano}`;
}

const mesesVendasOrdenados = computed(() => {
  if (!resumoGestaoData.value) return [];
  return [...new Set(resumoGestaoData.value.evolucao.map((e) => e.mesReferencia))].sort().reverse();
});
const mesMaisRecenteVendas = computed(() => mesesVendasOrdenados.value[0] ?? null);
const mesAnteriorVendas = computed(() => mesesVendasOrdenados.value[1] ?? null);

const melhorVendedor = computed(() => {
  if (!resumoGestaoData.value || !mesMaisRecenteVendas.value) return null;
  // ranking já vem ordenado por valorAtivos DESC dentro de cada mês (query do backend)
  return resumoGestaoData.value.ranking.find((r) => r.mesReferencia === mesMaisRecenteVendas.value) ?? null;
});

function somaEvolucaoDoMes(mes: string | null) {
  if (!resumoGestaoData.value || !mes) return null;
  const doMes = resumoGestaoData.value.evolucao.filter((e) => e.mesReferencia === mes);
  if (!doMes.length) return null;
  return {
    totalAtivos: doMes.reduce((s, e) => s + e.valorAtivos, 0),
    totalLiberado: doMes.reduce((s, e) => s + e.valorLiberado, 0),
  };
}
const resumoVendasMesAtual = computed(() => somaEvolucaoDoMes(mesMaisRecenteVendas.value));

const variacaoLiberado = computed(() => {
  const atual = somaEvolucaoDoMes(mesMaisRecenteVendas.value);
  const anterior = somaEvolucaoDoMes(mesAnteriorVendas.value);
  if (!atual || !anterior || !anterior.totalLiberado) return null;
  return ((atual.totalLiberado - anterior.totalLiberado) / anterior.totalLiberado) * 100;
});

type NivelPop = 'critico' | 'atencao' | 'normal';

function severidadePop(p: PopStatusEntry): { nivel: NivelPop; pctAlerta: number } {
  const totalAlerta = p.critico + p.foraDeOperacao;
  const pctAlerta = p.totalOnus > 0 ? totalAlerta / p.totalOnus : 0;
  if (totalAlerta > 0 && pctAlerta >= 0.2) return { nivel: 'critico', pctAlerta };
  if (totalAlerta > 0 || p.atencao > 0) return { nivel: 'atencao', pctAlerta };
  return { nivel: 'normal', pctAlerta };
}

// POPs ordenados por criticidade (% de ONUs em alerta) — o gestor deve ver o
// pior POP primeiro, não na ordem arbitrária que a API devolve.
const popsOrdenados = computed(() => {
  const pops = resumoGestaoData.value?.pops ?? [];
  return pops
    .map((p) => ({ ...p, ...severidadePop(p) }))
    .sort((a, b) => b.pctAlerta - a.pctAlerta);
});

const redeResumo = computed(() => {
  const pops = resumoGestaoData.value?.pops;
  if (!pops?.length) return null;
  return {
    totalOnus: pops.reduce((s, p) => s + p.totalOnus, 0),
    totalAlerta: pops.reduce((s, p) => s + p.critico + p.foraDeOperacao, 0),
  };
});

interface TurnoGestao { tipo: 'usuario' | 'assistente'; texto: string; consultaId?: string; feedback?: TipoFeedback; criadoEm?: string; arquivo?: ArquivoGeradoGestao }

const SUGESTOES_GESTAO = ['Melhores vendedores', 'POPs críticos', 'Queda de sinal'];

const SAUDACAO_GESTAO: TurnoGestao = {
  tipo: 'assistente',
  texto: 'Pergunte sobre ranking de vendedores ou evolução de vendas por período/segmento.',
  criadoEm: new Date().toISOString(),
};
const estadoGestaoSalvo = carregarDoStorage(STORAGE_KEY_GESTAO, {
  turnosGestao: [SAUDACAO_GESTAO] as TurnoGestao[],
  historicoGestao: [] as HistoricoTurnoConversa[],
});

const turnosGestao = ref<TurnoGestao[]>(estadoGestaoSalvo.turnosGestao);
const historicoGestao = ref<HistoricoTurnoConversa[]>(estadoGestaoSalvo.historicoGestao);
const inputGestao = ref('');
const loadingGestao = ref(false);
const scrollGestaoRef = ref<HTMLElement | null>(null);

watch([turnosGestao, historicoGestao], () => {
  salvarNoStorage(STORAGE_KEY_GESTAO, {
    turnosGestao: turnosGestao.value.slice(-LIMITE_TURNOS_PERSISTIDOS),
    historicoGestao: historicoGestao.value,
  });
}, { deep: true });

function rolarGestaoParaFinal() {
  nextTick(() => {
    if (scrollGestaoRef.value) scrollGestaoRef.value.scrollTop = scrollGestaoRef.value.scrollHeight;
  });
}

async function enviarGestao(perguntaChip?: string) {
  const pergunta = (typeof perguntaChip === 'string' ? perguntaChip : inputGestao.value).trim();
  if (!pergunta || loadingGestao.value) return;
  inputGestao.value = '';
  turnosGestao.value.push({ tipo: 'usuario', texto: pergunta, criadoEm: new Date().toISOString() });
  rolarGestaoParaFinal();
  loadingGestao.value = true;
  try {
    const { resposta, consultaId, arquivo } = await consultarGestao(pergunta, historicoGestao.value);
    turnosGestao.value.push({ tipo: 'assistente', texto: resposta, consultaId, criadoEm: new Date().toISOString(), arquivo: arquivo ?? undefined });
    historicoGestao.value.push({ pergunta, resposta });
    if (historicoGestao.value.length > 6) historicoGestao.value.shift();
  } catch (e: any) {
    const msg = e?.response?.data?.message || 'Não consegui responder agora.';
    turnosGestao.value.push({ tipo: 'assistente', texto: msg, criadoEm: new Date().toISOString() });
  } finally {
    loadingGestao.value = false;
    rolarGestaoParaFinal();
    carregarUsoCaio();
  }
}

function enviarSugestaoGestao(sugestao: string) {
  enviarGestao(sugestao);
}

function novaConversaGestao() {
  turnosGestao.value = [{ ...SAUDACAO_GESTAO, criadoEm: new Date().toISOString() }];
  historicoGestao.value = [];
}

const baixandoArquivo = ref<string | null>(null);

async function baixarArquivoGestao(arquivo: ArquivoGeradoGestao) {
  baixandoArquivo.value = arquivo.nome;
  try {
    const blob = await exportarRelatorioGestao(arquivo.chave, arquivo.formato);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = arquivo.nome;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    baixandoArquivo.value = null;
  }
}

const CATEGORIAS: CategoriaRegra[] = ['VENDAS', 'RETENCAO', 'REDE', 'COMISSAO', 'ATENDIMENTO'];

const regras = ref<RegraNegocio[]>([]);
const loadingRegras = ref(false);
const formAberto = ref(false);
const salvandoRegra = ref(false);
const erroRegra = ref('');
const novaRegra = ref({ chave: '', valor: '', descricao: '', categoria: 'REDE' as CategoriaRegra });
const editandoChave = ref<string | null>(null);
const regraEmEdicao = ref({ valor: '', descricao: '', categoria: 'REDE' as CategoriaRegra });
const excluindoChave = ref<string | null>(null);

async function carregarRegras() {
  loadingRegras.value = true;
  try {
    regras.value = await listarRegras();
  } finally {
    loadingRegras.value = false;
  }
}

function abrirNovaRegra() {
  formAberto.value = true;
  erroRegra.value = '';
  novaRegra.value = { chave: '', valor: '', descricao: '', categoria: 'REDE' };
}

function cancelarNovaRegra() {
  formAberto.value = false;
  erroRegra.value = '';
}

async function salvarNovaRegra() {
  const chave = novaRegra.value.chave.trim().toUpperCase();
  if (!chave || !novaRegra.value.valor.trim() || !novaRegra.value.descricao.trim()) {
    erroRegra.value = 'Preencha chave, valor e descrição.';
    return;
  }
  if (!/^[A-Z0-9_]+$/.test(chave)) {
    erroRegra.value = 'Chave deve usar apenas maiúsculas, números e _.';
    return;
  }
  salvandoRegra.value = true;
  erroRegra.value = '';
  try {
    const criada = await criarRegra({ ...novaRegra.value, chave });
    regras.value = [...regras.value, criada].sort((a, b) => a.chave.localeCompare(b.chave));
    formAberto.value = false;
  } catch (e: any) {
    erroRegra.value = e?.response?.data?.message || 'Não consegui salvar a regra agora.';
  } finally {
    salvandoRegra.value = false;
  }
}

function iniciarEdicao(r: RegraNegocio) {
  editandoChave.value = r.chave;
  regraEmEdicao.value = { valor: r.valor, descricao: r.descricao, categoria: r.categoria };
  erroRegra.value = '';
}

function cancelarEdicao() {
  editandoChave.value = null;
  erroRegra.value = '';
}

async function salvarEdicao(chave: string) {
  if (!regraEmEdicao.value.valor.trim() || !regraEmEdicao.value.descricao.trim()) {
    erroRegra.value = 'Preencha valor e descrição.';
    return;
  }
  salvandoRegra.value = true;
  erroRegra.value = '';
  try {
    const atualizada = await editarRegra(chave, regraEmEdicao.value);
    const idx = regras.value.findIndex((r) => r.chave === chave);
    if (idx !== -1) regras.value[idx] = atualizada;
    editandoChave.value = null;
  } catch (e: any) {
    erroRegra.value = e?.response?.data?.message || 'Não consegui salvar a alteração agora.';
  } finally {
    salvandoRegra.value = false;
  }
}

async function confirmarExclusao(chave: string) {
  if (excluindoChave.value !== chave) {
    excluindoChave.value = chave;
    return;
  }
  try {
    await excluirRegra(chave);
    regras.value = regras.value.filter((r) => r.chave !== chave);
  } finally {
    excluindoChave.value = null;
  }
}

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

watch(modo, (m) => {
  // Regras de negócio é restrita ao admin do hub — se por algum motivo o
  // estado chegar aqui sem permissão (ex: race de carregamento do usuário),
  // volta pra Consulta em vez de deixar a tela de regras acessível.
  if (m === 'regras' && !isHubAdmin.value) { modo.value = 'consulta'; return; }
  if (m === 'gestao' && agregados.value.length === 0) carregarAgregados();
  if (m === 'gestao' && !resumoGestaoData.value) carregarResumoGestao();
  if (m === 'regras' && regras.value.length === 0) carregarRegras();
  if (m === 'gestao') rolarGestaoParaFinal();
});

// Ao restaurar uma conversa salva (F5), abre já rolado pra última mensagem,
// não pro topo do histórico.
onMounted(() => { rolarParaFinal(); carregarUsoCaio(); });
</script>

<style scoped>
/* altura: 100vh - header - padding vertical do .app-main (1.5rem topo + 1.5rem base) que
   envolve esta view — usar 2.75rem aqui sobrava ~4px e fazia o .app-main também rolar,
   duplicando a scrollbar por cima da do próprio painel. */
.view-diagnostico { padding: 1.5rem 2rem 2rem; height: calc(100vh - var(--header-h, 62px) - 3rem); display: flex; flex-direction: column; }

/* ── Shell: sidebar (marca + navegação + painel de gestão) + conteúdo principal ──
   Antes o título/legenda ocupavam uma faixa horizontal inteira e o chat ficava
   centralizado numa coluna estreita, sobrando espaço vazio nas laterais em
   telas largas. Agora essa lateral vira sidebar fixa e o chat ocupa o resto. */
.diag-shell { flex: 1; display: flex; gap: 2rem; min-height: 0; }

/* A sidebar em si não rola — só a navegação (fixa) + o topo do painel. Quem
   rola é o .diag-sidebar-scroll interno, pra nunca esconder Consulta/Gestão/
   Regras atrás de uma lista longa de POPs. */
.diag-sidebar { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; }

.diag-uso-caio { flex-shrink: 0; margin-top: .6rem; padding-top: .7rem; border-top: 1px solid var(--border); }
.diag-uso-caio-toggle {
  width: 100%; background: none; border: none; padding: .2rem; cursor: pointer;
  display: flex; flex-direction: column; gap: .35rem; font-family: var(--font-body);
}
.diag-uso-caio-linha { display: flex; justify-content: space-between; font-size: .72rem; color: var(--text-3); }
.diag-uso-caio-barra { height: 4px; border-radius: 2px; background: var(--surface-3); overflow: hidden; }
.diag-uso-caio-fill { height: 100%; border-radius: 2px; transition: width var(--transition); }
.diag-uso-caio-fill.nivel-normal  { background: var(--accent); }
.diag-uso-caio-fill.nivel-atencao { background: #ffb020; }
.diag-uso-caio-fill.nivel-critico { background: var(--error); }
.diag-uso-caio-detalhe {
  margin-top: .5rem; padding: .55rem .65rem; border-radius: var(--radius-sm);
  background: var(--surface-2); border: 1px solid var(--border-2);
  font-size: .74rem; color: var(--text-2); line-height: 1.4;
}
.diag-uso-caio-nota { margin-top: .25rem; color: var(--text-3); font-size: .68rem; }

.diag-brand { display: flex; align-items: center; gap: .55rem; padding: .1rem .3rem .9rem; flex-shrink: 0; }
.diag-brand-icon { display: flex; color: var(--accent); flex-shrink: 0; }
.diag-brand-title { font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; letter-spacing: .02em; }

.diag-nav { display: flex; flex-direction: column; gap: .15rem; flex-shrink: 0; }
.diag-nav-item {
  display: flex; align-items: center; gap: .65rem;
  padding: .6rem .7rem; border-radius: var(--radius-sm); border-left: 2px solid transparent;
  background: transparent; border-top: none; border-right: none; border-bottom: none;
  color: var(--text-2); font-family: var(--font-body); font-size: .83rem; font-weight: 600;
  text-align: left; cursor: pointer; transition: var(--transition); width: 100%;
}
.diag-nav-item svg { opacity: .6; flex-shrink: 0; }
.diag-nav-item:hover { color: var(--text); background: var(--surface-2); }
.diag-nav-item:hover svg { opacity: .9; }
.diag-nav-item.active { color: var(--accent); background: var(--accent-dim); border-left-color: var(--accent); }
.diag-nav-item.active svg { opacity: 1; }

.diag-sidebar-divisor { border-top: 1px solid var(--border); margin: 1.1rem .3rem .8rem; flex-shrink: 0; }
.diag-sidebar-scroll { flex: 1; min-height: 0; overflow-y: auto; padding-right: .25rem; }
.diag-sidebar-painel { display: flex; flex-direction: column; padding: 0 .3rem; }
/* Cards/grids do painel foram feitos para uma coluna larga — na sidebar estreita
   forçamos 1 coluna em vez de deixar o auto-fit/auto-fill quebrar layout. */
.diag-sidebar-painel .stat-cards,
.diag-sidebar-painel .pops-grid,
.diag-sidebar-painel .agregado-grid { grid-template-columns: 1fr; }

.diag-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }

@media (max-width: 880px) {
  .diag-shell { flex-direction: column; }
  .diag-sidebar { width: 100%; }
  .diag-sidebar-scroll { overflow-y: visible; max-height: none; }
}

/* ── Chat shell ── */
.chat-shell { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.chat-scroll { flex: 1; overflow-y: auto; padding: .5rem .25rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }

/* Tela vazia (sem troca de mensagens) — saudação grande e centralizada, com
   o input logo abaixo, no lugar do histórico em branco. */
.chat-shell-vazio { justify-content: center; }
.chat-hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 1rem; }
.chat-hero-title {
  font-family: var(--font-display); font-size: 1.85rem; font-weight: 500; letter-spacing: -.01em;
  color: var(--text-2); max-width: 34ch; line-height: 1.3;
}

/* Estilo do turno de assistente: bloco com fundo sutil, borda e padding —
   delimita visualmente a resposta em vez de deixá-la flutuando no fundo
   escuro sem contorno. Mensagem do usuário vira uma bolha à direita. */
.turno { width: 100%; max-width: 72ch; display: flex; flex-direction: column; }
.turno-ia {
  align-items: stretch;
  background: rgba(255, 255, 255, .035);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: .9rem 1.05rem;
}
.turno-usuario { align-items: flex-end; }

.turno-cabecalho { display: flex; align-items: baseline; gap: .5rem; margin-bottom: .4rem; }
.turno-label {
  font-family: var(--font-mono); font-size: .74rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--text-2);
}
.turno-hora { font-family: var(--font-mono); font-size: .72rem; color: var(--text-2); }

.turno-texto { font-size: .88rem; line-height: 1.6; color: var(--text); }
.turno-usuario .turno-texto {
  background: var(--surface-3);
  border-radius: 18px;
  padding: .65rem 1.05rem;
  max-width: 80%;
}
.turno-texto :where(p, ul, ol) { margin: 0 0 .6rem; }
.turno-texto :where(p, ul, ol):last-child { margin-bottom: 0; }
.turno-texto ul, .turno-texto ol { padding-left: 1.3rem; }
.turno-texto li { margin-bottom: .25rem; }
.turno-texto li:last-child { margin-bottom: 0; }
.turno-texto strong { color: var(--text); font-weight: 700; }

/* ── Candidatos ── */
.candidatos-lista { display: flex; flex-direction: column; gap: .3rem; margin-top: .3rem; }
.candidato-btn {
  display: flex; flex-direction: column; gap: .1rem; text-align: left; background: transparent;
  border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .5rem .7rem;
  cursor: pointer; transition: border-color .15s;
}
.candidato-btn:hover { border-color: var(--accent); }
.candidato-nome { font-size: .83rem; font-weight: 600; color: var(--text); }
.candidato-doc { font-size: .71rem; color: var(--text-3); font-family: var(--font-mono); }

/* Ação principal (vs. seleção neutra de candidato), sinaliza que é o
   próximo passo natural depois do resumo. */
.diagnostico-completo-btn { background: var(--accent-dim); border-color: var(--accent); align-items: center; }
.diagnostico-completo-btn:hover { background: var(--accent); }
.diagnostico-completo-btn:hover .candidato-nome { color: #000; }

/* ── Loading ── */
.loading-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.loading-dots span {
  width: 4px; height: 4px; border-radius: 50%; background: var(--text-3);
  animation: dot-pulse 1.1s ease-in-out infinite;
}
.loading-dots span:nth-child(2) { animation-delay: .15s; }
.loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes dot-pulse { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
.loading-label { font-size: .8rem; color: var(--text-3); margin-left: .5rem; }

.state-msg { display: flex; align-items: center; gap: .6rem; color: var(--text-2); font-size: .85rem; padding: 1.2rem 0; }

/* ── Resultado: seções simples, sem cartão ── */
.result-secoes { display: flex; flex-direction: column; gap: .85rem; margin-top: .1rem; }
.result-secao { display: flex; flex-direction: column; gap: .25rem; }
.result-secao-cabecalho { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.result-secao p { font-size: .87rem; line-height: 1.6; color: var(--text); }
.result-secao :where(p, ul, ol) { margin: 0 0 .5rem; }
.result-secao :where(p, ul, ol):last-child { margin-bottom: 0; }
.result-secao ul, .result-secao ol { padding-left: 1.2rem; }
.result-secao li { font-size: .87rem; line-height: 1.6; color: var(--text); margin-bottom: .2rem; }
.result-secao li:last-child { margin-bottom: 0; }
.result-secao strong { color: var(--text); font-weight: 700; }
.result-label {
  font-family: var(--font-mono); font-size: .7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em;
}
.result-label em { font-style: normal; font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--text-3); margin-left: .3rem; }

.label-diagnostico { color: var(--accent); }
.label-erro { color: var(--error); }
.label-erro-ok { color: var(--text-2); }
.label-sugestao { color: var(--success); }

.btn-copiar {
  display: flex; align-items: center; gap: .3rem; flex-shrink: 0;
  font-family: var(--font-body); font-size: .68rem; font-weight: 600; color: var(--text-3);
  background: transparent; border: none; border-radius: var(--radius-sm);
  padding: .15rem .35rem; cursor: pointer; transition: all .15s;
}
.btn-copiar:hover { color: var(--accent); background: var(--surface-2); }

/* ── Input do chat ── */
.chat-input-shell { flex-shrink: 0; border-top: 1px solid var(--border); padding-top: .9rem; margin-top: .25rem; }
.chat-shell-vazio .chat-input-shell { border-top: none; max-width: 640px; width: 100%; margin: 1.75rem auto 0; padding-top: 0; }
.chat-toolbar { display: flex; justify-content: flex-end; padding: 0 .25rem .5rem; }
.chat-cliente-ativo {
  display: flex; justify-content: space-between; align-items: center; padding: 0 .25rem .7rem;
  font-size: .78rem; color: var(--text-2);
}
.chat-cliente-ativo strong { color: var(--text); }
.btn-trocar {
  font-family: var(--font-body); font-size: .76rem; font-weight: 600; color: var(--text-2);
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-sm);
  padding: .45rem .9rem; cursor: pointer; transition: var(--transition);
}
.btn-trocar:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-dim); }

.chat-input-row {
  display: flex; align-items: center; gap: .5rem; padding: .3rem .4rem .3rem 1.1rem;
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: 999px;
  transition: border-color .15s, box-shadow .15s;
}
.chat-input-row:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.chat-input-row input {
  flex: 1; font-family: var(--font-body); font-size: .88rem; background: transparent; color: var(--text);
  border: none; padding: .55rem 0; outline: none;
}
.chat-input-row input::placeholder { color: var(--text-2); }
.btn-enviar {
  display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; flex-shrink: 0;
  color: #04141a; background: var(--accent); border: none; border-radius: 50%;
  cursor: pointer; transition: var(--transition);
}
.btn-enviar:hover:not(:disabled) { filter: brightness(1.1); box-shadow: var(--shadow); }
.btn-enviar:disabled { opacity: .35; cursor: not-allowed; background: var(--surface-3); color: var(--text-3); }

/* ── Painel de gestão (agora vive na sidebar — ver .diag-sidebar-painel) ── */
.gestao-divisor { border-top: 1px solid var(--border); margin: 1.5rem 0; }

.gestao-sugestoes { display: flex; flex-wrap: wrap; gap: .4rem; padding: 0 .25rem .7rem; }
.chip-sugestao {
  font-family: var(--font-body); font-size: .72rem; font-weight: 600; color: var(--text-2);
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: 999px;
  padding: .35rem .8rem; cursor: pointer; transition: var(--transition);
}
.chip-sugestao:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); background: var(--accent-dim); }
.chip-sugestao:disabled { opacity: .5; cursor: not-allowed; }

.secao-titulo {
  font-family: var(--font-mono); font-size: .7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--text-3); margin: 0 0 .8rem;
}

/* Cards de estatística — compactos, pensados pra sidebar estreita (~230px) */
.stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .55rem; margin-bottom: 1.1rem; }
.stat-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: .7rem .8rem; display: flex; flex-direction: column; gap: .2rem;
}
.stat-icon {
  width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; margin-bottom: .1rem;
}
.stat-icon svg { width: 12px; height: 12px; }
.stat-icon-vendedor { color: var(--accent); background: var(--accent-dim); }
.stat-icon-vendas { color: var(--success); background: var(--success-bg); }
.stat-icon-rede { color: var(--accent-2); background: rgba(199, 255, 0, 0.1); }
.stat-icon-retencao { color: var(--refid); background: rgba(168, 85, 247, 0.12); }
.stat-label {
  font-family: var(--font-mono); font-size: .66rem; text-transform: uppercase; letter-spacing: .03em;
  color: var(--text-3); font-weight: 700;
}
.stat-valor { font-family: var(--font-display); font-size: .95rem; font-weight: 700; color: var(--text); line-height: 1.25; }
.stat-sub { font-size: .76rem; color: var(--text-2); font-weight: 500; }
.stat-sub-destaque strong { color: var(--text); }

.piores-lista { display: flex; flex-direction: column; margin-bottom: 1.75rem; }
.pior-item {
  display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; flex-wrap: wrap;
  padding: .55rem .1rem; border-bottom: 1px solid var(--border);
}
.pior-item:last-child { border-bottom: none; }
.pior-nome { font-size: .84rem; font-weight: 600; color: var(--text); }
.pior-detalhe { font-family: var(--font-mono); font-size: .76rem; color: var(--text-2); white-space: nowrap; }

.auditoria-aviso { font-size: .78rem; color: var(--text-2); margin-bottom: .8rem; line-height: 1.5; }
.auditoria-lista { display: flex; flex-direction: column; margin-bottom: 1.75rem; }
.auditoria-item {
  display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; flex-wrap: wrap;
  padding: .55rem .1rem; border-bottom: 1px solid var(--border);
}
.auditoria-item:last-child { border-bottom: none; }
.auditoria-nome { font-size: .84rem; font-weight: 600; color: var(--text); }
.auditoria-detalhe { font-size: .78rem; color: var(--text-2); }
.auditoria-ok { color: var(--success); font-weight: 700; }
.auditoria-erro { color: var(--error); font-weight: 700; }
.stat-alta { color: var(--success); }
.stat-baixa { color: var(--error); }

/* Grid de POPs */
/* Legenda única compartilhada por todos os cards — a cor de cada segmento
   só carrega dado se o gestor souber o que ela significa. */
.pop-legenda-global { display: flex; flex-wrap: wrap; gap: .3rem 1rem; margin-bottom: .7rem; }
.legenda-item { display: flex; align-items: center; gap: .35rem; font-size: .76rem; color: var(--text-2); }
.legenda-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

.pops-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .7rem; margin-bottom: 0; }
.pop-card {
  position: relative;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: .8rem .9rem; display: flex; flex-direction: column; gap: .5rem;
}
.pop-card-critico { border-color: rgba(255, 42, 95, .3); }
.pop-card-destaque { border-color: var(--error); box-shadow: 0 0 0 1px var(--error), 0 0 18px rgba(255, 42, 95, .25); }
.pop-cabecalho { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }
.pop-cabecalho-direita { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }
.pop-nome { font-size: .82rem; font-weight: 700; color: var(--text); }
.pop-total { font-family: var(--font-mono); font-size: .72rem; color: var(--text-2); }
.pop-badge {
  font-family: var(--font-mono); font-size: .64rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .04em; padding: .15rem .45rem; border-radius: 3px; flex-shrink: 0;
}
.pop-badge-critico { color: var(--error); background: var(--error-bg); }
.pop-badge-atencao { color: #f59e0b; background: rgba(245, 158, 11, .12); }
.pop-badge-normal { color: var(--success); background: var(--success-bg); }
.pop-barra { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--surface-3); gap: 1px; }
.seg { display: block; height: 100%; }
.seg-normal    { background: var(--success); }
.seg-atencao   { background: #f59e0b; }
.seg-critico   { background: var(--error); }
.seg-fora      { background: #64748b; }
.seg-semleitura{ background: var(--border-2); }
/* Empilhado (não lado a lado) — numa sidebar estreita, duas informações na
   mesma linha obrigavam a fonte a ficar pequena demais pra caber. */
.pop-legenda { display: flex; flex-direction: column; gap: .15rem; font-size: .76rem; color: var(--text-2); font-weight: 500; }

/* Estado de "ainda não há dado" — deliberadamente discreto (linha, não hero
   centralizado): é informação de estado, não conteúdo principal da tela. */
.empty-agregado {
  display: flex; align-items: flex-start; text-align: left; gap: .7rem;
  padding: .9rem 0; color: var(--text-2);
}
.empty-agregado svg { color: var(--text-3); flex-shrink: 0; margin-top: .1rem; }
.empty-title { font-family: var(--font-body); font-size: .85rem; font-weight: 700; color: var(--text-2); }
.empty-sub { font-size: .78rem; max-width: 480px; line-height: 1.5; margin-top: .15rem; }

.agregado-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: .8rem; }
.agregado-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1rem 1.2rem; }
.agregado-dim { font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; color: var(--text-3); font-weight: 700; }
.agregado-chave { font-family: var(--font-mono); font-size: .95rem; margin-top: .2rem; }
.agregado-narrativa { font-size: .82rem; color: var(--text-2); margin-top: .5rem; line-height: 1.5; }

/* ── Regras de negócio ── */
.regras-shell { display: flex; flex-direction: column; gap: 1.1rem; overflow-y: auto; padding-bottom: 1rem; }
.regras-toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.regras-info { font-size: .82rem; color: var(--text-2); line-height: 1.5; max-width: 560px; }
.btn-nova-regra {
  font-family: var(--font-body); font-size: .78rem; font-weight: 600; color: var(--text);
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-sm);
  padding: .45rem .8rem; cursor: pointer; transition: var(--transition); flex-shrink: 0; white-space: nowrap;
}
.btn-nova-regra:hover { border-color: var(--accent); }

.regra-form {
  border: 1px solid var(--border-2); border-radius: var(--radius-sm); padding: .9rem 1rem;
  display: flex; flex-direction: column; gap: .7rem; background: var(--surface);
}
.regra-form-grid { display: grid; grid-template-columns: 1fr 140px 1fr; gap: .7rem; }
.regra-form label, .regra-form-descricao {
  display: flex; flex-direction: column; gap: .3rem; font-size: .7rem; color: var(--text-3);
  font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
}
.regra-form input, .regra-form select, .regra-form textarea {
  font-family: var(--font-body); font-size: .85rem; font-weight: 400; text-transform: none;
  letter-spacing: normal; color: var(--text); background: var(--surface-2);
  border: 1px solid var(--border-2); border-radius: var(--radius-sm); padding: .5rem .7rem; outline: none;
}
.regra-form input:focus, .regra-form select:focus, .regra-form textarea:focus { border-color: var(--accent); }
.regra-form textarea { resize: vertical; }
.regra-erro { font-size: .78rem; color: var(--error); }
.regra-form-acoes { display: flex; justify-content: flex-end; gap: .5rem; }
.btn-cancelar, .btn-salvar {
  font-family: var(--font-body); font-size: .78rem; font-weight: 600; border-radius: var(--radius-sm);
  padding: .4rem .85rem; cursor: pointer; transition: var(--transition); border: 1px solid transparent;
}
.btn-cancelar { color: var(--text-2); background: transparent; border-color: var(--border-2); }
.btn-cancelar:hover { color: var(--text); }
.btn-salvar { color: #04141a; background: var(--accent); }
.btn-salvar:hover:not(:disabled) { filter: brightness(1.1); }
.btn-salvar:disabled { opacity: .5; cursor: not-allowed; }

.regras-lista { display: flex; flex-direction: column; }
.regra-row {
  padding: .9rem .8rem; border-bottom: 1px solid var(--border-2);
  display: flex; flex-direction: column; gap: .35rem;
}
.regra-row:nth-child(even) { background: var(--surface); }
.regra-row:last-child { border-bottom: none; }
.regra-main { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
.regra-categoria {
  font-family: var(--font-mono); font-size: .65rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .04em; color: var(--text-3); border: 1px solid var(--border-2); border-radius: 3px; padding: .1rem .4rem;
}
.regra-chave { font-family: var(--font-mono); font-size: .85rem; font-weight: 700; color: var(--text); }
.regra-chave-fixa { font-family: var(--font-mono); font-size: .85rem; font-weight: 700; color: var(--text); display: flex; align-items: center; }
.regra-valor { font-size: .84rem; color: var(--accent); font-weight: 600; }
.regra-descricao { font-size: .82rem; color: var(--text-2); line-height: 1.5; }
.regra-rodape { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: .1rem; flex-wrap: wrap; }
.regra-meta { font-size: .7rem; color: var(--text-2); }
.regra-acoes { display: flex; gap: .45rem; flex-shrink: 0; align-items: center; }

/* Botões de ícone (Editar/Excluir) — substituem os antigos links de texto */
.icon-btn {
  display: flex; align-items: center; justify-content: center; gap: .35rem;
  width: 30px; height: 30px; padding: 0 .5rem; flex-shrink: 0;
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-sm);
  color: var(--text-2); cursor: pointer; transition: all var(--transition);
}
.icon-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-dim); }
.icon-btn-perigo {
  width: auto; padding: 0 .65rem; color: var(--error);
  border-color: rgba(255, 42, 95, .35); background: var(--error-bg);
}
.icon-btn-perigo:hover { color: var(--error); border-color: var(--error); background: var(--error-bg); filter: brightness(1.2); }
.icon-btn-confirm-label { font-size: .72rem; font-weight: 600; white-space: nowrap; }

/* ── Baixar arquivo gerado (PDF/Excel) pelo CAIO ── */
.btn-baixar-arquivo {
  display: flex; align-items: center; gap: .4rem;
  font-family: var(--font-body); font-size: .76rem; font-weight: 600; color: var(--accent);
  background: var(--accent-dim); border: 1px solid var(--accent); border-radius: var(--radius-sm);
  padding: .45rem .75rem; margin-top: .7rem; cursor: pointer; transition: var(--transition);
}
.btn-baixar-arquivo:hover:not(:disabled) { filter: brightness(1.15); }
.btn-baixar-arquivo:disabled { opacity: .6; cursor: default; }

/* ── Feedback (acertou/errou) — mesmo padrão em Consulta e Gestão ── */
.feedback-row { display: flex; align-items: center; gap: .5rem; margin-top: .7rem; flex-wrap: wrap; }
.feedback-pergunta { font-size: .74rem; color: var(--text-2); }
.feedback-btn {
  display: flex; align-items: center; gap: .35rem;
  font-family: var(--font-body); font-size: .74rem; font-weight: 600; color: var(--text-2);
  background: transparent; border: none; border-radius: 999px;
  padding: .4rem .6rem; cursor: pointer; transition: var(--transition);
}
.feedback-btn:hover { color: var(--text); background: var(--surface-2); }
.feedback-btn-up:hover { color: var(--success); background: var(--success-bg); }
.feedback-btn-down:hover { color: var(--error); background: var(--error-bg); }
.feedback-chip {
  display: inline-flex; align-items: center; gap: .4rem;
  font-size: .74rem; font-weight: 600; padding: .35rem .7rem; border-radius: var(--radius-sm);
}
.feedback-chip-ok { color: var(--success); background: var(--success-bg); }
.feedback-chip-erro { color: var(--error); background: var(--error-bg); }
</style>

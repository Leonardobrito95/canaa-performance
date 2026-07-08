# Dashboard de Retenção de Clientes
### Como os números são calculados

---

## De onde vêm os dados?

Todos os dados exibidos no dashboard vêm diretamente do **IXC**, o sistema da Canaã Telecom.

O sistema lê automaticamente os chamados do IXC que possuem o assunto **"Cancelamento/Retenção"** e, com base no diagnóstico registrado pela operadora ao fechar cada chamado, classifica o resultado como **Retido**, **Não Retido** ou **Pendente**.

> Ou seja: o dashboard não exige nenhum lançamento manual. Tudo que a operadora registrar no IXC aparece aqui automaticamente.

---

## O que é cada número da tela

### Tratadas
> Total de chamados de cancelamento recebidos no período selecionado.

Inclui todos os chamados, independente do resultado — retidos, não retidos e ainda em aberto (pendentes).

---

### Retidas
> Chamados em que a operadora conseguiu reverter o cancelamento.

O sistema identifica uma retenção pelo **diagnóstico final** registrado no chamado do IXC. Existem diagnósticos que indicam que o cliente ficou (ex: "Retido com desconto", "Retido com upgrade de plano", etc.) e diagnósticos que indicam que o cliente saiu (ex: "Cancelado a pedido do cliente", "Inadimplência", etc.).

---

### Não Retidas
> Chamados em que o cancelamento foi confirmado.

---

### Pendentes (não aparece como card, mas existem)
> Chamados que ainda não têm um diagnóstico final registrado.

A diferença entre **Tratadas** e a soma de **Retidas + Não Retidas** são os chamados ainda em aberto, sem diagnóstico fechado. É normal que esse número exista no meio do mês.

**Exemplo prático:**
- Tratadas: 66
- Retidas: 3 + Não Retidas: 49 = 52
- Pendentes: 66 − 52 = **14 chamados ainda sem diagnóstico final**

---

### % Reversão
> Percentual de chamados que foram revertidos em relação ao total tratado.

```
% Reversão = Retidas ÷ Tratadas × 100
```

**Exemplo:** 3 retidas ÷ 66 tratadas = **4,5%**

---

### Total Comissões
> Soma das comissões de todas as operadoras que atingiram a meta no período.

---

## Como a comissão é calculada

A comissão é individual por operadora e funciona por **faixas de meta**, contando apenas as **retenções confirmadas** de cada uma:

| Meta atingida | Retenções no mês | Comissão |
|---------------|-----------------|----------|
| Faixa 1 | 70 ou mais retenções | **R$ 400,00** |
| Faixa 2 | 90 ou mais retenções | **R$ 550,00** |
| Faixa 3 | 110 ou mais retenções | **R$ 750,00** |
| Abaixo da meta | Menos de 70 retenções | **R$ 0,00** |

> As faixas são **acumulativas**: quem atinge 110 recebe R$ 750, não R$ 400 + R$ 550 + R$ 750.

---

## Filtros disponíveis

| Filtro | O que faz |
|--------|-----------|
| **Período** | Filtra os chamados pela **data de abertura** no IXC. "Este mês" considera do dia 1 até hoje. |
| **Operador** | Filtra para mostrar somente os chamados de uma operadora específica. |

---

## Ranking de Retenção

Lista as operadoras ordenadas da que mais reteve para a que menos reteve.

- **Botão QTD** — exibe a quantidade de clientes retidos
- **Botão VALOR** — exibe o valor da comissão correspondente

---

## Observações importantes

**1. O resultado depende do diagnóstico registrado no IXC**
Se a operadora fechar um chamado com um diagnóstico incorreto (ou esquecer de fechar), o sistema não consegue classificar o resultado corretamente. Chamados sem diagnóstico ficam como "Pendente" e **não contam para a meta**.

**2. Os números mudam ao longo do mês**
Como novos chamados são abertos e diagnósticos são registrados diariamente, o dashboard é dinâmico. O fechamento oficial da meta deve ser feito no **último dia do mês** ou quando todos os chamados do período estiverem com diagnóstico registrado.

**3. Somente as operadoras cadastradas aparecem**
O dashboard exibe apenas as operadoras autorizadas no módulo de Retenção. Para incluir ou remover uma operadora, é necessário solicitar ao time de TI.

---

*Documento gerado em junho/2026 — Canaã Performance · BDR Commission*

# Manual do Usuário — Canaã Performance

**Versão:** 1.0 — Abril/2026
**URL de acesso:** http://hub.canaatelecom.com.br/bdr/

---

## Sumário

1. [O que é o Canaã Performance?](#1-o-que-é-o-canaã-performance)
2. [Como acessar o sistema](#2-como-acessar-o-sistema)
3. [Perfis de acesso](#3-perfis-de-acesso)
4. [Módulo BDR — Lançamento de Comissões](#4-módulo-bdr--lançamento-de-comissões)
5. [Módulo Vendas — Dashboard e Fechamento](#5-módulo-vendas--dashboard-e-fechamento)
6. [Módulo Retenção (CS)](#6-módulo-retenção-cs)
7. [Módulo Dashboards (Hub Power BI)](#7-módulo-dashboards-hub-power-bi)
8. [Padrões obrigatórios de assinatura](#8-padrões-obrigatórios-de-assinatura)
9. [Dúvidas e erros comuns](#9-dúvidas-e-erros-comuns)

---

## 1. O que é o Canaã Performance?

O **Canaã Performance** é a plataforma oficial da Canaã Telecom para registro, cálculo e acompanhamento de comissões da equipe de vendas e retenção.

O sistema se conecta diretamente ao ERP IXC para validar contratos e clientes em tempo real, garantindo que todos os valores lançados sejam precisos e auditáveis.

**O que você pode fazer no sistema:**
- Registrar comissões de Upgrade, Downgrade e Refidelização
- Acompanhar suas comissões liberadas e bloqueadas
- Acompanhar metas de retenção (equipe CS)
- Visualizar dashboards analíticos Power BI
- Fechar a folha de pagamento mensal (Gestores)

---

## 2. Como acessar o sistema

1. Abra qualquer navegador (Chrome, Edge ou Firefox)
2. Acesse: **http://hub.canaatelecom.com.br/bdr/**
3. Digite seu **e-mail** e **senha** — os mesmos que você usa no IXC
4. Clique em **Entrar**

> 💡 Se você alterou sua senha no IXC, a mesma senha já vale aqui automaticamente.

---

## 3. Perfis de acesso

O sistema libera funcionalidades diferentes conforme o seu perfil no IXC:

| Perfil | Quem é | O que pode fazer |
|--------|--------|-----------------|
| **Consultor BDR** | Consultores de vendas | Lançar comissões, ver histórico próprio, ver dashboard de vendas |
| **CS (Retenção)** | Equipe de Customer Success | Ver módulo de retenção, ver histórico de comissões |
| **Gestor** | Líderes e gerência | Acesso completo: todas as funcionalidades acima + ajustes manuais + fechamento de folha |

**Abas visíveis por perfil:**

| Aba | Gestor | Consultor | CS |
|-----|--------|-----------|-----|
| Vendas (Dashboard) | ✅ | ✅ | ❌ |
| Comissões | ✅ | ✅ | ✅ |
| Lançar | ✅ | ✅ | ❌ |
| Dashboard BDR | ✅ | ✅ | ❌ |
| Retenção | ✅ | ❌ | ✅ |
| Dashboards | ✅ | ✅ | ✅ |

---

## 4. Módulo BDR — Lançamento de Comissões

### 4.1 Como lançar uma comissão

1. Clique na aba **Lançar** no menu superior
2. Digite o **número do contrato** no IXC — o sistema busca automaticamente o cliente e o valor atual do plano
3. Selecione o seu nome na lista de **Vendedores**
4. Escolha o **tipo de negociação**:

| Tipo | Quando usar | Comissão gerada |
|------|-------------|-----------------|
| **Upgrade** | Cliente aumentou o plano | Diferença: novo valor − valor atual |
| **Downgrade** | Cliente reduziu o plano | R$ 0,00 (registro obrigatório) |
| **Refidelização** | Cliente renovou o contrato | R$ 3,00 fixo |

5. Se for **Upgrade**, informe o novo valor do plano
6. Confira o valor calculado e clique em **Registrar**

> ⚠️ Para Upgrade, o novo valor **deve ser obrigatoriamente maior** que o valor atual. O sistema bloqueia lançamentos inválidos.

---

### 4.2 Acompanhando suas comissões

Na aba **Comissões**, você vê o histórico completo com filtros por período e tipo.

Cada comissão pode ter os seguintes status:

| Status | Significado |
|--------|------------|
| ✅ **Liberado** | Contrato ativo, assinado e fatura quitada — comissão será paga |
| 🔒 **Bloqueado — Assinatura Pendente** | Contrato ainda sem assinatura digital válida |
| 🔒 **Bloqueado — Fatura Não Quitada** | O cliente está com fatura em aberto |
| 🔒 **Bloqueado — Contrato Inativo** | Contrato foi cancelado ou suspenso no IXC |

> ⚠️ **Atenção:** Comissões bloqueadas não são pagas no fechamento do mês. Resolva as pendências antes do fechamento!

---

### 4.3 Ajustes Manuais (somente Gestores)

Na aba **Comissões**, o Gestor pode incluir ajustes manuais (créditos ou descontos) para qualquer vendedor:

1. Clique em **+ Ajuste**
2. Selecione o vendedor
3. Descreva o motivo do ajuste
4. Informe o valor (positivo para crédito, negativo para desconto)

Todos os ajustes ficam registrados permanentemente para auditoria.

---

## 5. Módulo Vendas — Dashboard e Fechamento

### 5.1 Dashboard de Vendas

A aba **Vendas** exibe os KPIs do mês atual:
- Total de contratos lançados
- Valor total de comissões liberadas
- Valor total de comissões bloqueadas (e motivo)
- Lista completa com status de cada contrato

---

### 5.2 Fechamento Mensal — Snapshot (somente Gestores)

O **Snapshot** congela as comissões de um mês para envio à folha de pagamento. Após o envio, os dados ficam somente-leitura.

**Passo a passo:**

1. No final do mês, acesse a aba **Vendas**
2. Selecione o mês de referência
3. Clique em **Gerar Snapshot** — o sistema verifica o status atual de todos os contratos no IXC
4. Revise a lista: resolva quaisquer pendências de assinatura ou fatura antes de enviar
5. Clique em **Enviar para Pagamento**
6. O sistema registra data, responsável e congela o mês

> ⚠️ **Atenção: esta ação é irreversível.** Após o envio, o mês não pode mais ser editado. Revise com cuidado antes de confirmar.

---

## 6. Módulo Retenção (CS)

A aba **Retenção** mostra o desempenho da equipe de Customer Success no mês.

### Metas e bônus mensais

| Nível | Retenções no mês | Bônus |
|-------|-----------------|-------|
| 🥉 **Bronze** | 70 aprovações | R$ 400,00 |
| 🥈 **Prata** | 90 aprovações | R$ 550,00 |
| 🥇 **Ouro** | 110 aprovações | R$ 750,00 |

Ao atingir cada nível, o gestor responsável recebe um alerta automático por e-mail.

Na aba **Detalhe**, você pode ver cada atendimento individualmente com data e situação.

---

## 7. Módulo Dashboards (Hub Power BI)

A aba **Dashboards** dá acesso aos relatórios analíticos da empresa integrados ao Power BI.

**Como usar:**
1. Clique na aba **Dashboards** no menu superior
2. Os painéis disponíveis para o seu perfil aparecerão em cards
3. Clique no card do relatório desejado para abri-lo
4. O relatório carrega diretamente na tela, sem precisar de login separado no Power BI
5. Use os filtros dentro do relatório para analisar os dados

> 💡 Cada relatório é exibido conforme as permissões do seu perfil. Nem todos os dashboards são visíveis para todos os usuários.

---

## 8. Padrões obrigatórios de assinatura

Para que uma comissão seja **liberada** no fechamento, o contrato precisa ter a assinatura digital registrada corretamente. O sistema verifica os arquivos automaticamente pelo **nome do arquivo**.

### Regra ZapSign

O arquivo deve ser nomeado com o **ID do contrato + nome do signatário**:

```
CORRETO:   123456 - Maria Silveira
INCORRETO: contrato_maria.pdf
INCORRETO: 123456_Maria_Silveira
```

### Regra GovSign

O arquivo deve ser nomeado com o **ID do contrato + GOV**:

```
CORRETO:   123456 - GOV
INCORRETO: 123456_gov.pdf
INCORRETO: 123456 governo
```

> ❌ Arquivos com nomenclatura errada **não são reconhecidos** pelo sistema e a comissão ficará bloqueada até a correção.

---

## 9. Dúvidas e erros comuns

**"O contrato não foi encontrado"**
> O sistema só reconhece contratos com status **Ativo** no IXC. Se o contrato foi ativado recentemente, aguarde a atualização do status no IXC e tente novamente.

**"Meu Upgrade não está sendo aceito"**
> Para Upgrade, o novo valor informado deve ser **estritamente maior** que o valor atual do contrato no IXC. Verifique se os valores estão corretos.

**"Minha comissão aparece como bloqueada"**
> Verifique: (1) se o arquivo de assinatura segue o padrão correto de nomenclatura, e (2) se a fatura do cliente está quitada. Resolva a pendência e o status será atualizado automaticamente.

**"O Downgrade registrou R$ 0,00"**
> Isso está correto. Por política da empresa, reduções de plano não geram comissão, mas o registro é **obrigatório**. Comissões não registradas dentro do mês são consideradas inexistentes.

**"Minha sessão expirou"**
> O sistema encerra a sessão após **8 horas** de uso. Basta fazer login novamente.

---

*Dúvidas ou problemas: entre em contato com o time de TI ou gestão comercial.*

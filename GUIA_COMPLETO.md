# BDR Commission — Guia Completo de Uso e Análise do Sistema

---

## Sumário

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura](#2-arquitetura)
3. [Perfis de Acesso](#3-perfis-de-acesso)
4. [Passo a Passo — Instalação e Configuração](#4-passo-a-passo--instalação-e-configuração)
5. [Passo a Passo — Uso do Sistema](#5-passo-a-passo--uso-do-sistema)
6. [Módulos em Detalhe](#6-módulos-em-detalhe)
7. [Alertas Automáticos](#7-alertas-automáticos)
8. [Regras de Negócio](#8-regras-de-negócio)
9. [Sugestões de Melhoria](#9-sugestões-de-melhoria)

---

## 1. Visão Geral do Sistema

O **BDR Commission** é uma plataforma web interna da **Canaã Telecom** para gerenciar comissões da equipe BDR (Business Development Representatives). O sistema integra dados do ERP IXC em tempo real e oferece dashboards por papel (role) de usuário.

**O que o sistema faz:**
- Registra comissões de Upgrade, Downgrade e Refidelização de contratos
- Calcula automaticamente o valor de cada comissão pelas regras definidas
- Exibe dashboards de vendas com KPIs (valores liberados, bloqueados, status de assinatura)
- Monitora a performance de retenção de clientes (equipe CS/SAC)
- Envia alertas automáticos por e-mail para gestores e operadores
- Gera snapshots mensais para fechamento de folha de pagamento

---

## 2. Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                     Usuário (Navegador)                     │
│                   http://localhost:8090                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│               Frontend — Vue 3 + Vite (Nginx)               │
│                       Porta 8090                            │
│   Abas: Dashboard | Comissões | Lançar | BDR | Retenção     │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP (proxied pelo Nginx)
┌─────────────────────────▼───────────────────────────────────┐
│            Backend — Node.js + Express + TypeScript         │
│                       Porta 3000                            │
│   Módulos: auth / bdr / vendas / retencao / alertas         │
└──────────────┬──────────────────────┬───────────────────────┘
               │                      │
┌──────────────▼──────────┐  ┌────────▼──────────────────────┐
│  PostgreSQL 16          │  │  MariaDB — ERP IXC (leitura)  │
│  (Banco de aplicação)   │  │  IP: 10.0.0.20:3306        │
│  Escrita + Leitura      │  │  Somente leitura               │
└─────────────────────────┘  └───────────────────────────────┘
```

**Fluxo de autenticação:**
1. Usuário informa credenciais (e-mail + senha do IXC)
2. Backend valida contra o banco IXC (MariaDB)
3. Token JWT é gerado com validade de 8 horas
4. Todas as requisições seguintes usam o token no header `Authorization: Bearer <token>`

---

## 3. Perfis de Acesso

| Perfil | Grupos IXC | Permissões |
|--------|-----------|------------|
| **Gestor** | 134, 101, 147, 140, 123 | Acesso total: lança comissões, cria/exclui ajustes manuais, fecha snapshots mensais, envia para folha |
| **Consultor** | demais grupos | Lança comissões, visualiza próprio histórico, acessa dashboard de vendas |
| **CS** | Grupo 109 | Acessa módulo de Retenção + histórico de comissões |

**Abas visíveis por perfil:**

| Aba | Gestor | Consultor | CS |
|-----|--------|-----------|-----|
| Dashboard (Vendas) | Sim | Sim | Não |
| Comissões | Sim | Sim | Sim |
| Lançar | Sim | Sim | Não |
| Dashboard BDR | Sim | Sim | Não |
| Retenção | Sim | Não | Sim |

---

## 4. Passo a Passo — Instalação e Configuração

### Pré-requisitos

- Docker + Docker Compose instalados na máquina host
- Acesso à rede onde o servidor IXC está (IP `10.0.0.20`)
- Credenciais do banco de dados IXC (somente leitura)
- Token da API IXC (`IXC_TOKEN`)

---

### Passo 1 — Clonar/obter o projeto

```bash
# Navegue até o diretório do projeto
cd /home/canaa/Governança/PowerBI/bdr-commission
```

---

### Passo 2 — Configurar variáveis de ambiente (raiz)

Crie/edite o arquivo `.env` na raiz do projeto:

```bash
# Arquivo: .env (raiz)
MYSQL_HOST=10.0.0.20
MYSQL_PORT=3306
MYSQL_USER=consultas
MYSQL_PASSWORD=SUA_SENHA_AQUI
MYSQL_DATABASE=ixcprovedor
```

---

### Passo 3 — Configurar variáveis do backend

Crie/edite o arquivo `backend/.env`:

```bash
# Arquivo: backend/.env
DATABASE_URL=postgresql://bdr_user:bdr_password@postgres:5432/bdr_commission
JWT_SECRET=uma_chave_secreta_forte_aqui
IXC_TOKEN=seu_token_ixc_aqui
IXC_HOST=https://seu-host-ixc.com.br
NODE_ENV=production
PORT=3000
```

> O `DATABASE_URL` aponta para o container interno do PostgreSQL.
> O `JWT_SECRET` deve ser uma string longa e aleatória.

---

### Passo 4 — Subir os containers

```bash
# Na raiz do projeto:
docker compose up --build -d

# Verificar se todos os serviços subiram:
docker compose ps
```

Resultado esperado:

```
NAME                STATUS       PORTS
bdr-postgres        running      (interno, sem exposição externa)
bdr-backend         running      (interno, sem exposição externa)
bdr-frontend        running      0.0.0.0:8090->80/tcp
```

---

### Passo 5 — Verificar saúde da aplicação

```bash
# Verificar logs do backend
docker compose logs backend --tail=50

# Verificar se o banco está pronto
docker compose logs postgres --tail=20

# Testar health check
curl http://localhost:8090/health
```

Resposta esperada: `{ "status": "ok" }`

---

### Passo 6 — Primeiro acesso

Abra o navegador em: **http://localhost:8090**

Use as credenciais do seu usuário no IXC (e-mail + senha).

---

### Comandos úteis de manutenção

```bash
# Parar tudo sem apagar dados
docker compose down

# Parar e apagar banco de dados (CUIDADO: perde todos os dados)
docker compose down -v

# Reiniciar apenas o backend
docker compose restart backend

# Ver logs em tempo real
docker compose logs -f backend

# Acessar o banco de dados diretamente
docker compose exec postgres psql -U bdr_user -d bdr_commission
```

---

## 5. Passo a Passo — Uso do Sistema

### 5.1 Login

1. Acesse `http://localhost:8090`
2. Informe seu **e-mail** e **senha** cadastrados no IXC
3. Clique em **Entrar**
4. O sistema redireciona automaticamente para a aba correta conforme seu perfil

---

### 5.2 Lançar uma Comissão (Consultor ou Gestor)

**Aba: Lançar**

1. No campo **Número do Contrato**, informe o ID do contrato no IXC
2. O sistema busca automaticamente:
   - Nome do cliente
   - Valor atual do plano
3. Selecione o **Vendedor** responsável (lista carregada do IXC)
4. Selecione o **Tipo de Negociação**:
   - **Upgrade** — o cliente subiu de plano
   - **Downgrade** — o cliente baixou de plano
   - **Refidelização** — o cliente renovou o contrato
5. Se Upgrade: informe o **Novo Valor** do plano
6. O campo **Comissão** é calculado automaticamente:
   - Upgrade: `novo valor − valor atual`
   - Downgrade: R$ 0,00
   - Refidelização: R$ 3,00 fixo
7. Clique em **Registrar**
8. Aparece mensagem de confirmação

**Validações automáticas:**
- Contrato deve estar ativo (status 'A' no IXC)
- Para Upgrade: `valor_novo` obrigatoriamente maior que `valor_atual`
- Para Downgrade: `valor_novo` obrigatoriamente menor que `valor_atual`
- Vendedor deve pertencer aos grupos BDR do IXC (110 ou 134)

---

### 5.3 Visualizar Histórico de Comissões

**Aba: Comissões**

- **Consultor**: vê somente suas comissões
- **Gestor**: vê comissões de toda a equipe

Filtros disponíveis:
- Período (data inicial / data final)
- Tipo de negociação

A tabela exibe:
- Contrato, cliente, vendedor
- Tipo de negociação (tag colorida)
- Valor atual → valor novo
- Valor da comissão
- Data de registro

**Ajustes Manuais (somente Gestor):**
- Botão **+ Ajuste** para criar crédito ou débito manual
- Informar: vendedor, descrição, valor (pode ser negativo para desconto)
- Ajustes aparecem na lista com indicação visual separada

---

### 5.4 Dashboard de Vendas

**Aba: Dashboard (Vendas)**

Exibe KPIs do mês atual:
- Total de contratos
- Comissões liberadas (valor total)
- Comissões bloqueadas (e motivo)
- Contratos com assinatura pendente

Tabela de contratos com:
- Nome do cliente
- Vendedor
- Valor mensal
- Percentual de comissão
- Valor da comissão
- Status (liberado / bloqueado / assinatura pendente / fatura não quitada)

---

### 5.5 Snapshots Mensais — Fechamento de Folha (Gestor)

**Aba: Dashboard (Vendas)**

O snapshot "congela" o estado das comissões de um mês para envio à folha.

**Fluxo de fechamento:**

1. No final do mês, clique em **Gerar Snapshot** para o mês de referência
2. Revise a lista de comissões gerada
3. Corrija eventuais comissões bloqueadas (resolver pendências no IXC)
4. Clique em **Enviar para Pagamento**
5. O sistema marca o snapshot como enviado, registra data e responsável
6. Snapshots fechados ficam somente-leitura

> Snapshots de meses anteriores podem ser consultados pelo filtro de mês.

---

### 5.6 Dashboard BDR — Análise de Performance

**Aba: Dashboard BDR**

Exibe:
- Ranking de consultores por volume de comissões
- Distribuição por tipo de negociação (gráfico donut)
- Evolução mensal (gráfico de barras)
- Comparativo entre consultores

---

### 5.7 Módulo de Retenção (CS/Gestor)

**Aba: Retenção**

Exibe por operador:
- Total de retenções no mês
- Percentual de performance
- Nível de bônus atingido (Bronze/Prata/Ouro)
- Detalhe por ticket (aba "Detalhe")

**Metas e bônus:**

| Nível | Retenções Mínimas | Bônus |
|-------|-------------------|-------|
| Bronze | 70 | R$ 400,00 |
| Prata | 90 | R$ 550,00 |
| Ouro | 110 | R$ 750,00 |

---

## 6. Módulos em Detalhe

### Módulo BDR (Comissões)

**Arquivos principais:**
- `backend/src/modules/bdr/bdr.service.ts` — regras de cálculo
- `backend/src/modules/bdr/bdr.repository.ts` — acesso ao PostgreSQL e MariaDB
- `frontend/src/components/BdrForm.vue` — formulário de lançamento

**Endpoints:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/bdr/consultants` | Lista consultores (cache 5 min) |
| GET | `/api/v1/bdr/contracts/:id` | Valida contrato no IXC |
| POST | `/api/v1/bdr/commissions` | Registra comissão |
| GET | `/api/v1/bdr/commissions` | Histórico de comissões |
| POST | `/api/v1/bdr/adjustments` | Cria ajuste manual (gestor) |
| GET | `/api/v1/bdr/adjustments` | Lista ajustes |
| DELETE | `/api/v1/bdr/adjustments/:id` | Remove ajuste (gestor) |

---

### Módulo Vendas (Dashboard)

**Arquivos principais:**
- `backend/src/modules/vendas/vendas.service.ts` — cálculo de KPIs
- `backend/src/modules/vendas/snapshot.service.ts` — lógica de snapshots
- `frontend/src/views/VendasView.vue` — dashboard principal

**Endpoints:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/vendas/contracts` | Contratos com KPIs |
| GET | `/api/v1/vendas/comissoes/:mes` | Comissões do mês |
| GET | `/api/v1/vendas/snapshots` | Lista meses com snapshot |
| GET | `/api/v1/vendas/snapshots/:mes` | Snapshot de um mês |
| POST | `/api/v1/vendas/snapshots/:mes` | Gera/atualiza snapshot |
| POST | `/api/v1/vendas/snapshots/:mes/pagar` | Envia para folha |

---

### Módulo Retenção

**Arquivos principais:**
- `backend/src/modules/retencao/retencao.service.ts` — lógica de KPIs e metas
- `frontend/src/views/RetencaoView.vue` — dashboard de retenção

**Endpoints:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/retencao` | KPIs + lista de operadores |
| GET | `/api/v1/retencao/detalhe` | Detalhe por ticket |

---

## 7. Alertas Automáticos

O sistema executa 4 alertas diariamente às **08:00 (horário de Brasília)**:

### Alerta 1 — Assinatura Pendente
- **Quando:** Dias 15, 25 e 30 do mês
- **Condição:** Contratos com assinatura pendente há mais de 10 dias após ativação
- **Destinatário:** `comercial@exemplo.com.br`
- **Deduplicação:** 1 alerta por contrato por mês

### Alerta 2 — Fatura Não Quitada
- **Quando:** Dias 15, 25 e 30 do mês
- **Condição:** Contratos com fatura em aberto há mais de 10 dias
- **Destinatário:** `comercial@exemplo.com.br`
- **Deduplicação:** 1 alerta por contrato por mês

### Alerta 3 — Meta de Retenção Atingida
- **Quando:** Diariamente
- **Condição:** Operador atinge nível Bronze (70), Prata (90) ou Ouro (110)
- **Destinatário:** `sac@exemplo.com.br`
- **Deduplicação:** 1 alerta por operador por nível por mês

### Alerta 4 — Retenção Abaixo da Meta no Fim do Mês
- **Quando:** A partir do dia 25
- **Condição:** Operador ainda abaixo de 70 retenções no mês
- **Destinatário:** `sac@exemplo.com.br`
- **Deduplicação:** 1 alerta por operador por mês

---

## 8. Regras de Negócio

### Cálculo de Comissões

| Tipo de Negociação | Cálculo | Validação |
|-------------------|---------|-----------|
| **Upgrade** | `valor_novo − valor_atual` | `valor_novo` deve ser > `valor_atual` |
| **Downgrade** | R$ 0,00 | `valor_novo` deve ser < `valor_atual` |
| **Refidelização** | R$ 3,00 fixo | Sem campo de valor novo |

### Status de Comissão no Snapshot

| Status | Condição |
|--------|----------|
| Liberado | Contrato ativo, assinado e fatura quitada |
| Bloqueado — Assinatura Pendente | Contrato sem assinatura digital |
| Bloqueado — Fatura Não Quitada | Fatura em aberto |
| Bloqueado — Contrato Inativo | Contrato cancelado/suspenso |

### Snapshots

- Um snapshot por mês de referência (formato `YYYY-MM`)
- Pode ser regerado enquanto não marcado como "enviado para pagamento"
- Após envio: somente leitura
- Registro de quem enviou e quando

---

## 9. Sugestões de Melhoria

As sugestões abaixo foram identificadas com base na análise do código atual e representam melhorias práticas que não comprometem o funcionamento existente.

---

### [CRITICO] S1 — README desatualizado

**Problema:** O `README.md` não reflete o sistema atual. Cita apenas o módulo BDR original, sem mencionar autenticação, módulos de Vendas, Retenção e Alertas.

**Solução:** Substituir o conteúdo do `README.md` por este `GUIA_COMPLETO.md` adaptado, ou ao menos atualizar a seção de endpoints e a descrição dos módulos.

---

### [ALTO] S2 — Ausência de refresh token

**Problema:** O token JWT tem validade de 8 horas. Quando expira, o usuário recebe um erro 401 e precisa fazer login novamente sem aviso.

**Solução:** Implementar um mecanismo de refresh token ou exibir no frontend um alerta quando o token estiver próximo de expirar (ex: nos últimos 30 minutos), com opção de renovar automaticamente.

**Arquivo:** `backend/src/modules/auth/auth.service.ts` + `frontend/src/composables/useAuth.ts`

---

### [ALTO] S3 — Ausência de auditoria de lançamentos

**Problema:** Não há registro de quem criou ou deletou um registro de comissão. Se um Gestor excluir um ajuste, não há rastreabilidade.

**Solução:** Adicionar campos `criado_por` e `deletado_por` (soft delete com `deletado_em`) nas tabelas `Commission` e `Adjustment` no Prisma schema. Preencher via middleware com o usuário do JWT.

**Arquivo:** `backend/prisma/schema.prisma` + `backend/src/modules/bdr/bdr.repository.ts`

---

### [ALTO] S4 — Sem confirmação antes de "Enviar para Pagamento"

**Problema:** A ação de marcar um snapshot como enviado para folha é irreversível no sistema atual. Não há confirmação na UI.

**Solução:** Adicionar modal de confirmação no frontend com resumo do snapshot (total de contratos, valor total) antes de confirmar a ação.

**Arquivo:** `frontend/src/views/VendasView.vue`

---

### [MEDIO] S5 — Cache de consultores sem invalidação manual

**Problema:** A lista de consultores é cacheada por 5 minutos. Se um usuário novo for adicionado ao grupo BDR no IXC, o sistema não reflete imediatamente.

**Solução:** Adicionar endpoint `POST /api/v1/bdr/consultants/refresh` (acesso somente Gestor) para invalidar o cache manualmente, e exibir um botão "Atualizar lista" no formulário de lançamento.

**Arquivo:** `backend/src/modules/bdr/bdr.repository.ts`

---

### [MEDIO] S6 — Sem paginação no histórico de comissões

**Problema:** O endpoint `GET /api/v1/bdr/commissions` retorna todos os registros sem limite. Com o crescimento do volume de dados, isso pode causar lentidão.

**Solução:** Implementar paginação com parâmetros `page` e `limit` (ex: 50 por página) e `cursor`-based pagination via Prisma para melhor performance.

**Arquivo:** `backend/src/modules/bdr/bdr.repository.ts` + `frontend/src/views/ComissaoView.vue`

---

### [MEDIO] S7 — Campos de e-mail de alerta hardcoded

**Problema:** Os endereços de e-mail destinatários dos alertas estão escritos diretamente no código (`gestaocomercial.df@...`, `sac.df@...`).

**Solução:** Mover para variáveis de ambiente no `backend/.env`:
```
ALERT_EMAIL_COMERCIAL=comercial@exemplo.com.br
ALERT_EMAIL_SAC=sac@exemplo.com.br
```

**Arquivo:** `backend/src/modules/alertas/alertas.service.ts`

---

### [MEDIO] S8 — Ausência de logs estruturados

**Problema:** O backend usa `console.log` e `console.error` diretamente, sem níveis de log ou timestamps estruturados. Dificulta monitoramento em produção.

**Solução:** Adotar uma biblioteca leve como **pino** ou **winston** com saída em JSON. Facilita integração com ferramentas como Grafana Loki ou Datadog no futuro.

```bash
cd backend && npm install pino pino-pretty
```

---

### [BAIXO] S9 — Downgrade com comissão R$ 0,00 pode desmotivar lançamentos

**Problema:** Downgrade não gera comissão. Consultores podem ter baixo incentivo para registrar esse tipo de negociação, gerando subnotificação.

**Sugestão de negócio:** Considerar se não vale atribuir uma comissão simbólica (ex: R$ 1,50) para Downgrade, similar à Refidelização, para incentivar o registro correto e ter dados mais precisos sobre a carteira.

**Arquivo:** `backend/src/modules/bdr/bdr.service.ts`

---

### [BAIXO] S10 — ZapSign e GovSign sem tratamento de timeout explícito

**Problema:** As chamadas para serviços externos (ZapSign, GovSign) podem travar indefinidamente se o serviço externo não responder, travando a requisição do usuário.

**Solução:** Adicionar timeout explícito nas chamadas Axios (ex: 10 segundos) e tratar o caso de timeout com fallback gracioso (ex: exibir "status indisponível" em vez de erro 500).

**Arquivo:** `backend/src/modules/vendas/zapsign.service.ts` + `govsign.service.ts`

---

### [BAIXO] S11 — Ausência de testes automatizados

**Problema:** Não há testes unitários ou de integração no projeto. Mudanças nas regras de negócio (ex: cálculo de comissão) podem introduzir bugs sem detecção.

**Solução priorizada:**
1. Testes unitários para `bdr.service.ts` (cálculo de comissões)
2. Testes unitários para `retencao.service.ts` (cálculo de metas)
3. Testes de integração para os endpoints principais

```bash
cd backend && npm install --save-dev vitest @vitest/coverage-v8
```

---

### [BAIXO] S12 — Sem feedback visual de carregamento nas buscas

**Problema:** Quando o usuário digita um número de contrato, o sistema faz uma chamada à API sem feedback visual claro enquanto aguarda a resposta do IXC.

**Solução:** Adicionar estado de `loading` no `BdrForm.vue` com um spinner/skeleton durante a busca do contrato.

**Arquivo:** `frontend/src/components/BdrForm.vue`

---

## Resumo das Sugestões por Prioridade

| # | Prioridade | Sugestão | Esforço |
|---|-----------|----------|---------|
| S1 | Crítico | Atualizar README | Baixo (1h) |
| S2 | Alto | Refresh token / alerta de expiração | Médio (4h) |
| S3 | Alto | Auditoria de lançamentos | Médio (3h) |
| S4 | Alto | Confirmação antes de enviar para folha | Baixo (1h) |
| S5 | Médio | Invalidação manual de cache de consultores | Baixo (2h) |
| S6 | Médio | Paginação no histórico | Médio (4h) |
| S7 | Médio | E-mails de alerta em variáveis de ambiente | Baixo (30min) |
| S8 | Médio | Logs estruturados | Médio (3h) |
| S9 | Baixo | Revisar política de comissão de Downgrade | Decisão de negócio |
| S10 | Baixo | Timeout em chamadas externas | Baixo (1h) |
| S11 | Baixo | Testes automatizados | Alto (8h+) |
| S12 | Baixo | Loading nos formulários | Baixo (1h) |

---

*Documento gerado pela análise do código-fonte em 08/04/2026.*

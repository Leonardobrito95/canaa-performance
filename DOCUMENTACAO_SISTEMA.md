# Documentação Técnica — Canaã Performance

**Versão:** 1.0 — Abril/2026
**Ambiente de produção:** http://hub.canaatelecom.com.br/bdr/

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Stack de tecnologia](#3-stack-de-tecnologia)
4. [Banco de dados](#4-banco-de-dados)
5. [Módulos do sistema](#5-módulos-do-sistema)
6. [Regras de negócio](#6-regras-de-negócio)
7. [Alertas automáticos](#7-alertas-automáticos)
8. [Autenticação e controle de acesso (RBAC)](#8-autenticação-e-controle-de-acesso-rbac)
9. [Integração Power BI (Hub)](#9-integração-power-bi-hub)
10. [Deploy e infraestrutura](#10-deploy-e-infraestrutura)
11. [Variáveis de ambiente](#11-variáveis-de-ambiente)

---

## 1. Visão Geral

O **Canaã Performance** é uma plataforma web interna para cálculo, registro e auditoria de comissionamento da equipe BDR, retenção (CS) e campo da Canaã Telecom.

O sistema consome o banco de dados do ERP IXC (MariaDB) em modo somente-leitura para validações em tempo real, enquanto persiste os dados de negócio (comissões, snapshots, ajustes, logs) em um banco PostgreSQL próprio.

---

## 2. Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                    Usuário (Navegador)                       │
│              http://hub.canaatelecom.com.br/bdr/             │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS (porta 443)
┌──────────────────────────▼───────────────────────────────────┐
│                   Nginx (Reverse Proxy)                      │
│  /bdr/           → arquivos estáticos em /var/www/bdr/       │
│  /bdr/api/v1/    → proxy para localhost:3000 (backend)       │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP interno
┌──────────────────────────▼───────────────────────────────────┐
│         Backend — Node.js 20 + Express + TypeScript          │
│         Porta 3000 | Serviço: bdr-backend (systemd)          │
│  Módulos: auth / bdr / vendas / retencao / campo / hub       │
│  Jobs: alertas diários às 08:00 (node-cron)                  │
└───────────────┬──────────────────────┬───────────────────────┘
                │                      │
┌───────────────▼──────────┐  ┌────────▼──────────────────────┐
│   PostgreSQL 16           │  │  MariaDB — ERP IXC (leitura)  │
│   IP: 10.0.0.10:5432     │  │  IP: 10.0.0.20:3306           │
│   3 schemas:             │  │  Usuário: consultas (read-only)│
│   bdr / hub / comissao   │  └───────────────────────────────┘
└──────────────────────────┘
```

**Fluxo de autenticação:**
1. Usuário informa e-mail e senha (credenciais IXC)
2. Backend valida contra o banco IXC — tabela `usuario`, hash MD5
3. Token JWT gerado com validade de 8 horas
4. Todas as requisições subsequentes usam `Authorization: Bearer <token>`
5. RBAC baseado no campo `id_grupo` do IXC

---

## 3. Stack de tecnologia

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Vue 3 + Vite + TypeScript |
| Backend | Node.js 20 + Express + TypeScript |
| ORM (PostgreSQL) | Prisma 5 |
| Conexão IXC | mysql2 (queries nativas, somente leitura) |
| Banco de dados próprio | PostgreSQL 16 |
| Banco ERP (externo) | MariaDB — ERP IXC |
| Servidor web | Nginx |
| Processo backend | systemd (`bdr-backend.service`) |
| E-mail (alertas) | SMTP — smtplw.com.br:587 |
| Power BI | SDK `powerbi-client` + Azure AD (Client Credentials) |
| Autenticação | JWT (jsonwebtoken) |
| Assinaturas | ZapSign API + GovSign (leitura de arquivos IXC) |

---

## 4. Banco de dados

### PostgreSQL — schemas e tabelas principais

**Schema `bdr`** — comissões e ajustes BDR:
- `Commission` — registros de comissão (id_contrato IXC, vendedor, tipo, valor, status)
- `Adjustment` — ajustes manuais do gestor
- `VendasSnapshot` — snapshots mensais imutáveis de fechamento
- `AlertaSent` — deduplicação de alertas enviados

**Schema `hub`** — portal de dashboards:
- `HubSector` — setores/categorias dos dashboards
- `HubDashboard` — dashboards cadastrados (título, URL, tipo, thumbnail)
- `HubPermission` — permissões por usuário IXC
- `HubDashboardSector` — relação dashboard ↔ setor
- `HubAccessLog` — log de visualizações e ações administrativas

**Schema `comissao`** — módulo Campo:
- `ComissaoEmpresa` — empresas terceirizadas
- `ComissaoLancamento` — lançamentos importados via planilha Excel
- `ComissaoAuditoria` — registros de auditoria por upload

### MariaDB IXC — tabelas consumidas (leitura)

| Tabela IXC | Uso no sistema |
|-----------|----------------|
| `usuario` | Autenticação (e-mail, senha MD5, id_grupo) |
| `cliente_contrato` | Validação de contratos (status, valor, cliente) |
| `cliente_arquivos` | Verificação de assinaturas (ZapSign/GovSign) |
| `fin_lanc_caixa` | Verificação de pagamento de faturas |
| `atendimento` | Dados de retenção (CS) |
| `cli_acao_atendimento` | Ações de atendimento (meta CS) |

---

## 5. Módulos do sistema

### 5.1 BDR — Comissões de vendas

**Função:** Registro e cálculo de comissões de Upgrade, Downgrade e Refidelização.

**Endpoints:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/bdr/consultants` | Lista consultores BDR (cache 5 min) |
| GET | `/api/v1/bdr/contracts/:id` | Valida contrato no IXC |
| POST | `/api/v1/bdr/commissions` | Registra comissão |
| GET | `/api/v1/bdr/commissions` | Histórico de comissões |
| POST | `/api/v1/bdr/adjustments` | Cria ajuste manual (gestor) |
| GET | `/api/v1/bdr/adjustments` | Lista ajustes |
| DELETE | `/api/v1/bdr/adjustments/:id` | Remove ajuste (gestor) |

---

### 5.2 Vendas — Dashboard e snapshots

**Função:** KPIs do mês corrente, status de liberação/bloqueio e fechamento mensal via snapshot imutável.

**Endpoints:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/vendas/contracts` | Contratos com KPIs do mês |
| GET | `/api/v1/vendas/comissoes/:mes` | Comissões de um mês |
| GET | `/api/v1/vendas/snapshots` | Lista meses com snapshot |
| GET | `/api/v1/vendas/snapshots/:mes` | Dados do snapshot de um mês |
| POST | `/api/v1/vendas/snapshots/:mes` | Gera/atualiza snapshot |
| POST | `/api/v1/vendas/snapshots/:mes/pagar` | Envia para folha (irreversível) |

---

### 5.3 Retenção (CS)

**Função:** Acompanhamento de metas e bônus da equipe de Customer Success.

**Endpoints:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/retencao` | KPIs + ranking de operadores |
| GET | `/api/v1/retencao/detalhe` | Detalhe por atendimento |

---

### 5.4 Campo — Comissão de terceirizadas

**Função:** Auditoria de comissões de empresas terceirizadas via upload de planilha Excel.

**Endpoints:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/comissao/empresas` | Lista empresas cadastradas |
| POST | `/api/v1/comissao/upload` | Importa planilha Excel |
| GET | `/api/v1/comissao/lancamentos` | Lista lançamentos importados |

---

### 5.5 Hub — Portal de dashboards Power BI

**Função:** Portal analítico com dashboards Power BI integrados via embed token (Azure AD).

**Endpoints:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/hub/dashboards` | Lista dashboards (por permissão do usuário) |
| GET | `/api/v1/hub/dashboards/:id/embed-token` | Gera token de embed Power BI |
| GET | `/api/v1/hub/sectors` | Lista setores |
| POST | `/api/v1/hub/dashboards` | Cria dashboard (admin) |
| PUT | `/api/v1/hub/dashboards/:id` | Atualiza dashboard (admin) |
| GET | `/api/v1/hub/logs` | Logs de acesso |

---

### 5.6 Alertas (job diário)

**Função:** Cron diário às 08:00 (horário de Brasília) via `node-cron`. Envia e-mails para gestores em 4 situações. Ver seção 7 para detalhes.

---

## 6. Regras de negócio

### Cálculo de comissões

| Tipo | Cálculo | Validação |
|------|---------|-----------|
| **Upgrade** | `valor_novo − valor_atual` | `valor_novo` obrigatoriamente > `valor_atual` |
| **Downgrade** | R$ 0,00 fixo | `valor_novo` obrigatoriamente < `valor_atual` |
| **Refidelização** | R$ 3,00 fixo | Sem campo de valor novo |

### Status de comissão no snapshot

| Status | Condição |
|--------|----------|
| **Liberado** | Contrato ativo + assinatura válida + fatura quitada |
| **Bloqueado — Assinatura Pendente** | Arquivo de assinatura ausente ou com nomenclatura inválida |
| **Bloqueado — Fatura Não Quitada** | Fatura em aberto no IXC |
| **Bloqueado — Contrato Inativo** | Contrato cancelado ou suspenso no IXC |

### Validação de assinaturas (Regex)

- **ZapSign:** arquivo deve corresponder ao padrão `^[0-9]+ - ` (ID do contrato + espaço-hífen-espaço + nome)
- **GovSign:** arquivo deve corresponder ao padrão `^[0-9]+-[Gg][Oo][Vv]` (ID do contrato + hífen + GOV)

O sistema mantém cache dessas verificações com TTL de 15 minutos, renovado via job em background.

### Snapshots

- Um snapshot por mês de referência (`YYYY-MM`)
- Pode ser regerado enquanto não marcado como "enviado para pagamento"
- Após `POST /snapshots/:mes/pagar`: campo `enviado = true`, somente-leitura
- Registra `enviado_por` (id do usuário IXC) e `enviado_em` (timestamp)

### Metas de retenção CS

| Nível | Mínimo de aprovações | Bônus |
|-------|---------------------|-------|
| Bronze | 70 | R$ 400,00 |
| Prata | 90 | R$ 550,00 |
| Ouro | 110 | R$ 750,00 |

---

## 7. Alertas automáticos

Job executado diariamente às **08:00 (horário de Brasília)** via `node-cron`.

| # | Nome | Quando dispara | Condição | Destinatário |
|---|------|---------------|----------|-------------|
| 1 | Assinatura Pendente | Dias 15, 25 e 30 | Contrato sem assinatura há > 10 dias | `ALERT_EMAIL_COMERCIAL` |
| 2 | Fatura Não Quitada | Dias 15, 25 e 30 | Fatura em aberto há > 10 dias | `ALERT_EMAIL_COMERCIAL` |
| 3 | Meta CS Atingida | Diariamente | Operador atinge Bronze/Prata/Ouro | `ALERT_EMAIL_SAC` |
| 4 | CS Abaixo da Meta | A partir do dia 25 | Operador com < 70 retenções no mês | `ALERT_EMAIL_SAC` |

**Deduplicação:** cada alerta é disparado no máximo 1 vez por contrato/operador por mês, controlado pela tabela `AlertaSent`.

---

## 8. Autenticação e controle de acesso (RBAC)

- Login via MariaDB IXC — tabela `usuario` (hash MD5 da senha)
- Token JWT com expiração de 8 horas — secret em `JWT_SECRET`
- Perfis mapeados pelo campo `id_grupo` do IXC:

| Perfil | Grupos IXC |
|--------|-----------|
| `gestor` | 134, 101, 147, 140, 123 |
| `cs` | 109 |
| `consultor` | demais grupos |

- Rotas administrativas do Hub exigem perfil `gestor` **e** que o `id` do usuário esteja em `HUB_SUPER_ADMIN_ID` (variável de ambiente)

---

## 9. Integração Power BI (Hub)

- **Fluxo de autenticação:** Azure AD — Client Credentials (`client_credentials`)
- **Token de acesso:** obtido via `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token`
- **Token de embed:** gerado via `POST /v1.0/myorg/groups/{WORKSPACE_ID}/reports/{reportId}/GenerateToken`
- **Cache do token de acesso:** renovado automaticamente 1 minuto antes da expiração
- **Extração do Report ID:** suporta URLs no formato `/reports/{UUID}` e `?reportId={UUID}`
- **Renderização no frontend:** SDK `powerbi-client` com `LayoutType.Custom` e `DisplayOption.FitToPage`

---

## 10. Deploy e infraestrutura

### Servidor de produção

| Item | Valor |
|------|-------|
| Sistema operacional | Linux (Ubuntu/Debian) |
| Servidor web | Nginx |
| Processo backend | systemd — `bdr-backend.service` |
| Usuário do processo | `canaa` |
| Diretório do projeto | `/home/canaa/Governança/PowerBI/bdr-commission/` |
| Frontend (arquivos estáticos) | `/var/www/bdr/` |
| Backend compilado | `backend/dist/` |

### Serviço systemd

**Arquivo:** `/etc/systemd/system/bdr-backend.service`

```ini
[Unit]
Description=Canaã Performance — Backend Node.js
After=network.target

[Service]
Type=simple
User=canaa
WorkingDirectory=/home/canaa/Governança/PowerBI/bdr-commission/backend
EnvironmentFile=/home/canaa/Governança/PowerBI/bdr-commission/backend/.env
ExecStart=/home/canaa/Governança/PowerBI/bdr-commission/backend/start.sh
Restart=on-failure
RestartSec=5
```

### Comandos de operação

```bash
# Ver status do serviço
systemctl status bdr-backend

# Reiniciar o backend
sudo systemctl restart bdr-backend

# Ver logs em tempo real
journalctl -u bdr-backend -f

# Deploy completo (frontend + backend)
sudo bash /home/canaa/Governança/PowerBI/bdr-commission/deploy.sh
```

### Script de deploy (`deploy.sh`)

1. Build do frontend (`npm run build` em `frontend/`)
2. Cópia dos arquivos para `/var/www/bdr/`
3. Build do backend (`npm run build` em `backend/`)
4. Restart do serviço `bdr-backend`

---

## 11. Variáveis de ambiente

Arquivo: `backend/.env`

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string PostgreSQL |
| `IXC_HOST` | URL base do ERP IXC |
| `IXC_TOKEN` | Token de API do IXC |
| `MYSQL_HOST` | IP do servidor MariaDB IXC |
| `MYSQL_PORT` | Porta MariaDB (padrão: 3306) |
| `MYSQL_USER` | Usuário MariaDB (somente leitura) |
| `MYSQL_PASSWORD` | Senha do usuário MariaDB |
| `MYSQL_DATABASE` | Nome do banco IXC |
| `PORT` | Porta do servidor backend (padrão: 3000) |
| `NODE_ENV` | Ambiente (`production` em produção) |
| `JWT_SECRET` | Chave secreta para assinatura dos tokens JWT |
| `HUB_SUPER_ADMIN_ID` | IDs IXC dos super admins do Hub (separados por vírgula) |
| `ZAPSIGN_TOKEN` | Token de autenticação da API ZapSign |
| `POWERBI_TENANT_ID` | ID do tenant Azure AD |
| `POWERBI_CLIENT_ID` | Client ID do app Azure AD |
| `POWERBI_CLIENT_SECRET` | Client Secret do app Azure AD |
| `POWERBI_WORKSPACE_ID` | ID do workspace Power BI |
| `POWERBI_USERNAME` | Usuário Power BI (legado ROPC, não usado atualmente) |
| `POWERBI_PASSWORD` | Senha Power BI (legado ROPC, não usado atualmente) |
| `ALERT_EMAIL_FROM` | E-mail remetente dos alertas |
| `ALERT_EMAIL_FINANCEIRO` | Destinatário alertas financeiros |

---

*Documentação gerada em 28/04/2026.*

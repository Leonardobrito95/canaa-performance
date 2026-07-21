# Canaã Performance

Hub interno de performance da Canaã Telecom. Centraliza dashboards analíticos (Power BI) e um conjunto de módulos operacionais que substituem controles paralelos em planilha, comissionamento, retenção, vendas, agenda de salas e acesso ao monitoramento de rede.

O comissionamento (BDR) foi o módulo de partida do projeto; hoje é um entre vários módulos do Hub.

## Módulos

| Módulo | O que faz |
|---|---|
| **Hub** | Portal de dashboards Power BI, com RBAC por setor/dashboard (quem vê o quê) |
| **Vendas** | Contratos ativados no IXC, enriquecidos com status de assinatura (ZapSign/GovSign) e financeiro. Snapshots mensais imutáveis para fechamento de comissão |
| **BDR** | Comissão por alteração contratual: Upgrade, Downgrade, Refidelização |
| **Retenção** | Comissão da equipe de CS por faixa de contratos retidos no mês |
| **Comissão Campo** | Auditoria de planilhas de equipes terceirizadas de instalação/manutenção |
| **Agenda** | Agendamento de salas de reunião, com convite/recusa por e-mail e integração com calendário |
| **OTDR** | SSO para o dashboard de monitoramento de rede (detecção de queda de fibra via SmartOLT) |
| **Alertas** | Cron diário (08:00) — assinatura pendente, fatura em aberto, metas de retenção |

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Vue 3 + Composition API + Vite (SPA sem router — navegação por estado) |
| Backend | Node.js 20 + TypeScript + Express |
| ORM | Prisma 5 |
| Banco (escrita) | PostgreSQL 16 — schemas `bdr`, `hub`, `comissao` |
| Banco (leitura) | MariaDB — ERP IXC, somente leitura |
| Processo (produção) | systemd |

## Estrutura

```
bdr-commission/
├── backend/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── config/          # prisma, mysql, mailer, ixcApi, logger
│       ├── jobs/            # cron de alertas
│       ├── middlewares/     # authenticate (JWT), errorHandler, requireHubAdmin
│       └── modules/
│           ├── agenda/  alertas/  auth/  bdr/  comissao/
│           └── hub/  otdr/  retencao/  vendas/
└── frontend/
    └── src/
        ├── components/   # ChartBars, ChartDonut, ChartRanking, PeriodFilter, BdrForm
        ├── services/     # clients HTTP por módulo
        └── views/        # uma view por módulo + views/hub/
```

Cada módulo do backend segue `controller → service → repository → routes`.

## Configuração

```bash
cd backend
cp .env.example .env
# preencha DATABASE_URL, MYSQL_*, IXC_*, ALERT_EMAIL_*, SMTP_*, JWT_SECRET etc.

cp config/setores-atendimento.example.json config/setores-atendimento.json
# preencha com os IDs reais de departamento do OpaSuite desta instalação
# (só precisa incluir os setores que essa instalação realmente usa)

cp config/retencao-diagnosticos.example.json config/retencao-diagnosticos.json
# preencha com o id_assunto de retenção e os IDs de diagnóstico
# (retido/não retido) do IXC desta instalação

npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev          # hot-reload em desenvolvimento
```

```bash
cd frontend
npm install
npm run dev           # http://localhost:5173
```

## Deploy (produção)

Roda via **systemd** (não Docker):

```bash
# backend
cd backend && npm run build && sudo systemctl restart bdr-backend

# frontend (build estático servido via Nginx)
cd frontend && npm run build && sudo cp -r dist/. /var/www/bdr/
```

## Autenticação

Login validado contra o IXC (MariaDB, hash SHA-256). JWT com expiração de 8h. Perfis (`consultor` / `gestor` / `cs`) derivados do grupo IXC do usuário.

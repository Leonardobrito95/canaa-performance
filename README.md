# BDR Commission

Sistema web para registro de comissões da equipes de vendas e retenção(comercial), e terceiras de campo(instalação).

## O problema que isso resolve

O time BDR controlava comissões em planilhas. Sem validação contra o ERP, contratos errados eram comissionados, valores divergiam e o fechamento do mês virava um trabalho à parte: horas comparando planilha com sistema.

Este projeto conecta direto ao ERP IXC via MariaDB (somente leitura), valida o contrato em tempo real e registra a comissão no banco próprio. O consultor informa o ID do contrato durante o próprio atendimento. O fechamento mensal deixou de ser um problema.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Vue 3 + Composition API + Vite |
| Backend | Node.js + TypeScript + Express |
| ORM | Prisma (migrations automáticas) |
| Banco RW | PostgreSQL 16 |
| Banco RO | MariaDB — ERP IXC (somente leitura) |
| Infra | Docker + Docker Compose |

## Como funciona

O consultor informa o ID do contrato. O sistema busca os dados no ERP, calcula a comissão conforme o tipo e salva o registro com histórico.

| Tipo | Cálculo |
|---|---|
| Upgrade | valor_novo − valor_atual |
| Downgrade | R$ 3,00 fixo |
| Refidelização | R$ 3,00 fixo |

## Estrutura de diretórios

```
bdr-commission/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── config/
│       │   ├── mysql.ts           # Pool de conexão com o ERP (MariaDB)
│       │   ├── prisma.ts          # Client Prisma
│       │   └── consultants.ts     # Lista de consultores
│       ├── modules/
│       │   └── bdr/               # Controller → Service → Repository
│       │       ├── bdr.controller.ts
│       │       ├── bdr.service.ts
│       │       ├── bdr.repository.ts
│       │       └── bdr.routes.ts
│       ├── middlewares/
│       │   └── errorHandler.ts
│       ├── app.ts
│       └── server.ts
└── frontend/
    └── src/
        ├── components/BdrForm.vue
        ├── views/HistoryView.vue
        ├── services/api.ts
        ├── App.vue
        └── main.ts
```

## Configuração

### 1. Variáveis de ambiente

Copie o `.env.example` e preencha com os dados do servidor IXC:

```env
MYSQL_HOST=IP_DO_SERVIDOR_IXC
MYSQL_PORT=3306
MYSQL_USER=usuario_readonly
MYSQL_PASSWORD=senha_readonly
MYSQL_DATABASE=nome_do_banco
```

O PostgreSQL sobe automaticamente via Docker Compose.

### 2. Adaptando a query do ERP

Se necessário, ajuste a query em `backend/src/modules/bdr/bdr.repository.ts` conforme o schema real do IXC:

```sql
SELECT
  cc.id         AS id_contrato,
  c.razao       AS nome_cliente,
  cc.valor      AS valor_atual
FROM cliente_contrato cc
INNER JOIN cliente c ON c.id = cc.id_cliente
WHERE cc.id = ?
  AND cc.status = 'A'
```

### 3. Lista de consultores

Edite `backend/src/config/consultants.ts` com os nomes da equipe.

## Rodando com Docker

```bash
# Subir todos os serviços
docker compose up --build -d

# Acessar
http://localhost

# Logs
docker compose logs -f backend

# Parar
docker compose down
```

## Rodando localmente

**Backend**
```bash
cd backend
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| GET | /api/v1/bdr/consultants | Lista consultores |
| GET | /api/v1/bdr/contracts/:id | Valida contrato no ERP |
| POST | /api/v1/bdr/commissions | Registra comissão |
| GET | /api/v1/bdr/commissions | Histórico de comissões |
| GET | /health | Health check |

## Escalabilidade

O projeto usa arquitetura modular em camadas. Para adicionar um novo módulo (ex: Vendas) basta criar a pasta e registrar a rota — sem tocar no que já existe:

```
src/modules/
├── bdr/       ← módulo atual
└── sales/     ← novo módulo
    ├── sales.controller.ts
    ├── sales.service.ts
    ├── sales.repository.ts
    └── sales.routes.ts
```

```ts
// src/app.ts
app.use('/api/v1/sales', salesRoutes);
```

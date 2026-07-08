# BDR Commission — Sistema de Registro de Comissões

Aplicação web para registro de comissionamento da equipe BDR (Upgrade, Downgrade e Refidelização).

## Stack

| Camada     | Tecnologia                        |
|------------|-----------------------------------|
| Frontend   | Vue 3 + Composition API + Vite    |
| Backend    | Node.js + TypeScript + Express    |
| ORM        | Prisma (migrations automáticas)   |
| Banco RW   | PostgreSQL 16 (banco próprio)     |
| Banco RO   | MariaDB — ERP IXC (somente leitura) |
| Infra      | Docker + Docker Compose           |

---

## Estrutura de Diretórios

```
bdr-commission/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Schema PostgreSQL
│   └── src/
│       ├── config/
│       │   ├── mysql.ts           # Pool MySQL (leitura ERP)
│       │   ├── prisma.ts          # Client Prisma
│       │   └── consultants.ts     # Lista de consultores
│       ├── modules/
│       │   └── bdr/               # Módulo BDR (Controllers → Services → Repositories)
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

---

## Configuração

### 1. Variáveis de ambiente

Edite o arquivo `.env` na raiz com os dados do servidor IXC:

```env
MYSQL_HOST=IP_DO_SERVIDOR_IXC
MYSQL_PORT=3306
MYSQL_USER=usuario_readonly
MYSQL_PASSWORD=senha_readonly
MYSQL_DATABASE=nome_do_banco
```

> O PostgreSQL é provisionado automaticamente pelo Docker Compose.

### 2. Consultor IXC — adaptar a query MariaDB

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

Edite `backend/src/config/consultants.ts` para incluir os nomes reais da equipe.

---

## Rodando com Docker (recomendado)

```bash
# 1. Build e subir todos os serviços
docker compose up --build -d

# 2. Acessar a aplicação
http://localhost

# 3. Ver logs
docker compose logs -f backend

# 4. Parar
docker compose down
```

---

## Rodando localmente (desenvolvimento)

### Backend

```bash
cd backend

# Instalar dependências
npm install

# Copiar variáveis de ambiente
cp .env.example .env
# Edite .env com DATABASE_URL e dados MySQL

# Gerar client Prisma
npm run prisma:generate

# Rodar migrations
npm run prisma:migrate

# Iniciar servidor (hot-reload)
npm run dev
```

### Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev
# Acesse: http://localhost:5173
```

---

## Endpoints da API

| Método | Rota                              | Descrição                              |
|--------|-----------------------------------|----------------------------------------|
| GET    | `/api/v1/bdr/consultants`         | Lista consultores                      |
| GET    | `/api/v1/bdr/contracts/:id`       | Valida contrato no ERP (MySQL)         |
| POST   | `/api/v1/bdr/commissions`         | Registra comissão (PostgreSQL)         |
| GET    | `/api/v1/bdr/commissions`         | Lista histórico de comissões           |
| GET    | `/health`                         | Health check                           |

### Exemplo POST `/api/v1/bdr/commissions`

```json
{
  "id_contrato": "123456",
  "vendedor": "Ana Paula",
  "tipo_negociacao": "Upgrade",
  "valor_novo": 250.00
}
```

---

## Regras de Negócio

| Tipo           | Cálculo da Comissão                    |
|----------------|----------------------------------------|
| Upgrade        | `valor_novo − valor_atual`             |
| Downgrade      | R$ 3,00 fixo                          |
| Refidelização  | R$ 3,00 fixo                          |

---

## Escalabilidade

O projeto usa **arquitetura modular em camadas** (`Controller → Service → Repository`).
Para adicionar o módulo de Vendas no futuro:

```
src/modules/
├── bdr/       ← módulo atual
└── sales/     ← novo módulo, sem afetar o BDR
    ├── sales.controller.ts
    ├── sales.service.ts
    ├── sales.repository.ts
    └── sales.routes.ts
```

Basta registrar a nova rota em `src/app.ts`:

```ts
app.use('/api/v1/sales', salesRoutes);
```

# Canaã Performance

Sistema web para centralizar o registro e a auditoria de comissões de múltiplas equipes: comercial (vendas), BDR (retenção), e terceiras de campo (instalação e manutenção).

## O problema que isso resolve

Cada equipe controlava comissões de um jeito diferente: planilha, caderno, mensagem no WhatsApp. Sem validação contra o ERP, contratos errados eram comissionados, valores divergiam e o fechamento do mês era um trabalho paralelo de horas conferindo manualmente o que o sistema deveria entregar automaticamente.

Além disso, o time comercial não tinha como acompanhar o status das próprias vendas. Uma venda fechada entrava num limbo entre o CRM e o financeiro, e o vendedor só descobria que havia problema quando o pagamento não caía.

## O que o sistema faz

Conecta ao ERP IXC via MariaDB (somente leitura) para validar contratos em tempo real. Cada equipe registra suas comissões direto no sistema, que calcula os valores automaticamente conforme as regras de negócio de cada modalidade.

Para o time comercial, há um painel de acompanhamento que mostra a evolução do status de cada venda, do registro até a liberação para pagamento. O fechamento do mês deixou de exigir reconciliação manual.

## Equipes atendidas

| Equipe | Tipo de comissão |
|---|---|
| Comercial (vendas) | Por contrato fechado, com rastreamento de status até liberação |
| BDR (retenção) | Upgrade, Downgrade e Refidelização |
| Terceiras de campo | Por instalação, manutenção e serviços técnicos |

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Vue 3 + Composition API + Vite |
| Backend | Node.js + TypeScript + Express |
| ORM | Prisma (migrations automáticas) |
| Banco RW | PostgreSQL 16 |
| Banco RO | MariaDB — ERP IXC (somente leitura) |
| Processo | systemd (produção) |

## Regras de negócio — BDR

| Tipo | Cálculo |
|---|---|
| Upgrade | valor_novo − valor_atual |
| Downgrade | R$ 3,00 fixo |
| Refidelização | R$ 3,00 fixo |

## Estrutura de diretórios

```
canaã-performance/
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

### Variáveis de ambiente

Copie o `.env.example` e preencha com os dados do servidor IXC:

```env
MYSQL_HOST=IP_DO_SERVIDOR_IXC
MYSQL_PORT=3306
MYSQL_USER=usuario_readonly
MYSQL_PASSWORD=senha_readonly
MYSQL_DATABASE=nome_do_banco
```

O PostgreSQL é configurado separadamente via `DATABASE_URL` no mesmo arquivo.

### Adaptando a query do ERP

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

### Lista de consultores

Edite `backend/src/config/consultants.ts` com os nomes da equipe.

## Rodando em produção (systemd)

O sistema roda como serviço gerenciado pelo systemd.

```bash
# Ver status do serviço
sudo systemctl status canaa-performance

# Reiniciar após deploy
sudo systemctl restart canaa-performance

# Ver logs em tempo real
sudo journalctl -u canaa-performance -f
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

## Arquitetura modular

O backend segue o padrão Controller → Service → Repository por módulo. Para adicionar uma nova equipe (ex: Vendas), basta criar o módulo e registrar a rota — sem alterar o que já existe:

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

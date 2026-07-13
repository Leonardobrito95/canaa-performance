-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "infraestrutura";

-- CreateTable
CREATE TABLE "infraestrutura"."vistoria_alerta" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "severidade" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "pop_name" TEXT NOT NULL DEFAULT '',
    "pendencia_id" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvido_em" TIMESTAMP(3),

    CONSTRAINT "vistoria_alerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vistoria_alerta_tipo_pop_name_pendencia_id_key" ON "infraestrutura"."vistoria_alerta"("tipo", "pop_name", "pendencia_id");

-- CreateIndex
CREATE INDEX "vistoria_alerta_status_idx" ON "infraestrutura"."vistoria_alerta"("status");

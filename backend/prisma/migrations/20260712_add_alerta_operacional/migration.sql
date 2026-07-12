-- CreateTable
CREATE TABLE "diagnostico"."atendimento_alerta_operacional" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "severidade" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "opasuite_atendimento_id" TEXT NOT NULL DEFAULT '',
    "agente_nome" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvido_em" TIMESTAMP(3),

    CONSTRAINT "atendimento_alerta_operacional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_alerta_operacional_tipo_setor_opasuite_atendim_key" ON "diagnostico"."atendimento_alerta_operacional"("tipo", "setor", "opasuite_atendimento_id", "agente_nome");

-- CreateIndex
CREATE INDEX "atendimento_alerta_operacional_status_idx" ON "diagnostico"."atendimento_alerta_operacional"("status");

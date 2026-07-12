-- CreateTable
CREATE TABLE "diagnostico"."atendimento_monitoria_qa" (
    "id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "data_atendimento" TIMESTAMP(3),
    "data_monitoria" TIMESTAMP(3),
    "nome_agente" TEXT NOT NULL,
    "equipe" TEXT NOT NULL,
    "motivo_atendimento" TEXT,
    "monitoria_zero" TEXT,
    "avaliacao_atd" DOUBLE PRECISION,
    "erro_critico" BOOLEAN NOT NULL DEFAULT false,
    "itens_aplicaveis" INTEGER,
    "pontuacao" DOUBLE PRECISION,
    "observacoes" TEXT,
    "ofensa_verbal_legado" TEXT,
    "criterios" JSONB NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'legado',
    "avaliado_por" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atendimento_monitoria_qa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostico"."atendimento_agente_qa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "equipe" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atendimento_agente_qa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_monitoria_qa_protocolo_key" ON "diagnostico"."atendimento_monitoria_qa"("protocolo");

-- CreateIndex
CREATE INDEX "atendimento_monitoria_qa_equipe_idx" ON "diagnostico"."atendimento_monitoria_qa"("equipe");

-- CreateIndex
CREATE INDEX "atendimento_monitoria_qa_nome_agente_idx" ON "diagnostico"."atendimento_monitoria_qa"("nome_agente");

-- CreateIndex
CREATE INDEX "atendimento_monitoria_qa_data_atendimento_idx" ON "diagnostico"."atendimento_monitoria_qa"("data_atendimento");

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_agente_qa_nome_key" ON "diagnostico"."atendimento_agente_qa"("nome");

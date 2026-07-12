-- CreateTable
CREATE TABLE "diagnostico"."atendimento_analise_ia" (
    "id" TEXT NOT NULL,
    "opasuite_atendimento_id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "data_atendimento" TIMESTAMP(3) NOT NULL,
    "motivo_classificado" TEXT,
    "adesao_script" DOUBLE PRECISION,
    "indice_sentimento" DOUBLE PRECISION,
    "sentimento_categoria" TEXT,
    "justificativa" TEXT,
    "confianca_insuficiente" BOOLEAN NOT NULL DEFAULT false,
    "flag_triagem" BOOLEAN NOT NULL DEFAULT false,
    "modelo_usado" TEXT,
    "processado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atendimento_analise_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_analise_ia_opasuite_atendimento_id_key" ON "diagnostico"."atendimento_analise_ia"("opasuite_atendimento_id");

-- CreateIndex
CREATE INDEX "atendimento_analise_ia_setor_idx" ON "diagnostico"."atendimento_analise_ia"("setor");

-- CreateIndex
CREATE INDEX "atendimento_analise_ia_flag_triagem_idx" ON "diagnostico"."atendimento_analise_ia"("flag_triagem");

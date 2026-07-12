-- AlterTable
ALTER TABLE "diagnostico"."atendimento_monitoria_qa" ADD COLUMN "comunicado_em" TIMESTAMP(3);
ALTER TABLE "diagnostico"."atendimento_monitoria_qa" ADD COLUMN "comunicado_nota" TEXT;

-- AlterTable
ALTER TABLE "diagnostico"."atendimento_agente_qa" ADD COLUMN "ixc_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_agente_qa_ixc_user_id_key" ON "diagnostico"."atendimento_agente_qa"("ixc_user_id");

-- AlterTable
ALTER TABLE "diagnostico"."atendimento_alerta_operacional" ADD COLUMN "resolvido_por" TEXT;
ALTER TABLE "infraestrutura"."vistoria_alerta" ADD COLUMN "resolvido_por" TEXT;

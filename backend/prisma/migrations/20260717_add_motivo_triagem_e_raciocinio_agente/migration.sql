-- AlterTable
ALTER TABLE "diagnostico"."atendimento_analise_ia" ADD COLUMN "motivo_triagem" TEXT DEFAULT 'analise_leve';
ALTER TABLE "diagnostico"."atendimento_analise_ia" ADD COLUMN "qa_ia_pontuacao_sugerida" DOUBLE PRECISION;
ALTER TABLE "diagnostico"."atendimento_analise_ia" ADD COLUMN "qa_ia_criterios_sugeridos" JSONB;
ALTER TABLE "diagnostico"."atendimento_analise_ia" ADD COLUMN "qa_ia_observacoes" TEXT;

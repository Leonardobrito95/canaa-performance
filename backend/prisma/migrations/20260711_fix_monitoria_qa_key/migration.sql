-- protocolo NÃO é unique na origem: confirmado empiricamente 2 colisões reais
-- em 7.861 linhas do sistema legado (um caso é literalmente 2 atendimentos
-- diferentes com o mesmo número de protocolo, um deles só distinguível por
-- espaço em branco). A chave de idempotência da migração passa a ser
-- id_legado (id da linha no SQLite original), não mais protocolo.

-- DropIndex
DROP INDEX "diagnostico"."atendimento_monitoria_qa_protocolo_key";

-- AlterTable
ALTER TABLE "diagnostico"."atendimento_monitoria_qa" ADD COLUMN "id_legado" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_monitoria_qa_id_legado_key" ON "diagnostico"."atendimento_monitoria_qa"("id_legado");

-- CreateIndex
CREATE INDEX "atendimento_monitoria_qa_protocolo_idx" ON "diagnostico"."atendimento_monitoria_qa"("protocolo");

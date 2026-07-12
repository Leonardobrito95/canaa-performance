-- Aposentadoria da monitoria por IA de 3 critérios (cordialidade/clareza/
-- resolução), substituída pelo QA humano de 22 critérios migrado do sistema
-- legado (atendimento_monitoria_qa). Só 5 registros existiam nessa tabela —
-- amostra de teste, sem valor de negócio a preservar.

-- DropTable
DROP TABLE "diagnostico"."atendimento_monitoria";

-- CreateTable
CREATE TABLE "diagnostico"."blocos_prompt" (
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "atualizado_por" TEXT,

    CONSTRAINT "blocos_prompt_pkey" PRIMARY KEY ("chave")
);

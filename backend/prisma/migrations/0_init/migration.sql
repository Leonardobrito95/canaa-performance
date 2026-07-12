-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bdr";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "comissao";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "diagnostico";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "hub";

-- CreateEnum
CREATE TYPE "bdr"."TipoNegociacao" AS ENUM ('Upgrade', 'Downgrade', 'Refidelizacao');

-- CreateTable
CREATE TABLE "bdr"."adjustments" (
    "id" TEXT NOT NULL,
    "vendedor" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "registrado_por" TEXT NOT NULL,
    "data_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletado_em" TIMESTAMP(3),
    "deletado_por" TEXT,

    CONSTRAINT "adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bdr"."alertas_enviados" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "mes_referencia" TEXT NOT NULL,
    "meta_nivel" TEXT NOT NULL DEFAULT '',
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_enviados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bdr"."comissao_envio_logs" (
    "id" TEXT NOT NULL,
    "mes_referencia" TEXT NOT NULL,
    "tipo_envio" TEXT NOT NULL,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_por" TEXT NOT NULL,

    CONSTRAINT "comissao_envio_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bdr"."commissions" (
    "id" TEXT NOT NULL,
    "id_contrato" TEXT NOT NULL,
    "nome_cliente" TEXT NOT NULL,
    "vendedor" TEXT NOT NULL,
    "tipo_negociacao" "bdr"."TipoNegociacao" NOT NULL,
    "valor_atual" DECIMAL(10,2) NOT NULL,
    "valor_novo" DECIMAL(10,2),
    "valor_comissao" DECIMAL(10,2) NOT NULL,
    "data_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plano_atual" TEXT,
    "plano_novo" TEXT,
    "criado_por" TEXT,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bdr"."retencao_negociacoes" (
    "id_chamado" TEXT NOT NULL,
    "valor_original" DECIMAL(10,2) NOT NULL,
    "valor_negociado" DECIMAL(10,2) NOT NULL,
    "descricao" TEXT,
    "registrado_por" TEXT NOT NULL,
    "data_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retencao_negociacoes_pkey" PRIMARY KEY ("id_chamado")
);

-- CreateTable
CREATE TABLE "bdr"."vendas_snapshots" (
    "id" TEXT NOT NULL,
    "mes_referencia" TEXT NOT NULL,
    "id_contrato" TEXT NOT NULL,
    "nome_cliente" TEXT NOT NULL,
    "nome_vendedor" TEXT NOT NULL,
    "plano" TEXT NOT NULL,
    "segmento" TEXT NOT NULL,
    "tipo_venda" TEXT NOT NULL,
    "valor_mensal" DECIMAL(10,2) NOT NULL,
    "percentual" DECIMAL(5,4) NOT NULL,
    "valor_comissao" DECIMAL(10,2) NOT NULL,
    "status_comissao" TEXT NOT NULL,
    "motivo_bloqueio" TEXT,
    "assinatura" TEXT NOT NULL,
    "enviado_pagamento" BOOLEAN NOT NULL DEFAULT false,
    "data_envio" TIMESTAMP(3),
    "enviado_por" TEXT,
    "data_snapshot" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comissao"."auditorias_salvas" (
    "company_key" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "date_ini" TIMESTAMP(3),
    "date_fim" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'database',
    "summary_json" JSONB NOT NULL DEFAULT '{}',
    "results_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auditorias_salvas_pkey" PRIMARY KEY ("company_key")
);

-- CreateTable
CREATE TABLE "comissao"."empresas" (
    "company_key" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "precos_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("company_key")
);

-- CreateTable
CREATE TABLE "diagnostico"."agregados" (
    "chave" TEXT NOT NULL,
    "dimensao" TEXT NOT NULL,
    "periodo_ini" TIMESTAMP(3) NOT NULL,
    "periodo_fim" TIMESTAMP(3) NOT NULL,
    "metricas_json" JSONB NOT NULL,
    "narrativa" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agregados_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "diagnostico"."alertas" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "narrativa" TEXT NOT NULL,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostico"."atendimento_kpi_mensal" (
    "id" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "mes_referencia" TEXT NOT NULL,
    "volume" INTEGER NOT NULL,
    "tma_ms" INTEGER,
    "tme_ms" INTEGER,
    "tmr_ms" INTEGER,
    "escalonamentos" INTEGER NOT NULL,
    "pct_escalonamento" DOUBLE PRECISION,
    "nota_media_satisfacao" DOUBLE PRECISION,
    "qtd_avaliados" INTEGER NOT NULL,
    "calculado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atendimento_kpi_mensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostico"."atendimento_monitoria" (
    "id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "nota_geral" DOUBLE PRECISION,
    "nota_cordialidade" DOUBLE PRECISION,
    "nota_clareza" DOUBLE PRECISION,
    "nota_resolucao" DOUBLE PRECISION,
    "classificacao" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "data_atendimento" TIMESTAMP(3) NOT NULL,
    "avaliado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelo_usado" TEXT,
    "tokens_entrada" INTEGER,
    "tokens_saida" INTEGER,
    "custo_estimado_usd" DOUBLE PRECISION,

    CONSTRAINT "atendimento_monitoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostico"."consultas" (
    "id" TEXT NOT NULL,
    "tipo_alvo" TEXT NOT NULL,
    "id_alvo" TEXT NOT NULL,
    "pergunta" TEXT,
    "resposta" TEXT NOT NULL,
    "contexto_json" JSONB NOT NULL,
    "ixc_user_id" TEXT NOT NULL,
    "ixc_username" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback" TEXT,
    "feedback_comentario" TEXT,
    "feedback_em" TIMESTAMP(3),
    "latencia_ms" INTEGER,
    "modelo_usado" TEXT,
    "tokens_entrada" INTEGER,
    "tokens_saida" INTEGER,

    CONSTRAINT "consultas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostico"."regras_negocio" (
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "atualizado_por" TEXT,

    CONSTRAINT "regras_negocio_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "diagnostico"."retencao_auditoria" (
    "id_chamado" TEXT NOT NULL,
    "nome_operador" TEXT NOT NULL,
    "resultado_ixc" TEXT NOT NULL,
    "classificacao" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "negociacao_detectada" TEXT,
    "data_abertura_os" TIMESTAMP(3) NOT NULL,
    "classificado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelo_usado" TEXT,
    "divergencia_nota_os" TEXT,

    CONSTRAINT "retencao_auditoria_pkey" PRIMARY KEY ("id_chamado")
);

-- CreateTable
CREATE TABLE "hub"."access_logs" (
    "id" TEXT NOT NULL,
    "ixc_user_id" TEXT NOT NULL,
    "ixc_username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dashboard_id" TEXT,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."dashboard_shared_sectors" (
    "dashboard_id" TEXT NOT NULL,
    "sector_id" TEXT NOT NULL,

    CONSTRAINT "dashboard_shared_sectors_pkey" PRIMARY KEY ("dashboard_id","sector_id")
);

-- CreateTable
CREATE TABLE "hub"."dashboards" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "embed_mode" TEXT NOT NULL DEFAULT 'newtab',
    "thumbnail_url" TEXT,
    "business_rules" TEXT,
    "data_sources" TEXT,
    "owner_tech" TEXT,
    "refresh_frequency" TEXT,
    "last_update" TIMESTAMP(3),
    "sector_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."sectors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'fa-chart-bar',
    "color" TEXT NOT NULL DEFAULT '#002F4D',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."user_access" (
    "id" TEXT NOT NULL,
    "ixc_user_id" TEXT NOT NULL,
    "ixc_user_nome" TEXT NOT NULL,
    "sector_id" TEXT,
    "dashboard_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "user_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alertas_enviados_tipo_referencia_mes_referencia_meta_nivel_key" ON "bdr"."alertas_enviados"("tipo" ASC, "referencia" ASC, "mes_referencia" ASC, "meta_nivel" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "comissao_envio_logs_mes_referencia_tipo_envio_key" ON "bdr"."comissao_envio_logs"("mes_referencia" ASC, "tipo_envio" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "vendas_snapshots_mes_referencia_id_contrato_key" ON "bdr"."vendas_snapshots"("mes_referencia" ASC, "id_contrato" ASC);

-- CreateIndex
CREATE INDEX "agregados_dimensao_idx" ON "diagnostico"."agregados"("dimensao" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "alertas_tipo_referencia_periodo_key" ON "diagnostico"."alertas"("tipo" ASC, "referencia" ASC, "periodo" ASC);

-- CreateIndex
CREATE INDEX "atendimento_kpi_mensal_mes_referencia_idx" ON "diagnostico"."atendimento_kpi_mensal"("mes_referencia" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_kpi_mensal_setor_mes_referencia_key" ON "diagnostico"."atendimento_kpi_mensal"("setor" ASC, "mes_referencia" ASC);

-- CreateIndex
CREATE INDEX "atendimento_monitoria_classificacao_idx" ON "diagnostico"."atendimento_monitoria"("classificacao" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_monitoria_protocolo_key" ON "diagnostico"."atendimento_monitoria"("protocolo" ASC);

-- CreateIndex
CREATE INDEX "atendimento_monitoria_setor_idx" ON "diagnostico"."atendimento_monitoria"("setor" ASC);

-- CreateIndex
CREATE INDEX "consultas_tipo_alvo_id_alvo_idx" ON "diagnostico"."consultas"("tipo_alvo" ASC, "id_alvo" ASC);

-- CreateIndex
CREATE INDEX "retencao_auditoria_classificacao_idx" ON "diagnostico"."retencao_auditoria"("classificacao" ASC);

-- CreateIndex
CREATE INDEX "retencao_auditoria_nome_operador_idx" ON "diagnostico"."retencao_auditoria"("nome_operador" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sectors_name_key" ON "hub"."sectors"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sectors_slug_key" ON "hub"."sectors"("slug" ASC);

-- AddForeignKey
ALTER TABLE "hub"."access_logs" ADD CONSTRAINT "access_logs_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "hub"."dashboards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."dashboard_shared_sectors" ADD CONSTRAINT "dashboard_shared_sectors_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "hub"."dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."dashboard_shared_sectors" ADD CONSTRAINT "dashboard_shared_sectors_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "hub"."sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."dashboards" ADD CONSTRAINT "dashboards_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "hub"."sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."user_access" ADD CONSTRAINT "user_access_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "hub"."dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."user_access" ADD CONSTRAINT "user_access_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "hub"."sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;


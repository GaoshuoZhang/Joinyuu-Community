-- 租约打印版式（全局单例）：打印单标题 + 「租赁信息」栏目可见性 + 「条款说明」纯文本
-- 单例：固定 id = 'default'，由服务端 upsert 维护；首行不存在时由服务端回落默认值，无需初始化数据。
CREATE TABLE "LeasePrintLayout" (
    "id" VARCHAR(16) NOT NULL DEFAULT 'default',
    "title" VARCHAR(64) NOT NULL DEFAULT '聚屿社区 · 办公位租约确认单',
    "fields" JSONB,
    "clausesText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" VARCHAR(32) NOT NULL DEFAULT '',
    CONSTRAINT "LeasePrintLayout_pkey" PRIMARY KEY ("id")
);

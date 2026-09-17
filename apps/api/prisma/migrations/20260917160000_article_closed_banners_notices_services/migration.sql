-- 1. 文章：后台/举报下架统一改为 closed，并留存每次下架记录
ALTER TABLE "Article" ADD COLUMN "commentsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ArticleTakedown" (
    "id" SERIAL NOT NULL,
    "articleId" VARCHAR(16) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "reportId" VARCHAR(16),
    "reason" VARCHAR(255),
    "takenDownAt" VARCHAR(16) NOT NULL,
    "takenDownBy" VARCHAR(64) NOT NULL,
    "restoredAt" VARCHAR(16),
    "restoredBy" VARCHAR(64),

    CONSTRAINT "ArticleTakedown_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArticleTakedown_articleId_takenDownAt_idx" ON "ArticleTakedown"("articleId", "takenDownAt");

ALTER TABLE "ArticleTakedown" ADD CONSTRAINT "ArticleTakedown_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 历史举报下架：保留记录与原因（原因优先取处置时的审计快照）
INSERT INTO "ArticleTakedown" ("articleId", "source", "reportId", "reason", "takenDownAt", "takenDownBy", "restoredAt")
SELECT r."targetId",
       'governance',
       r."id",
       NULLIF((
         SELECT NULLIF(a."detail", '')::jsonb ->> 'takedownReason'
         FROM "AuditLog" a
         WHERE a."action" = '处置举报'
           AND a."detail" LIKE '{%'
           AND a."target" = r."id" || ' · ' || r."targetTitle"
         ORDER BY a."at" DESC
         LIMIT 1
       ), ''),
       COALESCE(r."handledAt", r."at"),
       COALESCE(r."handledBy", '系统'),
       r."restoredAt"
FROM "Report" r
WHERE r."targetType" = 'article' AND r."action" = 'hide' AND r."status" = 'resolved';

-- 历史后台主动下架：从审计日志还原记录
INSERT INTO "ArticleTakedown" ("articleId", "source", "reason", "takenDownAt", "takenDownBy")
SELECT split_part(a."target", ' · ', 1), 'manual', NULLIF(a."detail", ''), a."at", a."operator"
FROM "AuditLog" a
WHERE a."action" = '文章下架'
  AND EXISTS (SELECT 1 FROM "Article" art WHERE art."id" = split_part(a."target", ' · ', 1));

-- 仅把仍处于下架状态的举报对象转为“已关闭”；用户主动撤回的投稿保持 withdrawn
UPDATE "Article" art
SET "status" = 'closed',
    "archivableAt" = COALESCE(art."archivableAt", r."handledAt", art."createdAt")
FROM "Report" r
WHERE r."targetType" = 'article' AND r."action" = 'hide' AND r."status" = 'resolved'
  AND r."restoredAt" IS NULL
  AND art."id" = r."targetId"
  AND art."status" = 'withdrawn';

-- 2. 首页轮播图：独立模型 + 总开关
CREATE TABLE "HomeBanner" (
    "id" VARCHAR(16) NOT NULL,
    "title" VARCHAR(64) NOT NULL,
    "subtitle" VARCHAR(128) NOT NULL DEFAULT '',
    "imageUrl" VARCHAR(512),
    "link" VARCHAR(512),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" VARCHAR(16) NOT NULL,
    "updatedAt" VARCHAR(16) NOT NULL,

    CONSTRAINT "HomeBanner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HomeBanner_enabled_sort_idx" ON "HomeBanner"("enabled", "sort");

ALTER TABLE "SystemConfig" ADD COLUMN "homeCarouselOpen" BOOLEAN NOT NULL DEFAULT true;

-- 3. 站内信简化：移除归档与分类偏好；归档消息不再回到统一列表
DELETE FROM "UserNotification" WHERE "archived" = true;
DELETE FROM "UserNotification"
WHERE "type" = 'service' OR "link" = '/me/services' OR "link" LIKE '/me/services?%';

DROP INDEX IF EXISTS "UserNotification_userId_archived_idx";
ALTER TABLE "UserNotification" DROP COLUMN "archived";
DROP TABLE "UserNotificationPreference";

-- 4. 服务申请下线（社区政策与通用申请审核保持独立）
DELETE FROM "AdminRolePermission" WHERE "permissionCode" = '/engagement/services';
DELETE FROM "AdminPermission" WHERE "code" = '/engagement/services';
DELETE FROM "IdSequence" WHERE "entityType" = 'SA';
DROP TABLE "ServiceApplication";

-- 需求移除「创建人」属性：提交人（publisherId / publisherName / publisherIdentity）已完整表达需求归属，
-- 创建人不再展示也不再参与用户记录聚合，连同列一并删除。
-- 需求立项生成的项目的创建人由服务端取需求提交人（发布方），项目自身字段不受影响。
ALTER TABLE "Demand" DROP COLUMN IF EXISTS "creatorName";
ALTER TABLE "Demand" DROP COLUMN IF EXISTS "creatorId";

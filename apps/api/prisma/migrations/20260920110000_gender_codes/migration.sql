-- 性别字段统一为规范 code：male / female / unknown（unknown=保密）。
-- 历史种子与非种子库中存在的「男/女/保密」等中文值一次性归一，读写路径统一按 code 处理。
UPDATE "User" SET "gender" = CASE "gender"
  WHEN '男' THEN 'male'
  WHEN '女' THEN 'female'
  WHEN 'male' THEN 'male'
  WHEN 'female' THEN 'female'
  ELSE 'unknown'
END;

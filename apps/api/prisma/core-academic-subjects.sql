INSERT INTO "academic_subjects" (
  "code", "nameZh", "nameEn", "source", "taxonomyVersion", "sortOrder"
)
VALUES
  ('computer-science', '计算机科学', 'Computer Science', 'platform', 'scholar-core-v1', 10),
  ('mathematics', '数学', 'Mathematics', 'platform', 'scholar-core-v1', 20),
  ('physics', '物理学', 'Physics', 'platform', 'scholar-core-v1', 30),
  ('chemistry', '化学', 'Chemistry', 'platform', 'scholar-core-v1', 40),
  ('life-sciences', '生命科学', 'Life Sciences', 'platform', 'scholar-core-v1', 50),
  ('medicine', '医学', 'Medicine', 'platform', 'scholar-core-v1', 60),
  ('engineering', '工程学', 'Engineering', 'platform', 'scholar-core-v1', 70),
  ('environmental-science', '环境科学', 'Environmental Science', 'platform', 'scholar-core-v1', 80),
  ('economics', '经济学', 'Economics', 'platform', 'scholar-core-v1', 90),
  ('sociology', '社会学', 'Sociology', 'platform', 'scholar-core-v1', 100),
  ('law', '法学', 'Law', 'platform', 'scholar-core-v1', 110),
  ('humanities', '人文学科', 'Humanities', 'platform', 'scholar-core-v1', 120)
ON CONFLICT ("code") DO UPDATE SET
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "source" = EXCLUDED."source",
  "taxonomyVersion" = EXCLUDED."taxonomyVersion",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "academic_subjects" (
  "code", "parentId", "nameZh", "nameEn", "source", "taxonomyVersion", "sortOrder"
)
SELECT
  child."code",
  parent."id",
  child."nameZh",
  child."nameEn",
  'platform',
  'scholar-core-v1',
  child."sortOrder"
FROM (
  VALUES
    ('artificial-intelligence', 'computer-science', '人工智能', 'Artificial Intelligence', 11),
    ('data-science', 'computer-science', '数据科学', 'Data Science', 12),
    ('database-systems', 'computer-science', '数据库系统', 'Database Systems', 13),
    ('software-engineering', 'computer-science', '软件工程', 'Software Engineering', 14)
) AS child("code", "parentCode", "nameZh", "nameEn", "sortOrder")
JOIN "academic_subjects" parent ON parent."code" = child."parentCode"
ON CONFLICT ("code") DO UPDATE SET
  "parentId" = EXCLUDED."parentId",
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "source" = EXCLUDED."source",
  "taxonomyVersion" = EXCLUDED."taxonomyVersion",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "academic_subjects" (
  "code", "parentId", "nameZh", "nameEn", "source", "taxonomyVersion", "sortOrder"
)
SELECT
  child."code",
  parent."id",
  child."nameZh",
  child."nameEn",
  'platform',
  'scholar-core-v1',
  child."sortOrder"
FROM (
  VALUES
    ('machine-learning', 'artificial-intelligence', '机器学习', 'Machine Learning', 111),
    ('computer-vision', 'artificial-intelligence', '计算机视觉', 'Computer Vision', 112),
    ('natural-language-processing', 'artificial-intelligence', '自然语言处理', 'Natural Language Processing', 113),
    ('big-data', 'data-science', '大数据', 'Big Data', 121),
    ('program-analysis', 'software-engineering', '程序分析', 'Program Analysis', 141),
    ('formal-methods', 'software-engineering', '形式化方法', 'Formal Methods', 142),
    ('software-testing', 'software-engineering', '软件测试', 'Software Testing', 143)
) AS child("code", "parentCode", "nameZh", "nameEn", "sortOrder")
JOIN "academic_subjects" parent ON parent."code" = child."parentCode"
ON CONFLICT ("code") DO UPDATE SET
  "parentId" = EXCLUDED."parentId",
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "source" = EXCLUDED."source",
  "taxonomyVersion" = EXCLUDED."taxonomyVersion",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "academic_subjects" (
  "code", "parentId", "nameZh", "nameEn", "source", "taxonomyVersion", "sortOrder"
)
SELECT
  'deep-learning',
  parent."id",
  '深度学习',
  'Deep Learning',
  'platform',
  'scholar-core-v1',
  1111
FROM "academic_subjects" parent
WHERE parent."code" = 'machine-learning'
ON CONFLICT ("code") DO UPDATE SET
  "parentId" = EXCLUDED."parentId",
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "source" = EXCLUDED."source",
  "taxonomyVersion" = EXCLUDED."taxonomyVersion",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "academic_subject_aliases" (
  "subjectId", "scopeKey", "alias", "normalizedAlias", "locale"
)
SELECT
  subject."id",
  'global',
  subject."nameZh",
  lower(regexp_replace(btrim(subject."nameZh"), '\s+', ' ', 'g')),
  'zh-CN'
FROM "academic_subjects" subject
WHERE subject."source" = 'platform'
UNION ALL
SELECT
  subject."id",
  'global',
  subject."nameEn",
  lower(regexp_replace(btrim(subject."nameEn"), '\s+', ' ', 'g')),
  'en'
FROM "academic_subjects" subject
WHERE subject."source" = 'platform' AND subject."nameEn" IS NOT NULL
ON CONFLICT ("scopeKey", "normalizedAlias") DO NOTHING;

INSERT INTO "academic_subject_aliases" (
  "subjectId", "scopeKey", "alias", "normalizedAlias", "locale"
)
SELECT
  subject."id",
  'global',
  alias."alias",
  lower(regexp_replace(btrim(alias."alias"), '\s+', ' ', 'g')),
  alias."locale"
FROM (
  VALUES
    ('computer-science', '计算机科学与技术', 'zh-CN'),
    ('computer-science', 'Computer Science and Technology', 'en'),
    ('artificial-intelligence', 'AI', 'en')
) AS alias("subjectCode", "alias", "locale")
JOIN "academic_subjects" subject ON subject."code" = alias."subjectCode"
ON CONFLICT ("scopeKey", "normalizedAlias") DO NOTHING;

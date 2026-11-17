import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../../../prisma/generated/client'
import { resolveScholarScopeInstitutionId } from '../../scholars/filters'
import { loadDirectoryUnits } from '../../../utils/scholar-directory-units'
import type { ScholarDirectoryData, ScholarDirectoryQuery } from './schema.directory'

const collations = new WeakMap<FastifyInstance, string>()
const resolveNameCollation = async (fastify: FastifyInstance): Promise<string> => {
  const cached = collations.get(fastify)
  if (cached) return cached
  const rows = await fastify.prisma.$queryRaw<Array<{ collname: string }>>`
    SELECT collname FROM pg_collation
    WHERE collname IN ('zh-Hans-CN-x-icu', 'zh-x-icu') AND collprovider = 'i'
      AND collnamespace = 'pg_catalog'::regnamespace
    ORDER BY CASE WHEN collname = 'zh-Hans-CN-x-icu' THEN 0 ELSE 1 END LIMIT 1`
  const name = rows[0]?.collname
  const collation = name === 'zh-Hans-CN-x-icu' || name === 'zh-x-icu' ? name : 'C'
  collations.set(fastify, collation)
  return collation
}

export const getScholarDirectory = async (
  fastify: FastifyInstance,
  query: ScholarDirectoryQuery,
): Promise<{ code: 0; data: ScholarDirectoryData }> => {
  const institutionId = await resolveScholarScopeInstitutionId(fastify, query.institution_slug)
  if (!institutionId) throw fastify.httpErrors.notFound('Institution not found')
  const [units, collation] = await Promise.all([
    loadDirectoryUnits(fastify.prisma, institutionId),
    resolveNameCollation(fastify),
  ])
  // Only a catalog-verified, fixed allowlist identifier enters SQL, never user input.
  const nameCollation = Prisma.raw(`pg_catalog."${collation}"`)
  const keyword = query.q?.trim() ?? ''
  const pattern = `%${keyword.replace(/[\\%_]/gu, '\\$&')}%`
  const limit = query.limit ?? 24
  const page = query.page ?? 1
  const unit = query.unit ?? ''
  const subject = query.subject_id ?? ''
  const letter = query.letter?.toUpperCase() ?? ''
  const ranked = query.sort !== 'name' && Boolean(keyword)

  // Aggregate facets and deduplicate affiliations inside PostgreSQL. Only a single
  // page and small navigation catalogs cross the wire; no full scholar/timeline scan
  // in application memory. All four views use the same statement/snapshot and scope.
  const [result] = await fastify.prisma.$queryRaw<Array<{ data: ScholarDirectoryData }>>(Prisma.sql`
    WITH RECURSIVE
    catalog AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(units)}::jsonb)
        AS n(id text, name text, kind text, parent_id text, ancestors jsonb, matchable boolean)
    ),
    scoped AS MATERIALIZED (
      SELECT s.id, s.name, s.avatar, s.title, s.college, s.bio, s.research_directions,
        CASE WHEN upper(trim(s.letter_index)) ~ '^[A-Z]$' THEN upper(trim(s.letter_index))
          WHEN upper(left(trim(s.name), 1)) ~ '^[A-Z]$' THEN upper(left(trim(s.name), 1))
          ELSE '#' END AS letter
      FROM scholars s
      WHERE EXISTS (SELECT 1 FROM institution_people p
        WHERE p."scholarId" = s.id AND p."institutionId" = ${institutionId}::uuid)
    ),
    affiliations AS MATERIALIZED (
      SELECT DISTINCT s.id AS scholar_id,
        coalesce(n.id, 'legacy:' || trim(label)) AS id,
        trim(label) AS name, coalesce(n.kind, 'unit') AS kind, n.parent_id,
        coalesce(n.ancestors, jsonb_build_array('legacy:' || trim(label))) AS ancestors
      FROM scoped s CROSS JOIN LATERAL unnest(s.college) label
      LEFT JOIN catalog n ON n.name = trim(label) AND n.matchable
      WHERE trim(label) <> ''
      UNION ALL
      SELECT s.id, 'unassigned', '', 'unit', NULL, '["unassigned"]'::jsonb
      FROM scoped s WHERE NOT EXISTS (SELECT 1 FROM unnest(s.college) label WHERE trim(label) <> '')
    ),
    unit_members AS MATERIALIZED (
      SELECT DISTINCT a.scholar_id, ancestor.id
      FROM affiliations a CROSS JOIN LATERAL jsonb_array_elements_text(a.ancestors) ancestor(id)
    ),
    unit_options AS (
      SELECT DISTINCT n.id, n.name, n.kind, n.parent_id FROM catalog n
      WHERE EXISTS (SELECT 1 FROM unit_members m WHERE m.id = n.id)
      UNION SELECT DISTINCT a.id, a.name, a.kind, a.parent_id FROM affiliations a WHERE a.id NOT LIKE 'org:%'
    ),
    subjects AS (
      SELECT id, code, "parentId", "nameZh", "nameEn", "sortOrder" FROM academic_subjects
      WHERE "isActive" AND ("institutionId" IS NULL OR "institutionId" = ${institutionId}::uuid)
    ),
    subject_tree (descendant, ancestor) AS (
      SELECT id, id FROM subjects
      UNION SELECT t.descendant, p.id FROM subject_tree t
        JOIN subjects child ON child.id = t.ancestor JOIN subjects p ON p.id = child."parentId"
    ),
    subject_members AS MATERIALIZED (
      SELECT DISTINCT ss."scholarId" AS scholar_id, t.ancestor AS id
      FROM scholar_subjects ss JOIN scoped s ON s.id = ss."scholarId"
        JOIN subject_tree t ON t.descendant = ss."subjectId"
    ),
    searched AS MATERIALIZED (
      SELECT s.*,
        (${unit} = '' OR EXISTS (SELECT 1 FROM unit_members m WHERE m.scholar_id = s.id AND m.id = ${unit})) AS unit_match,
        (${subject} = '' OR EXISTS (SELECT 1 FROM subject_members m WHERE m.scholar_id = s.id AND m.id = NULLIF(${subject}, '')::uuid)) AS subject_match,
        (${letter} = '' OR s.letter = ${letter}) AS letter_match
      FROM scoped s
      WHERE ${keyword} = '' OR s.name ILIKE ${pattern} OR s.title ILIKE ${pattern} OR s.bio ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM affiliations a WHERE a.scholar_id = s.id AND a.name ILIKE ${pattern})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.research_directions) = 'array'
          THEN s.research_directions ELSE '[]'::jsonb END) r
          WHERE r->>'name' ILIKE ${pattern} OR r->>'description' ILIKE ${pattern})
        OR EXISTS (SELECT 1 FROM subject_members m JOIN subjects a ON a.id = m.id
          WHERE m.scholar_id = s.id AND (a."nameZh" ILIKE ${pattern} OR a."nameEn" ILIKE ${pattern}
            OR EXISTS (SELECT 1 FROM academic_subject_aliases alias WHERE alias."subjectId" = a.id AND alias.alias ILIKE ${pattern})))
    ),
    matching AS (SELECT * FROM searched WHERE unit_match AND subject_match AND letter_match),
    totals AS (SELECT count(*)::integer AS total FROM matching),
    paging AS (SELECT total, least(${page}::integer, greatest(1, ceil(total::numeric / ${limit}::integer)::integer)) AS page FROM totals),
    paged AS (
      SELECT s.*, row_number() OVER (ORDER BY
        CASE WHEN ${ranked} THEN CASE WHEN lower(trim(s.name)) = lower(${keyword}) THEN 0
          WHEN starts_with(lower(trim(s.name)), lower(${keyword})) THEN 1 ELSE 2 END ELSE 0 END,
        CASE WHEN s.letter = '#' THEN 1 ELSE 0 END, s.letter COLLATE "C",
        s.name COLLATE ${nameCollation}, s.id) AS ordinal
      FROM matching s
      ORDER BY ordinal LIMIT ${limit}::integer OFFSET (SELECT (page - 1) * ${limit}::integer FROM paging)
    )
    SELECT jsonb_build_object(
      'total', paging.total, 'page', paging.page, 'limit', ${limit}::integer,
      'nameOrder', ${collation === 'C' ? 'unicode' : 'pinyin'}::text,
      'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'avatar', s.avatar, 'title', s.title, 'letter', s.letter,
        'summary', left(coalesce(s.bio, ''), 240),
        'research', coalesce((SELECT jsonb_agg(r.name ORDER BY r.ordinal) FROM (
          SELECT left(trim(item->>'name'), 120) AS name, ordinal FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(s.research_directions) = 'array' THEN s.research_directions ELSE '[]'::jsonb END
          ) WITH ORDINALITY entries(item, ordinal)
          WHERE jsonb_typeof(item->'name') = 'string' AND trim(item->>'name') <> '' ORDER BY ordinal LIMIT 3
        ) r), '[]'::jsonb),
        'units', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) ORDER BY a.name COLLATE ${nameCollation}, a.id)
          FROM affiliations a WHERE a.scholar_id = s.id AND a.id <> 'unassigned'), '[]'::jsonb)
      ) ORDER BY s.ordinal) FROM paged s), '[]'::jsonb),
      'facets', jsonb_build_object(
        'units', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', u.id, 'name', u.name, 'kind', u.kind, 'parentId', u.parent_id,
          'count', (SELECT count(*) FROM searched s WHERE s.subject_match AND s.letter_match
            AND EXISTS (SELECT 1 FROM unit_members m WHERE m.scholar_id = s.id AND m.id = u.id))
        ) ORDER BY CASE WHEN u.id = 'unassigned' THEN 1 ELSE 0 END, u.name COLLATE ${nameCollation}, u.id) FROM unit_options u), '[]'::jsonb),
        'subjects', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', u.id, 'code', u.code, 'parentId', u."parentId", 'nameZh', u."nameZh", 'nameEn', u."nameEn",
          'count', (SELECT count(*) FROM searched s WHERE s.unit_match AND s.letter_match
            AND EXISTS (SELECT 1 FROM subject_members m WHERE m.scholar_id = s.id AND m.id = u.id))
        ) ORDER BY u."sortOrder", u."nameZh" COLLATE ${nameCollation}, u.id) FROM subjects u
          WHERE EXISTS (SELECT 1 FROM subject_members m WHERE m.id = u.id)), '[]'::jsonb),
        'letters', coalesce((SELECT jsonb_agg(jsonb_build_object('letter', l.letter, 'count', l.count) ORDER BY l.letter) FROM (
          SELECT letter, count(*) AS count FROM searched WHERE unit_match AND subject_match GROUP BY letter
        ) l), '[]'::jsonb)
      )
    ) AS data FROM paging
  `)
  return { code: 0, data: result!.data }
}

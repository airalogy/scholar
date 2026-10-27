ALTER TABLE institutions ADD COLUMN "administratorInitializedAt" timestamp(6);
ALTER TABLE users ADD COLUMN "administratorAccessExpiresAt" timestamp(6);
-- Existing institutions are not fresh installations, even if all owners have already left.
UPDATE institutions SET "administratorInitializedAt" = CURRENT_TIMESTAMP;

CREATE TABLE institution_permission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "institutionId" uuid,
  entity varchar(64) NOT NULL,
  "entityId" varchar(100) NOT NULL,
  "actorUserId" uuid,
  "actorLabel" varchar(200) NOT NULL,
  source varchar(100) NOT NULL,
  reason varchar(1000) NOT NULL,
  before jsonb,
  after jsonb,
  "createdAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "institution_permission_events_institutionId_createdAt_id_idx"
  ON institution_permission_events ("institutionId", "createdAt", id);

CREATE FUNCTION scholar_permission_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous jsonb;
  following jsonb;
  row_data jsonb;
  fields text[];
  context jsonb;
  institution_id uuid;
BEGIN
  -- Whitelist only authorization facts. Never serialize passwords, invite tokens or secrets.
  fields := CASE TG_TABLE_NAME
    WHEN 'users' THEN ARRAY['id', 'name', 'platform_role', 'administratorAccessExpiresAt']
    WHEN 'institution_memberships' THEN ARRAY['userId', 'role', 'can_review_content', 'can_import_data']
    WHEN 'institution_user_provisions' THEN ARRAY['id', 'name', 'claimedUserId', 'createdBy', 'role', 'can_review_content', 'can_import_data', 'status', 'expiresAt']
    WHEN 'institution_reviewer_grants' THEN ARRAY['id', 'personId', 'role', 'nodeId', 'appointmentIds', 'startsAt', 'endsAt', 'revokedAt', 'grantedBy', 'revokedBy']
    WHEN 'institution_api_credentials' THEN ARRAY['id', 'name', 'createdBy', 'scopes', 'expiresAt', 'revokedAt', 'secretVersion']
    WHEN 'lab_memberships' THEN ARRAY['userId', 'labId', 'role']
    WHEN 'institution_people' THEN ARRAY['id', 'userId', 'name', 'manually_suspended', 'lifecycle_status', 'is_active']
  END;
  IF TG_OP <> 'INSERT' THEN
    SELECT jsonb_object_agg(key, value) INTO previous FROM jsonb_each(to_jsonb(OLD)) WHERE key = ANY(fields);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT jsonb_object_agg(key, value) INTO following FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY(fields);
  END IF;
  IF previous IS NOT DISTINCT FROM following THEN RETURN NULL; END IF;
  -- Ordinary account creation / profile edits are not permission events.
  IF TG_TABLE_NAME = 'users' AND
    COALESCE(previous->>'platform_role', 'member') = COALESCE(following->>'platform_role', 'member') AND
    previous->>'administratorAccessExpiresAt' IS NOT DISTINCT FROM following->>'administratorAccessExpiresAt'
    THEN RETURN NULL; END IF;
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  institution_id := (row_data->>'institutionId')::uuid;
  IF TG_TABLE_NAME = 'lab_memberships' THEN
    SELECT "institutionId" INTO institution_id FROM labs WHERE id = (row_data->>'labId')::uuid;
  END IF;
  context := COALESCE(NULLIF(current_setting('scholar.permission_context', true), ''), '{}')::jsonb;
  institution_id := COALESCE(institution_id, (context->>'institutionId')::uuid);
  IF TG_TABLE_NAME = 'institution_memberships' AND following->>'role' IN ('owner', 'admin') THEN
    UPDATE institutions SET "administratorInitializedAt" = COALESCE("administratorInitializedAt", CURRENT_TIMESTAMP) WHERE id = institution_id;
  END IF;
  INSERT INTO institution_permission_events ("institutionId", entity, "entityId", "actorUserId", "actorLabel", source, reason, before, after)
    VALUES (institution_id, TG_TABLE_NAME, row_data->>'id', (context->>'actorUserId')::uuid,
      COALESCE(context->>'actorLabel', 'Unattributed database operation'),
      COALESCE(context->>'source', 'database'), COALESCE(context->>'reason', 'No application context recorded'), previous, following);
  RETURN NULL;
END $$;

CREATE TRIGGER permission_audit AFTER INSERT OR UPDATE OR DELETE ON institution_memberships FOR EACH ROW EXECUTE FUNCTION scholar_permission_audit();
CREATE TRIGGER permission_audit AFTER INSERT OR UPDATE OR DELETE ON institution_user_provisions FOR EACH ROW EXECUTE FUNCTION scholar_permission_audit();
CREATE TRIGGER permission_audit AFTER INSERT OR UPDATE OR DELETE ON institution_reviewer_grants FOR EACH ROW EXECUTE FUNCTION scholar_permission_audit();
CREATE TRIGGER permission_audit AFTER INSERT OR UPDATE OR DELETE ON institution_api_credentials FOR EACH ROW EXECUTE FUNCTION scholar_permission_audit();
CREATE TRIGGER permission_audit AFTER INSERT OR UPDATE OR DELETE ON lab_memberships FOR EACH ROW EXECUTE FUNCTION scholar_permission_audit();
CREATE TRIGGER permission_audit AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION scholar_permission_audit();
CREATE TRIGGER permission_audit AFTER UPDATE ON institution_people FOR EACH ROW EXECUTE FUNCTION scholar_permission_audit();

CREATE FUNCTION scholar_permission_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Permission audit events are append-only';
END $$;
CREATE TRIGGER permission_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON institution_permission_events
  FOR EACH STATEMENT EXECUTE FUNCTION scholar_permission_audit_immutable();

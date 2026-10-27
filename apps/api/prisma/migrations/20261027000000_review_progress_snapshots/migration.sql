-- Nullable evidence: do not invent names for historical records.
ALTER TABLE content_review_tasks
  ADD COLUMN person_name VARCHAR(200),
  ADD COLUMN assigned_person_name VARCHAR(200),
  ADD COLUMN node_name VARCHAR(200),
  ADD COLUMN completed_by_name VARCHAR(200);
ALTER TABLE content_review_actions
  ADD COLUMN actor_name VARCHAR(200),
  ADD COLUMN assignee_name VARCHAR(200),
  ADD COLUMN assignee_id UUID;

-- Capture names in the same transaction for every writer, including legacy routes.
-- Changes to a person's current name must not rewrite prior review evidence.
CREATE FUNCTION scholar_capture_review_task_names() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."personId" IS DISTINCT FROM OLD."personId" THEN
    SELECT left(p.name, 200) INTO NEW.person_name FROM institution_people p WHERE p.id = NEW."personId";
  ELSE NEW.person_name := OLD.person_name; END IF;
  IF TG_OP = 'INSERT' OR NEW."assignedPersonId" IS DISTINCT FROM OLD."assignedPersonId" THEN
    SELECT left(p.name, 200) INTO NEW.assigned_person_name FROM institution_people p WHERE p.id = NEW."assignedPersonId";
  ELSE NEW.assigned_person_name := OLD.assigned_person_name; END IF;
  IF TG_OP = 'INSERT' OR NEW."nodeId" IS DISTINCT FROM OLD."nodeId" THEN
    SELECT left(n.name, 200) INTO NEW.node_name FROM institution_org_nodes n WHERE n.id = NEW."nodeId";
  ELSE NEW.node_name := OLD.node_name; END IF;
  IF TG_OP = 'INSERT' OR NEW."completedBy" IS DISTINCT FROM OLD."completedBy" THEN
    SELECT left(u.name, 200) INTO NEW.completed_by_name FROM users u WHERE u.id = NEW."completedBy";
  ELSE NEW.completed_by_name := OLD.completed_by_name; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER review_task_display_snapshot BEFORE INSERT OR UPDATE ON content_review_tasks
  FOR EACH ROW EXECUTE FUNCTION scholar_capture_review_task_names();

CREATE FUNCTION scholar_capture_review_actor_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."actorId" IS DISTINCT FROM OLD."actorId" OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      RAISE EXCEPTION 'Review action actor identity is immutable';
    END IF;
    NEW.actor_name := OLD.actor_name;
    NEW.assignee_name := OLD.assignee_name;
    RETURN NEW;
  END IF;
  SELECT left(u.name, 200) INTO NEW.actor_name FROM users u WHERE u.id = NEW."actorId";
  SELECT left(p.name, 200) INTO NEW.assignee_name FROM institution_people p
    WHERE p.id = NEW.assignee_id AND p."institutionId" = NEW."institutionId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER review_action_display_snapshot BEFORE INSERT OR UPDATE ON content_review_actions
  FOR EACH ROW EXECUTE FUNCTION scholar_capture_review_actor_name();

-- Classification is independent of primary selection and login eligibility.
-- Existing identifiers remain unclassified until explicitly verified.
ALTER TABLE "institution_person_identifiers"
  ADD COLUMN "kind" VARCHAR(16) NOT NULL DEFAULT 'unknown',
  ADD CONSTRAINT "institution_identifiers_kind_check"
    CHECK ("kind" IN ('unknown', 'formal', 'temporary'));

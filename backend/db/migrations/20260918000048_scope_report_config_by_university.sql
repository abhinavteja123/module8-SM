-- report_templates/report_requirements/programme_documents were global
-- singletons shared by every tenant — one university's CRCS editing a
-- report type or deleting a guideline PDF silently changed it for every
-- other university on the platform. Scope them the same way migration
-- 20260912000042 scoped users/schools/internship_cycles: denormalize
-- university_id directly onto the tables that were queried unscoped.

ALTER TABLE report_templates ADD COLUMN university_id UUID REFERENCES universities(id);
UPDATE report_templates SET university_id = (SELECT id FROM universities WHERE code = 'SRMAP') WHERE university_id IS NULL;
ALTER TABLE report_templates ALTER COLUMN university_id SET NOT NULL;
CREATE INDEX report_templates_university_id_idx ON report_templates(university_id);

ALTER TABLE programme_documents ADD COLUMN university_id UUID REFERENCES universities(id);
UPDATE programme_documents SET university_id = (SELECT id FROM universities WHERE code = 'SRMAP') WHERE university_id IS NULL;
ALTER TABLE programme_documents ALTER COLUMN university_id SET NOT NULL;
CREATE INDEX programme_documents_university_id_idx ON programme_documents(university_id);

ALTER TABLE report_requirements ADD COLUMN university_id UUID REFERENCES universities(id);
UPDATE report_requirements SET university_id = (SELECT id FROM universities WHERE code = 'SRMAP') WHERE university_id IS NULL;
ALTER TABLE report_requirements ALTER COLUMN university_id SET NOT NULL;
CREATE INDEX report_requirements_university_id_idx ON report_requirements(university_id);

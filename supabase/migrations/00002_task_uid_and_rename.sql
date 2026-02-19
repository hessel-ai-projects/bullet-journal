-- Add task_uid column for chain tracking across migrations
ALTER TABLE entries ADD COLUMN task_uid UUID DEFAULT gen_random_uuid();
UPDATE entries SET task_uid = gen_random_uuid() WHERE task_uid IS NULL;
ALTER TABLE entries ALTER COLUMN task_uid SET NOT NULL;
CREATE INDEX idx_entries_task_uid ON entries(task_uid);

-- Backfill: make monthly parents and their daily children share the same task_uid
UPDATE entries AS child
SET task_uid = parent.task_uid
FROM entries AS parent
WHERE child.parent_id = parent.id;

-- Rename parent_id to monthly_id (clearer semantics — only links daily → monthly)
ALTER TABLE entries RENAME COLUMN parent_id TO monthly_id;

-- Add hourly rate column for teachers (set by admin)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(8,2) DEFAULT NULL;

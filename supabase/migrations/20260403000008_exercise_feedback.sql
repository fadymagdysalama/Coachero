-- Add exercise_id to client_feedback for per-exercise notes.
-- Nullable: NULL means the feedback is at the day level (existing behaviour).
ALTER TABLE client_feedback
  ADD COLUMN IF NOT EXISTS exercise_id UUID REFERENCES program_exercises(id) ON DELETE CASCADE;

-- Allow coaches to read feedback for programs they created.
CREATE POLICY "Coach can view feedback on their programs" ON client_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = client_feedback.program_id
        AND programs.creator_id = auth.uid()
    )
  );

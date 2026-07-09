-- Allow closing superseded active evaluations without deleting them.
ALTER TABLE public.jivi_chat_sessions
  DROP CONSTRAINT IF EXISTS jivi_chat_sessions_status_check;

ALTER TABLE public.jivi_chat_sessions
  ADD CONSTRAINT jivi_chat_sessions_status_check
  CHECK (status = ANY (ARRAY[
    'active'::text,
    'completed'::text,
    'emergency_stopped'::text,
    'abandoned'::text
  ]));

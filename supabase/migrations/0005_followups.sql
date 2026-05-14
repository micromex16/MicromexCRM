-- Follow-up tracking: link a follow-up send back to its parent + mark the
-- parent so we never double-follow-up.

alter table public.sends
  add column if not exists parent_send_id uuid references public.sends(id) on delete set null,
  add column if not exists is_followup boolean not null default false,
  add column if not exists followup_sent_at timestamptz;

create index if not exists sends_parent_send_id_idx on public.sends(parent_send_id);
create index if not exists sends_followup_sent_at_idx on public.sends(followup_sent_at);

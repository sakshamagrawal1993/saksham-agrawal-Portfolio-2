-- RLS filters authenticated reads to the current user. Client writes continue
-- to flow through the LibertyMD proxy using the service role.
grant usage on schema public to authenticated;

grant select on table
  public.libertymd_profiles,
  public.libertymd_consultations,
  public.libertymd_messages,
  public.libertymd_safety_events,
  public.libertymd_reports
to authenticated;

revoke insert, update, delete, truncate, references, trigger on table
  public.libertymd_profiles,
  public.libertymd_consultations,
  public.libertymd_messages,
  public.libertymd_safety_events,
  public.libertymd_reports
from authenticated, anon;

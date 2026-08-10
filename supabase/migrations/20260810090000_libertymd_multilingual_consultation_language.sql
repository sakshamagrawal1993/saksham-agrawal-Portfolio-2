-- LibertyMD clinical journeys support every language exposed by the product.
-- Spanish chrome variants share one persisted clinical language (`es`).
alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_language_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_language_check
  check (language in ('en', 'es', 'hi', 'hi-Latn', 'fr', 'de', 'pt'));

-- P1-05 AC3 — adults-only patient/profile age audit (counts only; no PHI columns).
-- Expect patients_under_18 = 0 after enforcement + any soft-null remediation.
-- Profiles CHECK is already 18–120 historically; profiles_under_18 should be 0 if CHECK held.
-- Soft-null remediation (if count > 0): UPDATE libertymd_patients SET age = NULL
--   WHERE age IS NOT NULL AND age < 18; then re-run counts. Do not delete rows.
-- Project: ralhkmpbslsdkwnqzqen

select count(*) as patients_under_18
from public.libertymd_patients
where age is not null and age < 18;

select count(*) as profiles_under_18
from public.libertymd_profiles
where age is not null and age < 18;

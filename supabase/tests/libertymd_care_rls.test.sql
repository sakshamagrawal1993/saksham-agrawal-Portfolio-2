begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(99);

select has_table('public', 'libertymd_profiles', 'profiles table exists');
select has_table('public', 'libertymd_consultations', 'consultations table exists');
select has_table('public', 'libertymd_messages', 'messages table exists');
select has_table('public', 'libertymd_safety_events', 'safety events table exists');
select has_table('public', 'libertymd_reports', 'reports table exists');
select has_table('public', 'libertymd_patients', 'patients table exists');
select has_table('public', 'libertymd_diagnostic_runs', 'diagnostic runs table exists');
select has_table('public', 'libertymd_identity_events', 'identity events table exists');
select has_table('public', 'libertymd_account_merges', 'account merges table exists');
select has_table('public', 'libertymd_consent_events', 'consent events table exists');
select has_table('public', 'libertymd_product_events', 'product events table exists');
select has_column('public', 'libertymd_consultations', 'version', 'consultation version exists');
select has_column('public', 'libertymd_consultations', 'active_request_id', 'request lease id exists');
select has_column('public', 'libertymd_consultations', 'patient_id', 'consultation patient reference exists');
select has_column('public', 'libertymd_reports', 'final_diagnostic_run_id', 'report diagnostic run reference exists');
select has_column('public', 'libertymd_messages', 'client_message_id', 'message idempotency key exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.libertymd_profiles'::regclass),
  'profile RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.libertymd_consultations'::regclass),
  'consultation RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.libertymd_messages'::regclass),
  'message RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.libertymd_safety_events'::regclass),
  'safety event RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.libertymd_reports'::regclass),
  'report RLS is enabled'
);

select ok(
  not has_function_privilege('authenticated', 'public.libertymd_claim_consultation_request(uuid,uuid,uuid,bigint)', 'execute'),
  'authenticated users cannot claim request leases directly'
);
select ok(
  has_function_privilege('service_role', 'public.libertymd_claim_consultation_request(uuid,uuid,uuid,bigint)', 'execute'),
  'service role can claim request leases'
);
select ok(
  not has_function_privilege('authenticated', 'public.libertymd_complete_account_merge(text,uuid)', 'execute'),
  'authenticated users cannot merge accounts directly'
);
select ok(
  has_function_privilege('service_role', 'public.libertymd_complete_account_merge(text,uuid)', 'execute'),
  'service role can complete an approved account merge'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'libertymd-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'libertymd-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '', null, '{}', '{}', now() - interval '40 days', now() - interval '40 days');

insert into public.libertymd_profiles (user_id, email, is_anonymous, updated_at) values
  ('10000000-0000-4000-8000-000000000001', 'libertymd-a@example.test', false, now()),
  ('20000000-0000-4000-8000-000000000002', 'libertymd-b@example.test', false, now()),
  ('30000000-0000-4000-8000-000000000003', null, true, now() - interval '40 days');

select throws_ok(
  $$insert into public.libertymd_profiles (user_id) values ('10000000-0000-4000-8000-000000000001')$$,
  '23505',
  null,
  'profiles enforce one row per user'
);

-- P1-23 landing fixtures (expired orphan; referenced+expired under linked; referenced under expired anon)
insert into public.libertymd_landing_sessions (
  id, anon_session_key, utm_campaign, retention_expires_at
) values
  ('d0000000-0000-4000-8000-000000000001', 'p1-23-orphan-expired', 'orphan', now() - interval '1 day'),
  ('d0000000-0000-4000-8000-000000000002', 'p1-23-linked-expired', 'linked', now() - interval '1 day'),
  ('d0000000-0000-4000-8000-000000000003', 'p1-23-anon-expired', 'anon-purge', now() - interval '1 day');

insert into public.libertymd_consultations (id, user_id, status, chief_complaint, retention_expires_at, landing_session_id) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'interviewing', 'low fever', null, 'd0000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'completed', 'headache', null, null),
  ('a0000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'completed', 'sore throat', null, null),
  ('a0000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', 'completed', 'expired guest consult', now() - interval '1 day', 'd0000000-0000-4000-8000-000000000003');

select results_eq(
  $$select accepted from public.libertymd_claim_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    1
  )$$,
  array[true],
  'first request acquires the consultation lease'
);

select results_eq(
  $$select accepted from public.libertymd_claim_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    null
  )$$,
  array[false],
  'a concurrent request cannot acquire an active lease'
);

select is(
  public.libertymd_finish_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001'
  ),
  true,
  'the lease owner can clear the consultation lease'
);

select results_eq(
  $$select accepted from public.libertymd_claim_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    null
  )$$,
  array[true],
  'the next request acquires the released lease'
);

insert into public.libertymd_messages (
  consultation_id, role, content, client_message_id
) values (
  'a0000000-0000-4000-8000-000000000001', 'user', 'It started yesterday.',
  'b0000000-0000-4000-8000-000000000002'
);

select throws_ok(
  $$insert into public.libertymd_messages (consultation_id, role, content, client_message_id)
    values ('a0000000-0000-4000-8000-000000000001', 'user', 'Duplicate retry', 'b0000000-0000-4000-8000-000000000002')$$,
  '23505',
  null,
  'a retried client message cannot be inserted twice'
);

select is(
  public.libertymd_finish_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002'
  ),
  true,
  'the second lease is cleared'
);

insert into public.libertymd_messages (consultation_id, role, content) values (
  'a0000000-0000-4000-8000-000000000001',
  'assistant',
  'What other symptoms are present?'
);

select results_eq(
  $$select replayed from public.libertymd_claim_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    null
  )$$,
  array[true],
  'a completed client message id is recognized as a replay'
);

insert into public.libertymd_messages (
  consultation_id, role, content, client_message_id
) values (
  'a0000000-0000-4000-8000-000000000001',
  'user',
  'Partially saved patient answer',
  'b0000000-0000-4000-8000-000000000004'
);

select results_eq(
  $$select accepted from public.libertymd_claim_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000004',
    null
  )$$,
  array[true],
  'a partially saved patient turn can resume'
);

select results_eq(
  $$select replayed from public.libertymd_claim_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000004',
    null
  )$$,
  array[false],
  'a concurrent retry is not misreported as a completed replay'
);

select is(
  public.libertymd_finish_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000004'
  ),
  true,
  'the resumed request lease can be cleared'
);

insert into public.libertymd_messages (consultation_id, role, content) values (
  'a0000000-0000-4000-8000-000000000001',
  'assistant',
  'Completed response after recovery'
);

select results_eq(
  $$select replayed from public.libertymd_claim_consultation_request(
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000004',
    null
  )$$,
  array[true],
  'a resumed request replays once an assistant response exists'
);

insert into public.libertymd_messages (consultation_id, role, content) values
  ('a0000000-0000-4000-8000-000000000002', 'assistant', 'User A message'),
  ('a0000000-0000-4000-8000-000000000003', 'assistant', 'User B message');

insert into public.libertymd_safety_events (
  consultation_id, user_id, status, risk_level, crisis_type, care_setting, force_end
) values
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'pass', 'low', 'none', 'home', false),
  ('a0000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'pass', 'low', 'none', 'home', false);

insert into public.libertymd_reports (
  consultation_id, user_id, report_data, confidence_score, access_status
) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '{"headline":"withheld"}', 70, 'withheld'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '{"headline":"released"}', 70, 'guest_released'),
  ('a0000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '{"headline":"other user"}', 70, 'saved');

insert into public.libertymd_diagnostic_runs (
  consultation_id, user_id, patient_id, turn_count, run_status,
  differential_diagnosis, confidence_score, evidence_score, validation_reason
) values
  (
    'a0000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    (select patient_id from public.libertymd_consultations where id = 'a0000000-0000-4000-8000-000000000002'),
    8,
    'validated',
    '[{"rank":1,"name":"Tension headache"}]',
    70,
    85,
    'validated'
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    (select patient_id from public.libertymd_consultations where id = 'a0000000-0000-4000-8000-000000000003'),
    8,
    'validated',
    '[{"rank":1,"name":"Viral pharyngitis"}]',
    72,
    90,
    'validated'
  );

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select is((select count(*) from public.libertymd_profiles), 1::bigint, 'user A reads only their profile');
select is((select count(*) from public.libertymd_consultations), 2::bigint, 'user A reads only their consultations');
select is((select count(*) from public.libertymd_messages), 5::bigint, 'user A reads only their messages');
select is((select count(*) from public.libertymd_safety_events), 1::bigint, 'user A reads only their safety events');
select is((select count(*) from public.libertymd_reports), 1::bigint, 'user A sees released report but not withheld report');
select is((select count(*) from public.libertymd_patients), 1::bigint, 'user A reads only their patient records');
select is((select count(*) from public.libertymd_diagnostic_runs), 1::bigint, 'user A reads only their diagnostic runs');

select throws_ok(
  $$insert into public.libertymd_consultations (user_id, status)
    values ('10000000-0000-4000-8000-000000000001', 'interviewing')$$,
  '42501',
  null,
  'authenticated clients cannot write consultations directly'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';

select is((select count(*) from public.libertymd_consultations), 1::bigint, 'user B cannot read user A consultations');
select is((select count(*) from public.libertymd_reports), 1::bigint, 'user B reads only their saved report');

reset role;

insert into public.libertymd_identity_events (
  user_id, consultation_id, event_type, provider
) values (
  '10000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'anonymous_profile_created',
  null
);

insert into public.libertymd_consent_events (
  user_id, patient_id, consultation_id, consent_type, consent_version, decision
) values (
  '10000000-0000-4000-8000-000000000001',
  (select patient_id from public.libertymd_consultations where id = 'a0000000-0000-4000-8000-000000000002'),
  'a0000000-0000-4000-8000-000000000002',
  'ai_care_disclosure',
  'test-v1',
  'accepted'
);

insert into public.libertymd_product_events (
  user_id, consultation_id, event_name
) values (
  '10000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'report_gate_reached'
);

-- P1-25 AC5: abort fixtures prove no clinical movement; do not claim durable expired/failed.
select throws_ok(
  $$select * from public.libertymd_complete_account_merge(
    'not-a-real-transfer-hash',
    '20000000-0000-4000-8000-000000000002'
  )$$,
  'P0001',
  'Account transfer is not available',
  'P1-25 bad transfer hash aborts merge'
);
select is(
  (select count(*) from public.libertymd_consultations where user_id = '10000000-0000-4000-8000-000000000001'),
  2::bigint,
  'P1-25 bad-hash abort: source consultations unchanged'
);
select is(
  (select count(*) from public.libertymd_reports where user_id = '10000000-0000-4000-8000-000000000001'),
  2::bigint,
  'P1-25 bad-hash abort: source reports unchanged'
);

insert into public.libertymd_account_merges (
  source_user_id, consultation_id, transfer_token_hash, expires_at, status
) values (
  '10000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'expired-transfer-token-hash',
  now() - interval '1 minute',
  'prepared'
);

select throws_ok(
  $$select * from public.libertymd_complete_account_merge(
    'expired-transfer-token-hash',
    '20000000-0000-4000-8000-000000000002'
  )$$,
  'P0001',
  'Account transfer expired',
  'P1-25 expired transfer aborts merge'
);
select is(
  (select status from public.libertymd_account_merges where transfer_token_hash = 'expired-transfer-token-hash'),
  'prepared',
  'P1-25 expired abort: merge row stays prepared (expired UPDATE rolls back with RAISE)'
);
select is(
  (select count(*) from public.libertymd_consultations where user_id = '10000000-0000-4000-8000-000000000001'),
  2::bigint,
  'P1-25 expired abort: no clinical consultation movement'
);
select is(
  (select count(*) from public.libertymd_diagnostic_runs where user_id = '10000000-0000-4000-8000-000000000001'),
  1::bigint,
  'P1-25 expired abort: diagnostic runs unchanged'
);

-- P4-05 Path 1: matching age+sex → re-parent onto retained target self (no age/sex coalesce).
update public.libertymd_patients
set age = 34, sex_at_birth = 'female'
where owner_user_id in (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
) and relationship = 'self';
update public.libertymd_profiles
set age = 34, sex_at_birth = 'female'
where user_id in (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
);

insert into public.libertymd_account_merges (
  source_user_id, consultation_id, transfer_token_hash, expires_at
) values (
  '10000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'test-transfer-token-hash',
  now() + interval '10 minutes'
);

select lives_ok(
  $$select * from public.libertymd_complete_account_merge(
    'test-transfer-token-hash',
    '20000000-0000-4000-8000-000000000002'
  )$$,
  'P4-05 Path 1: matching demographics merge onto retained target self'
);
select is(
  (select status from public.libertymd_account_merges where transfer_token_hash = 'test-transfer-token-hash'),
  'completed',
  'account merge is marked completed'
);
select is(
  (select metadata->>'collision_path' from public.libertymd_account_merges where transfer_token_hash = 'test-transfer-token-hash'),
  'matched_self',
  'P4-05 Path 1: collision_path matched_self on merge metadata'
);
select is(
  (select count(*) from public.libertymd_consultations where user_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint,
  'source consultations are fully transferred'
);
select is(
  (select count(*) from public.libertymd_consultations where user_id = '20000000-0000-4000-8000-000000000002'),
  3::bigint,
  'target account receives source consultations without losing history'
);
select is(
  (select count(*) from public.libertymd_reports where user_id = '20000000-0000-4000-8000-000000000002'),
  3::bigint,
  'reports are transferred to the target account'
);
select is(
  (select count(*) from public.libertymd_diagnostic_runs where user_id = '20000000-0000-4000-8000-000000000002'),
  2::bigint,
  'diagnostic runs are transferred to the target account'
);
select is(
  (select count(*) from public.libertymd_identity_events where user_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint,
  'identity events no longer point at the source account'
);
select is(
  (select count(*) from public.libertymd_consent_events where user_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint,
  'consent events no longer point at the source account'
);
select is(
  (select count(*) from public.libertymd_product_events where user_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint,
  'product events no longer point at the source account'
);
select is(
  (select count(*) from public.libertymd_profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the source LibertyMD profile is removed after transfer'
);
select is(
  (select count(*) from public.libertymd_patients where owner_user_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the source no longer owns patient records'
);
select is(
  (select count(*) from auth.users where id = '10000000-0000-4000-8000-000000000001'),
  1::bigint,
  'the shared-project Auth user is preserved for product isolation'
);
select is(
  (
    select count(*)
    from public.libertymd_consultations consultation
    join public.libertymd_patients patient on patient.id = consultation.patient_id
    where consultation.id in (
      'a0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000002'
    )
      and patient.owner_user_id = '20000000-0000-4000-8000-000000000002'
      and patient.relationship = 'self'
  ),
  2::bigint,
  'P4-05 Path 1: transferred consultations reference the target self-patient'
);
select is(
  (select count(*) from public.libertymd_patients where owner_user_id = '20000000-0000-4000-8000-000000000002' and relationship = 'self'),
  1::bigint,
  'P4-05 Path 1: unique self retained on target'
);
select is(
  (select age::int from public.libertymd_patients where owner_user_id = '20000000-0000-4000-8000-000000000002' and relationship = 'self'),
  34,
  'P4-05 Path 1: target self age unchanged (no coalesce)'
);
select is(
  (select sex_at_birth from public.libertymd_patients where owner_user_id = '20000000-0000-4000-8000-000000000002' and relationship = 'self'),
  'female',
  'P4-05 Path 1: target self sex unchanged (no coalesce)'
);

-- ---------------------------------------------------------------------------
-- P4-05 Path 2 mismatch (createable) + fail-closed illegal create
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('40000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'libertymd-guest-mismatch@example.test', '', now(), '{}', '{}', now(), now()),
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'libertymd-target-mismatch@example.test', '', now(), '{}', '{}', now(), now()),
  ('60000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'libertymd-guest-illegal@example.test', '', now(), '{}', '{}', now(), now()),
  ('70000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'libertymd-target-illegal@example.test', '', now(), '{}', '{}', now(), now());

insert into public.libertymd_profiles (user_id, email, is_anonymous, age, sex_at_birth, updated_at) values
  ('40000000-0000-4000-8000-000000000004', 'libertymd-guest-mismatch@example.test', true, 28, 'male', now()),
  ('50000000-0000-4000-8000-000000000005', 'libertymd-target-mismatch@example.test', false, 45, 'female', now()),
  ('60000000-0000-4000-8000-000000000006', 'libertymd-guest-illegal@example.test', true, 30, 'prefer_not_to_say', now()),
  ('70000000-0000-4000-8000-000000000007', 'libertymd-target-illegal@example.test', false, 40, 'female', now());

insert into public.libertymd_patients (owner_user_id, relationship, display_label, age, sex_at_birth) values
  ('40000000-0000-4000-8000-000000000004', 'self', 'Me', 28, 'male'),
  ('50000000-0000-4000-8000-000000000005', 'self', 'Me', 45, 'female'),
  ('60000000-0000-4000-8000-000000000006', 'self', 'Me', 30, 'prefer_not_to_say'),
  ('70000000-0000-4000-8000-000000000007', 'self', 'Me', 40, 'female');

insert into public.libertymd_consultations (id, user_id, status, chief_complaint, retention_expires_at) values
  ('a0000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000004', 'completed', 'guest mismatch consult', null),
  ('a0000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000005', 'completed', 'target prior consult', null),
  ('a0000000-0000-4000-8000-000000000012', '60000000-0000-4000-8000-000000000006', 'completed', 'guest illegal sex consult', null);

insert into public.libertymd_account_merges (
  source_user_id, consultation_id, transfer_token_hash, expires_at
) values (
  '40000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000010',
  'p4-05-mismatch-token-hash',
  now() + interval '10 minutes'
);

select lives_ok(
  $$select * from public.libertymd_complete_account_merge(
    'p4-05-mismatch-token-hash',
    '50000000-0000-4000-8000-000000000005'
  )$$,
  'P4-05 Path 2: mismatch creates distinct other profile'
);
select is(
  (select metadata->>'collision_path' from public.libertymd_account_merges where transfer_token_hash = 'p4-05-mismatch-token-hash'),
  'distinct_profile',
  'P4-05 Path 2: collision_path distinct_profile'
);
select is(
  (
    select patient.relationship
    from public.libertymd_consultations consultation
    join public.libertymd_patients patient on patient.id = consultation.patient_id
    where consultation.id = 'a0000000-0000-4000-8000-000000000010'
  ),
  'other',
  'P4-05 Path 2: mismatch consult attributed to non-self other'
);
select is(
  (
    select patient.display_label
    from public.libertymd_consultations consultation
    join public.libertymd_patients patient on patient.id = consultation.patient_id
    where consultation.id = 'a0000000-0000-4000-8000-000000000010'
  ),
  'Saved from guest visit',
  'P4-05 Path 2: system display_label Saved from guest visit'
);
select is(
  (select age::int from public.libertymd_patients where owner_user_id = '50000000-0000-4000-8000-000000000005' and relationship = 'self'),
  45,
  'P4-05 Path 2: target self age untouched'
);
select is(
  (select sex_at_birth from public.libertymd_patients where owner_user_id = '50000000-0000-4000-8000-000000000005' and relationship = 'self'),
  'female',
  'P4-05 Path 2: target self sex untouched'
);
select is(
  (select age::int from public.libertymd_profiles where user_id = '50000000-0000-4000-8000-000000000005'),
  45,
  'P4-05 Path 2: target profile age untouched (Q1A)'
);
select is(
  (select sex_at_birth from public.libertymd_profiles where user_id = '50000000-0000-4000-8000-000000000005'),
  'female',
  'P4-05 Path 2: target profile sex untouched (Q1A)'
);
select is(
  (select count(*) from public.libertymd_patients where owner_user_id = '50000000-0000-4000-8000-000000000005' and relationship = 'self'),
  1::bigint,
  'P4-05 Path 2: still exactly one self on target'
);
select is(
  (
    select count(*)
    from public.libertymd_consultations consultation
    where consultation.id = 'a0000000-0000-4000-8000-000000000010'
      and consultation.patient_id = (
        select id from public.libertymd_patients
        where owner_user_id = '50000000-0000-4000-8000-000000000005' and relationship = 'self'
      )
  ),
  0::bigint,
  'P4-05 Path 2: mismatch never attributes guest consult to target self'
);

insert into public.libertymd_account_merges (
  source_user_id, consultation_id, transfer_token_hash, expires_at
) values (
  '60000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000012',
  'p4-05-illegal-create-token-hash',
  now() + interval '10 minutes'
);

select throws_ok(
  $$select * from public.libertymd_complete_account_merge(
    'p4-05-illegal-create-token-hash',
    '70000000-0000-4000-8000-000000000007'
  )$$,
  'P0001',
  'Account transfer could not save this visit safely',
  'P4-05 fail-closed: prefer_not_to_say cannot create other under createPatient parity'
);
select is(
  (select count(*) from public.libertymd_consultations where user_id = '60000000-0000-4000-8000-000000000006'),
  1::bigint,
  'P4-05 fail-closed: source consults unchanged'
);
select is(
  (select count(*) from public.libertymd_patients where owner_user_id = '60000000-0000-4000-8000-000000000006'),
  1::bigint,
  'P4-05 fail-closed: source patient retained'
);
select is(
  (select count(*) from public.libertymd_patients where owner_user_id = '70000000-0000-4000-8000-000000000007'),
  1::bigint,
  'P4-05 fail-closed: target still only self (no other inserted)'
);
select is(
  (select status from public.libertymd_account_merges where transfer_token_hash = 'p4-05-illegal-create-token-hash'),
  'prepared',
  'P4-05 fail-closed: merge row stays prepared after raise rollback'
);

-- ---------------------------------------------------------------------------
-- P1-24 Storage fixtures (metadata-only; byte delete is Edge Storage API)
-- Insert BEFORE Postgres cleanup so expired-consult paths become orphans after.
-- Path: {consultation_id}/{kind}/{object_uuid}
-- Bucket: libertymd-care only. Never libertymd-assets.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('libertymd-care', 'libertymd-care', false)
on conflict (id) do update set public = false;

insert into storage.objects (id, bucket_id, name, owner, metadata)
values (
  'f0000000-0000-4000-8000-000000000001',
  'libertymd-care',
  'a0000000-0000-4000-8000-000000000004/photo/e0000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  '{}'::jsonb
)
on conflict (bucket_id, name) do nothing;

insert into storage.objects (id, bucket_id, name, owner, metadata)
values (
  'f0000000-0000-4000-8000-000000000002',
  'libertymd-care',
  'a0000000-0000-4000-8000-000000000001/lab/e0000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  '{}'::jsonb
)
on conflict (bucket_id, name) do nothing;

select lives_ok(
  $$select * from public.cleanup_expired_libertymd_data_dry_run()$$,
  'P1-23 dry-run twin executes without error'
);
select is(
  (select count(*) from public.libertymd_consultations where user_id = '30000000-0000-4000-8000-000000000003'),
  1::bigint,
  'P1-23 dry-run does not delete expired anonymous consultation'
);
select is(
  (select count(*) from public.libertymd_landing_sessions where id = 'd0000000-0000-4000-8000-000000000001'),
  1::bigint,
  'P1-23 dry-run does not delete expired orphan landing'
);

select lives_ok(
  $$select * from public.cleanup_expired_libertymd_data()$$,
  'expired anonymous data cleanup executes'
);
select is(
  (select count(*) from public.libertymd_consultations where user_id = '30000000-0000-4000-8000-000000000003'),
  0::bigint,
  'expired anonymous consultation is deleted'
);
select is(
  (select count(*) from public.libertymd_profiles where user_id = '30000000-0000-4000-8000-000000000003'),
  0::bigint,
  'expired anonymous profile without consultations is deleted'
);
select is(
  (select count(*) from public.libertymd_consultations where retention_expires_at is null),
  6::bigint,
  'P1-23 linked / NULL-retention consultations survive cleanup'
);
select is(
  (select count(*) from public.libertymd_landing_sessions where id = 'd0000000-0000-4000-8000-000000000001'),
  0::bigint,
  'P1-23 expired orphan landing is deleted'
);
select is(
  (select count(*) from public.libertymd_landing_sessions where id = 'd0000000-0000-4000-8000-000000000002'),
  1::bigint,
  'P1-23 referenced expired landing under linked consult survives'
);
select is(
  (select count(*) from public.libertymd_landing_sessions where id = 'd0000000-0000-4000-8000-000000000003'),
  0::bigint,
  'P1-23 landing orphaned by expired anon consult delete is removed'
);
select is(
  (select count(*) from auth.users where id = '30000000-0000-4000-8000-000000000003'),
  1::bigint,
  'P1-23 cleanup never deletes auth.users'
);

-- After Postgres cleanup, expired consult path is orphan; linked path survives.
select is(
  (
    select count(*)::bigint
    from public.list_libertymd_care_storage_orphans()
    where object_path = 'a0000000-0000-4000-8000-000000000004/photo/e0000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'P1-24 orphan detect finds object under purged consult path'
);

select is(
  (
    select count(*)::bigint
    from public.list_libertymd_care_storage_orphans()
    where object_path = 'a0000000-0000-4000-8000-000000000001/lab/e0000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'P1-24 survivor under live linked consult is not an orphan'
);

-- Honesty: SQL must NOT be used as retention delete. Edge API owns byte removal
-- (DoD+ / CANNOT RUN for live Storage API in :ci).

select * from finish();
rollback;

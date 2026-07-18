begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

select has_table('public', 'libertymd_profiles', 'profiles table exists');
select has_table('public', 'libertymd_consultations', 'consultations table exists');
select has_table('public', 'libertymd_messages', 'messages table exists');
select has_table('public', 'libertymd_safety_events', 'safety events table exists');
select has_table('public', 'libertymd_reports', 'reports table exists');
select has_column('public', 'libertymd_consultations', 'version', 'consultation version exists');
select has_column('public', 'libertymd_consultations', 'active_request_id', 'request lease id exists');
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

insert into public.libertymd_consultations (id, user_id, status, chief_complaint, retention_expires_at) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'interviewing', 'low fever', null),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'completed', 'headache', null),
  ('a0000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'completed', 'sore throat', null),
  ('a0000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', 'completed', 'expired guest consult', now() - interval '1 day');

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

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select is((select count(*) from public.libertymd_profiles), 1::bigint, 'user A reads only their profile');
select is((select count(*) from public.libertymd_consultations), 2::bigint, 'user A reads only their consultations');
select is((select count(*) from public.libertymd_messages), 5::bigint, 'user A reads only their messages');
select is((select count(*) from public.libertymd_safety_events), 1::bigint, 'user A reads only their safety events');
select is((select count(*) from public.libertymd_reports), 1::bigint, 'user A sees released report but not withheld report');

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

select * from finish();
rollback;

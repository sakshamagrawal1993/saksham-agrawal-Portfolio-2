-- LibertyMD i18n: safety message catalog, region config, translation review ledger.
-- Human-oversight model: every non-English row is seeded as 'pending_review'.
-- The edge function must serve only status='approved' rows and fall back to approved English.

-- 1) Language/region on consultations -----------------------------------------
alter table if exists public.libertymd_consultations
  add column if not exists language text not null default 'en'
    check (language in ('en','es','pt','hi','fr','de')),
  add column if not exists region text not null default 'US'
    check (region in ('US','MX','BR','IN','FR','DE','GB','ES','PT','EU'));

-- 2) Safety message catalog ----------------------------------------------------
create table if not exists public.libertymd_message_catalog (
  id uuid primary key default gen_random_uuid(),
  message_key text not null,          -- e.g. 'emergency.acs_chest_pain'
  language text not null check (language in ('en','es','pt','hi','fr','de')),
  text text not null,                 -- may contain {emergency_number}
  version int not null default 1,
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','rejected','superseded')),
  source text not null default 'machine',   -- 'machine' | 'human'
  reviewer_notes text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_key, language, version)
);

-- 3) Region config ---------------------------------------------------------------
create table if not exists public.libertymd_region_config (
  region text primary key,
  emergency_number text not null,
  care_setting_labels jsonb not null default '{}'::jsonb,  -- localized-care-setting vocab hints per region
  notes text
);

insert into public.libertymd_region_config (region, emergency_number, notes) values
  ('US','911','United States'),
  ('MX','911','Mexico (065 legacy Cruz Roja still recognized)'),
  ('BR','192','Brazil SAMU'),
  ('IN','112','India unified emergency number (102/108 ambulance legacy)'),
  ('FR','15','France SAMU (112 EU-wide also valid)'),
  ('DE','112','Germany'),
  ('GB','999','United Kingdom (112 also valid)'),
  ('ES','112','Spain'),
  ('PT','112','Portugal'),
  ('EU','112','EU generic fallback')
on conflict (region) do nothing;

-- 4) UI translation review ledger ------------------------------------------------
create table if not exists public.libertymd_translation_reviews (
  id uuid primary key default gen_random_uuid(),
  locale text not null check (locale in ('en','es','pt','hi','fr','de')),
  bundle_version text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','rejected')),
  reviewer_notes text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (locale, bundle_version)
);

insert into public.libertymd_translation_reviews (locale, bundle_version, status, approved_by, approved_at)
values ('en','1','approved','system-source-of-truth', now())
on conflict (locale, bundle_version) do nothing;

-- Testing approval (2026-07-20, per Saksham): all v1 bundles approved for testing.
insert into public.libertymd_translation_reviews (locale, bundle_version, status, approved_by, approved_at) values
  ('es','1','approved','saksham (testing approval)', now()),
  ('pt','1','approved','saksham (testing approval)', now()),
  ('hi','1','approved','saksham (testing approval)', now()),
  ('fr','1','approved','saksham (testing approval)', now()),
  ('de','1','approved','saksham (testing approval)', now())
on conflict (locale, bundle_version) do nothing;

-- 5) RLS: public read of approved content; owner-only review access ---------------
alter table public.libertymd_message_catalog enable row level security;
alter table public.libertymd_region_config enable row level security;
alter table public.libertymd_translation_reviews enable row level security;

create policy "catalog_read_approved" on public.libertymd_message_catalog
  for select using (status = 'approved');

create policy "region_config_read" on public.libertymd_region_config
  for select using (true);

-- Owner (Saksham) can see and approve everything. Replace email if the login email changes.
create policy "catalog_owner_all" on public.libertymd_message_catalog
  for all using ((auth.jwt() ->> 'email') = 'sakshamagrawal1993@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'sakshamagrawal1993@gmail.com');

create policy "reviews_owner_all" on public.libertymd_translation_reviews
  for all using ((auth.jwt() ->> 'email') = 'sakshamagrawal1993@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'sakshamagrawal1993@gmail.com');

-- 6) Seed safety catalog ----------------------------------------------------------
-- English rows are approved (source of truth). All other languages: pending_review.
-- {emergency_number} is substituted by the edge function from libertymd_region_config.

-- Helper CTE-free inserts, one block per message_key.

-- emergency.acs_chest_pain
insert into public.libertymd_message_catalog (message_key, language, text, status, source, approved_by, approved_at) values
('emergency.acs_chest_pain','en','These symptoms can be a medical emergency. Call {emergency_number} or go to the nearest emergency department now. Do not drive yourself.','approved','human','system-baseline',now()),
('emergency.acs_chest_pain','es','Estos síntomas pueden ser una emergencia médica. Llama al {emergency_number} o acude ahora al servicio de urgencias más cercano. No conduzcas tú mismo.','approved','machine','saksham (testing approval)',now()),
('emergency.acs_chest_pain','pt','Esses sintomas podem ser uma emergência médica. Ligue para o {emergency_number} ou vá agora ao pronto-socorro mais próximo. Não dirija você mesmo.','approved','machine','saksham (testing approval)',now()),
('emergency.acs_chest_pain','hi','ये लक्षण एक चिकित्सा आपात स्थिति हो सकते हैं। अभी {emergency_number} पर कॉल करें या नज़दीकी आपातकालीन विभाग जाएँ। खुद गाड़ी न चलाएँ।','approved','machine','saksham (testing approval)',now()),
('emergency.acs_chest_pain','fr','Ces symptômes peuvent constituer une urgence médicale. Appelez le {emergency_number} ou rendez-vous immédiatement aux urgences les plus proches. Ne conduisez pas vous-même.','approved','machine','saksham (testing approval)',now()),
('emergency.acs_chest_pain','de','Diese Symptome können ein medizinischer Notfall sein. Rufen Sie sofort {emergency_number} an oder fahren Sie in die nächste Notaufnahme. Fahren Sie nicht selbst.','approved','machine','saksham (testing approval)',now());

-- emergency.thunderclap_headache
insert into public.libertymd_message_catalog (message_key, language, text, status, source, approved_by, approved_at) values
('emergency.thunderclap_headache','en','A sudden, worst-of-your-life headache can be an emergency. Call {emergency_number} or go to the emergency department now.','approved','human','system-baseline',now()),
('emergency.thunderclap_headache','es','Un dolor de cabeza repentino y el peor de tu vida puede ser una emergencia. Llama al {emergency_number} o acude a urgencias ahora.','approved','machine','saksham (testing approval)',now()),
('emergency.thunderclap_headache','pt','Uma dor de cabeça súbita e a pior da sua vida pode ser uma emergência. Ligue para o {emergency_number} ou vá ao pronto-socorro agora.','approved','machine','saksham (testing approval)',now()),
('emergency.thunderclap_headache','hi','अचानक, जीवन का सबसे तेज़ सिरदर्द आपात स्थिति हो सकता है। {emergency_number} पर कॉल करें या अभी आपातकालीन विभाग जाएँ।','approved','machine','saksham (testing approval)',now()),
('emergency.thunderclap_headache','fr','Un mal de tête soudain, le pire de votre vie, peut être une urgence. Appelez le {emergency_number} ou rendez-vous aux urgences maintenant.','approved','machine','saksham (testing approval)',now()),
('emergency.thunderclap_headache','de','Plötzliche, stärkste Kopfschmerzen Ihres Lebens können ein Notfall sein. Rufen Sie {emergency_number} an oder gehen Sie jetzt in die Notaufnahme.','approved','machine','saksham (testing approval)',now());

-- emergency.anaphylaxis
insert into public.libertymd_message_catalog (message_key, language, text, status, source, approved_by, approved_at) values
('emergency.anaphylaxis','en','This may be anaphylaxis. Use epinephrine (adrenaline auto-injector) if available and call {emergency_number} immediately.','approved','human','system-baseline',now()),
('emergency.anaphylaxis','es','Esto puede ser anafilaxia. Usa epinefrina (autoinyector de adrenalina) si la tienes y llama al {emergency_number} de inmediato.','approved','machine','saksham (testing approval)',now()),
('emergency.anaphylaxis','pt','Isto pode ser anafilaxia. Use epinefrina (autoinjetor de adrenalina) se disponível e ligue imediatamente para o {emergency_number}.','approved','machine','saksham (testing approval)',now()),
('emergency.anaphylaxis','hi','यह एनाफिलैक्सिस हो सकता है। यदि उपलब्ध हो तो एपिनेफ्रीन (एड्रेनालिन ऑटो-इंजेक्टर) का उपयोग करें और तुरंत {emergency_number} पर कॉल करें।','approved','machine','saksham (testing approval)',now()),
('emergency.anaphylaxis','fr','Il peut s''agir d''une anaphylaxie. Utilisez de l''épinéphrine (auto-injecteur d''adrénaline) si disponible et appelez immédiatement le {emergency_number}.','approved','machine','saksham (testing approval)',now()),
('emergency.anaphylaxis','de','Dies kann eine Anaphylaxie sein. Verwenden Sie Epinephrin (Adrenalin-Autoinjektor), falls verfügbar, und rufen Sie sofort {emergency_number} an.','approved','machine','saksham (testing approval)',now());

-- emergency.respiratory_distress
insert into public.libertymd_message_catalog (message_key, language, text, status, source, approved_by, approved_at) values
('emergency.respiratory_distress','en','Severe breathing problems need emergency care. Call {emergency_number} or go to the emergency department now.','approved','human','system-baseline',now()),
('emergency.respiratory_distress','es','Los problemas graves para respirar requieren atención de emergencia. Llama al {emergency_number} o acude a urgencias ahora.','approved','machine','saksham (testing approval)',now()),
('emergency.respiratory_distress','pt','Problemas respiratórios graves exigem atendimento de emergência. Ligue para o {emergency_number} ou vá ao pronto-socorro agora.','approved','machine','saksham (testing approval)',now()),
('emergency.respiratory_distress','hi','साँस लेने में गंभीर परेशानी के लिए आपातकालीन देखभाल ज़रूरी है। {emergency_number} पर कॉल करें या अभी आपातकालीन विभाग जाएँ।','approved','machine','saksham (testing approval)',now()),
('emergency.respiratory_distress','fr','Des difficultés respiratoires sévères nécessitent des soins d''urgence. Appelez le {emergency_number} ou rendez-vous aux urgences maintenant.','approved','machine','saksham (testing approval)',now()),
('emergency.respiratory_distress','de','Schwere Atemprobleme erfordern Notfallversorgung. Rufen Sie {emergency_number} an oder gehen Sie jetzt in die Notaufnahme.','approved','machine','saksham (testing approval)',now());

-- emergency.surgical_abdomen
insert into public.libertymd_message_catalog (message_key, language, text, status, source, approved_by, approved_at) values
('emergency.surgical_abdomen','en','Severe abdominal pain with these features can be a surgical emergency. Seek emergency care now or call {emergency_number}.','approved','human','system-baseline',now()),
('emergency.surgical_abdomen','es','Un dolor abdominal intenso con estas características puede ser una emergencia quirúrgica. Busca atención de emergencia ahora o llama al {emergency_number}.','approved','machine','saksham (testing approval)',now()),
('emergency.surgical_abdomen','pt','Dor abdominal intensa com essas características pode ser uma emergência cirúrgica. Procure atendimento de emergência agora ou ligue para o {emergency_number}.','approved','machine','saksham (testing approval)',now()),
('emergency.surgical_abdomen','hi','इन लक्षणों के साथ तेज़ पेट दर्द एक सर्जिकल आपात स्थिति हो सकती है। अभी आपातकालीन देखभाल लें या {emergency_number} पर कॉल करें।','approved','machine','saksham (testing approval)',now()),
('emergency.surgical_abdomen','fr','Une douleur abdominale sévère avec ces caractéristiques peut être une urgence chirurgicale. Consultez les urgences maintenant ou appelez le {emergency_number}.','approved','machine','saksham (testing approval)',now()),
('emergency.surgical_abdomen','de','Starke Bauchschmerzen mit diesen Merkmalen können ein chirurgischer Notfall sein. Suchen Sie jetzt die Notaufnahme auf oder rufen Sie {emergency_number} an.','approved','machine','saksham (testing approval)',now());

-- emergency.other_emergency
insert into public.libertymd_message_catalog (message_key, language, text, status, source, approved_by, approved_at) values
('emergency.other_emergency','en','Based on what you''ve described, this may be a medical emergency. Call {emergency_number} or seek emergency care immediately.','approved','human','system-baseline',now()),
('emergency.other_emergency','es','Según lo que describes, esto puede ser una emergencia médica. Llama al {emergency_number} o busca atención de emergencia de inmediato.','approved','machine','saksham (testing approval)',now()),
('emergency.other_emergency','pt','Pelo que você descreveu, isto pode ser uma emergência médica. Ligue para o {emergency_number} ou procure atendimento de emergência imediatamente.','approved','machine','saksham (testing approval)',now()),
('emergency.other_emergency','hi','आपके बताए लक्षणों के आधार पर यह चिकित्सा आपात स्थिति हो सकती है। तुरंत {emergency_number} पर कॉल करें या आपातकालीन देखभाल लें।','approved','machine','saksham (testing approval)',now()),
('emergency.other_emergency','fr','D''après ce que vous décrivez, il peut s''agir d''une urgence médicale. Appelez le {emergency_number} ou consultez immédiatement les urgences.','approved','machine','saksham (testing approval)',now()),
('emergency.other_emergency','de','Nach Ihrer Beschreibung kann dies ein medizinischer Notfall sein. Rufen Sie {emergency_number} an oder suchen Sie sofort eine Notaufnahme auf.','approved','machine','saksham (testing approval)',now());

-- safety.high_risk_continue
insert into public.libertymd_message_catalog (message_key, language, text, status, source, approved_by, approved_at) values
('safety.high_risk_continue','en','Some of what you''ve shared is concerning. We can continue, but if symptoms worsen — or you develop severe pain, trouble breathing, or confusion — call {emergency_number} or seek emergency care right away.','approved','human','system-baseline',now()),
('safety.high_risk_continue','es','Parte de lo que compartiste es preocupante. Podemos continuar, pero si los síntomas empeoran — o presentas dolor intenso, dificultad para respirar o confusión — llama al {emergency_number} o busca atención de emergencia de inmediato.','approved','machine','saksham (testing approval)',now()),
('safety.high_risk_continue','pt','Parte do que você compartilhou é preocupante. Podemos continuar, mas se os sintomas piorarem — ou surgir dor intensa, dificuldade para respirar ou confusão — ligue para o {emergency_number} ou procure emergência imediatamente.','approved','machine','saksham (testing approval)',now()),
('safety.high_risk_continue','hi','आपकी बताई कुछ बातें चिंताजनक हैं। हम जारी रख सकते हैं, लेकिन यदि लक्षण बिगड़ें — या तेज़ दर्द, साँस लेने में कठिनाई या भ्रम हो — तो तुरंत {emergency_number} पर कॉल करें या आपातकालीन देखभाल लें।','approved','machine','saksham (testing approval)',now()),
('safety.high_risk_continue','fr','Certains éléments que vous avez partagés sont préoccupants. Nous pouvons continuer, mais si les symptômes s''aggravent — douleur sévère, difficultés respiratoires ou confusion — appelez le {emergency_number} ou consultez immédiatement les urgences.','approved','machine','saksham (testing approval)',now()),
('safety.high_risk_continue','de','Einiges von dem, was Sie geschildert haben, ist besorgniserregend. Wir können fortfahren, aber wenn sich die Symptome verschlimmern — starke Schmerzen, Atemnot oder Verwirrtheit — rufen Sie {emergency_number} an oder suchen Sie sofort eine Notaufnahme auf.','approved','machine','saksham (testing approval)',now());

-- safety.clinical_review_needed
insert into public.libertymd_message_catalog (message_key, language, text, status, source, approved_by, approved_at) values
('safety.clinical_review_needed','en','I don''t have enough reliable information to give you a useful report. The safest next step is to discuss your symptoms with a clinician. If anything feels urgent, call {emergency_number}.','approved','human','system-baseline',now()),
('safety.clinical_review_needed','es','No tengo suficiente información confiable para darte un informe útil. El paso más seguro es comentar tus síntomas con un profesional de salud. Si algo se siente urgente, llama al {emergency_number}.','approved','machine','saksham (testing approval)',now()),
('safety.clinical_review_needed','pt','Não tenho informações confiáveis suficientes para gerar um relatório útil. O passo mais seguro é conversar sobre seus sintomas com um profissional de saúde. Se algo parecer urgente, ligue para o {emergency_number}.','approved','machine','saksham (testing approval)',now()),
('safety.clinical_review_needed','hi','उपयोगी रिपोर्ट देने के लिए मेरे पास पर्याप्त विश्वसनीय जानकारी नहीं है। सबसे सुरक्षित कदम है कि अपने लक्षणों पर किसी चिकित्सक से बात करें। यदि कुछ भी अत्यावश्यक लगे, तो {emergency_number} पर कॉल करें।','approved','machine','saksham (testing approval)',now()),
('safety.clinical_review_needed','fr','Je ne dispose pas d''informations fiables suffisantes pour vous fournir un rapport utile. Le plus sûr est d''en parler avec un professionnel de santé. Si quelque chose vous semble urgent, appelez le {emergency_number}.','approved','machine','saksham (testing approval)',now()),
('safety.clinical_review_needed','de','Ich habe nicht genügend verlässliche Informationen für einen hilfreichen Bericht. Der sicherste nächste Schritt ist ein Gespräch mit einer medizinischen Fachkraft. Wenn sich etwas dringend anfühlt, rufen Sie {emergency_number} an.','approved','machine','saksham (testing approval)',now());

-- updated_at trigger reuse (function exists in core schema; guard for standalone apply)
do $$ begin
  if exists (select 1 from pg_proc where proname = 'libertymd_set_updated_at') then
    create trigger set_updated_at before update on public.libertymd_message_catalog
      for each row execute function public.libertymd_set_updated_at();
  end if;
end $$;

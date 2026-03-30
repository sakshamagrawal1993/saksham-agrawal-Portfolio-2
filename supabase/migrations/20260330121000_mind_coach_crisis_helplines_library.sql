-- Country-level crisis helpline library for Mind Coach crisis support UI.
CREATE TABLE IF NOT EXISTS public.mind_coach_crisis_helplines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  primary_service_name TEXT NOT NULL,
  primary_contact TEXT NOT NULL,
  primary_contact_type TEXT NOT NULL DEFAULT 'phone',
  emergency_number TEXT NULL,
  chat_url TEXT NULL,
  notes TEXT NULL,
  fallback_directory_url TEXT NOT NULL DEFAULT 'https://findahelpline.com/',
  guidelines JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, primary_service_name)
);

CREATE INDEX IF NOT EXISTS idx_mc_crisis_helplines_country
  ON public.mind_coach_crisis_helplines (country_code, active);

ALTER TABLE public.mind_coach_crisis_helplines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_mc_crisis_helplines" ON public.mind_coach_crisis_helplines;
CREATE POLICY "auth_select_mc_crisis_helplines"
  ON public.mind_coach_crisis_helplines
  FOR SELECT
  TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS "service_role_manage_mc_crisis_helplines" ON public.mind_coach_crisis_helplines;
CREATE POLICY "service_role_manage_mc_crisis_helplines"
  ON public.mind_coach_crisis_helplines
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.mind_coach_crisis_helplines (
  country_code,
  country_name,
  primary_service_name,
  primary_contact,
  primary_contact_type,
  emergency_number,
  chat_url,
  notes,
  fallback_directory_url,
  guidelines,
  sources
) VALUES
  (
    'US',
    'United States',
    '988 Suicide & Crisis Lifeline',
    '988',
    'phone_text',
    '911',
    'https://988lifeline.org/chat/',
    'Call or text 988 anytime for immediate crisis support.',
    'https://findahelpline.com/',
    '["If immediate physical danger exists, call 911 first.","Use chat when voice calling is difficult.","Share location and immediate safety concerns clearly."]'::jsonb,
    '["https://findahelpline.com/","https://www.helpguide.org/find-help","https://en.wikipedia.org/wiki/List_of_suicide_crisis_lines"]'::jsonb
  ),
  (
    'CA',
    'Canada',
    '988 Suicide Crisis Helpline',
    '988',
    'phone_text',
    '911',
    NULL,
    'National 24/7 support in English and French via call or text.',
    'https://findahelpline.com/',
    '["If immediate danger exists, call 911.","Use 988 for emotional crisis support and safety planning.","If language support is needed, ask for preferred language early."]'::jsonb,
    '["https://findahelpline.com/","https://www.helpguide.org/find-help","https://en.wikipedia.org/wiki/List_of_suicide_crisis_lines"]'::jsonb
  ),
  (
    'IN',
    'India',
    'iCall',
    '9152987821',
    'phone',
    '112',
    'https://icallhelpline.org/',
    'Confidential psychosocial helpline support.',
    'https://findahelpline.com/',
    '["If immediate danger exists, call 112.","Use iCall for confidential emotional support.","If call lines are busy, use chat/web channels and local emergency support."]'::jsonb,
    '["https://findahelpline.com/","https://www.helpguide.org/find-help","https://en.wikipedia.org/wiki/List_of_suicide_crisis_lines"]'::jsonb
  ),
  (
    'GB',
    'United Kingdom',
    'Samaritans',
    '116 123',
    'phone',
    '999',
    'https://www.samaritans.org/',
    'Free, confidential listening support.',
    'https://findahelpline.com/',
    '["If immediate danger exists, call 999.","Use 116 123 for confidential emotional support.","If texting is easier, use SHOUT where available."]'::jsonb,
    '["https://findahelpline.com/","https://www.helpguide.org/find-help","https://en.wikipedia.org/wiki/List_of_suicide_crisis_lines"]'::jsonb
  ),
  (
    'AU',
    'Australia',
    'Lifeline Australia',
    '13 11 14',
    'phone',
    '000',
    'https://www.lifeline.org.au/crisis-chat/',
    '24/7 crisis support and suicide prevention line.',
    'https://findahelpline.com/',
    '["If immediate danger exists, call 000.","Use Lifeline for crisis counseling and safety planning.","Use crisis chat if phone access is limited."]'::jsonb,
    '["https://findahelpline.com/","https://www.helpguide.org/find-help","https://en.wikipedia.org/wiki/List_of_suicide_crisis_lines"]'::jsonb
  ),
  (
    'NZ',
    'New Zealand',
    'Need to Talk? 1737',
    '1737',
    'phone_text',
    '111',
    'https://1737.org.nz/',
    'Text or call 1737 for support from a trained counselor.',
    'https://findahelpline.com/',
    '["If immediate danger exists, call 111.","Use 1737 for mental health and emotional support.","Share immediate safety risk and location if urgent."]'::jsonb,
    '["https://findahelpline.com/","https://www.helpguide.org/find-help","https://en.wikipedia.org/wiki/List_of_suicide_crisis_lines"]'::jsonb
  ),
  (
    'SG',
    'Singapore',
    'Samaritans of Singapore',
    '1767',
    'phone',
    '999',
    'https://www.sos.org.sg/',
    '24/7 crisis support and suicide prevention line.',
    'https://findahelpline.com/',
    '["If immediate danger exists, call 999.","Use 1767 for crisis intervention support.","If preferred, use mindline 1771 support channels."]'::jsonb,
    '["https://findahelpline.com/","https://www.helpguide.org/find-help","https://en.wikipedia.org/wiki/List_of_suicide_crisis_lines"]'::jsonb
  ),
  (
    'IE',
    'Ireland',
    'Samaritans Ireland',
    '116 123',
    'phone',
    '112/999',
    'https://www.samaritans.org/ireland/samaritans-ireland/',
    '24/7 confidential support.',
    'https://findahelpline.com/',
    '["If immediate danger exists, call 112 or 999.","Use 116 123 for confidential emotional support.","Text/online options are available via partner services."]'::jsonb,
    '["https://findahelpline.com/","https://www.helpguide.org/find-help","https://en.wikipedia.org/wiki/List_of_suicide_crisis_lines"]'::jsonb
  ),
  (
    'INTL',
    'Global',
    'Find A Helpline Directory',
    'Use online directory',
    'directory',
    NULL,
    'https://findahelpline.com/',
    'Verified directory of local helplines by country and topic.',
    'https://findahelpline.com/',
    '["Search by country and topic for the fastest local option.","If immediate physical risk exists, call local emergency services now.","If one service is unavailable, try another verified line in the directory."]'::jsonb,
    '["https://findahelpline.com/","https://www.helpguide.org/find-help","https://en.wikipedia.org/wiki/List_of_suicide_crisis_lines"]'::jsonb
  )
ON CONFLICT (country_code, primary_service_name) DO UPDATE
SET
  primary_contact = EXCLUDED.primary_contact,
  primary_contact_type = EXCLUDED.primary_contact_type,
  emergency_number = EXCLUDED.emergency_number,
  chat_url = EXCLUDED.chat_url,
  notes = EXCLUDED.notes,
  fallback_directory_url = EXCLUDED.fallback_directory_url,
  guidelines = EXCLUDED.guidelines,
  sources = EXCLUDED.sources,
  active = true,
  updated_at = now();

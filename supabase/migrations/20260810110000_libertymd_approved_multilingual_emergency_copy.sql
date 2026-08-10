-- Serve emergency copy in every clinically supported language whose repository
-- i18n bundle is approved. Spanish regional chrome variants normalize to `es`.

alter table public.libertymd_message_catalog
  drop constraint if exists libertymd_message_catalog_language_check;

alter table public.libertymd_message_catalog
  add constraint libertymd_message_catalog_language_check
  check (language in ('en', 'es', 'hi', 'hi-Latn', 'fr', 'de', 'pt'));

alter table public.libertymd_translation_reviews
  drop constraint if exists libertymd_translation_reviews_locale_check;

alter table public.libertymd_translation_reviews
  add constraint libertymd_translation_reviews_locale_check
  check (locale in ('en', 'es', 'hi', 'hi-Latn', 'fr', 'de', 'pt'));

insert into public.libertymd_translation_reviews
  (locale, bundle_version, status, reviewer_notes, approved_by, approved_at)
values
  ('hi', 'i18n-v1', 'approved', 'Approved to match the repository i18n bundle status for production testing.', 'saksham-i18n-approval', now()),
  ('hi-Latn', 'i18n-v1', 'approved', 'Approved to match the repository i18n bundle status for production testing.', 'saksham-i18n-approval', now()),
  ('fr', 'i18n-v1', 'approved', 'Approved to match the repository i18n bundle status for production testing.', 'saksham-i18n-approval', now()),
  ('de', 'i18n-v1', 'approved', 'Approved to match the repository i18n bundle status for production testing.', 'saksham-i18n-approval', now()),
  ('pt', 'i18n-v1', 'approved', 'Approved to match the repository i18n bundle status for production testing.', 'saksham-i18n-approval', now())
on conflict (locale, bundle_version) do update
set status = excluded.status,
    reviewer_notes = excluded.reviewer_notes,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at;

with approved_copy(language, source, messages) as (
  values
  ('de', 'machine', jsonb_build_object(
    'emergency.heading', 'Aus Sicherheitsgründen mussten wir diese Konsultation beenden.',
    'emergency.standing.acs_chest_pain', 'Wenn Sie glauben, dass es sich um einen medizinischen Notfall handelt, rufen Sie sofort {emergency_number} oder den örtlichen Rettungsdienst an. Fahren Sie nicht selbst.',
    'emergency.standing.stroke_fast', 'Wenn Sie glauben, dass es sich um einen medizinischen Notfall handelt, rufen Sie sofort {emergency_number} oder den örtlichen Rettungsdienst an. Merken Sie sich, wann die Symptome begonnen haben, und fahren Sie nicht selbst.',
    'emergency.standing.thunderclap_headache', 'Wenn Sie glauben, dass es sich um einen medizinischen Notfall handelt, rufen Sie sofort {emergency_number} oder den örtlichen Rettungsdienst an.',
    'emergency.standing.anaphylaxis', 'Wenn Sie glauben, dass es sich um einen medizinischen Notfall handelt, rufen Sie sofort {emergency_number} oder den örtlichen Rettungsdienst an. Verwenden Sie Adrenalin, falls verfügbar.',
    'emergency.standing.respiratory_distress', 'Wenn Sie glauben, dass es sich um einen medizinischen Notfall handelt, rufen Sie sofort {emergency_number} oder den örtlichen Rettungsdienst an.',
    'emergency.standing.surgical_abdomen', 'Wenn Sie glauben, dass es sich um einen medizinischen Notfall handelt, rufen Sie sofort {emergency_number} oder den örtlichen Rettungsdienst an.',
    'emergency.standing.suicidal_ideation', 'Wenn Sie sich in einer seelischen Krise befinden, rufen Sie sofort {crisis_number} oder einen örtlichen Krisendienst an.',
    'emergency.standing.generic_medical', 'Wenn Sie glauben, dass es sich um einen medizinischen Notfall handelt, rufen Sie sofort {emergency_number} oder den örtlichen Rettungsdienst an.',
    'emergency.detail.acs_chest_pain', 'Diese Symptome können auf einen akuten Herznotfall hindeuten. Rufen Sie jetzt {emergency_number} an oder gehen Sie sofort in die Notaufnahme. Fahren Sie nicht selbst.',
    'emergency.detail.stroke_fast', 'Diese Symptome können auf einen Schlaganfall hindeuten. Rufen Sie jetzt {emergency_number} an. Merken Sie sich, wann die Symptome begonnen haben, und fahren Sie nicht selbst.',
    'emergency.detail.thunderclap_headache', 'Ein plötzlich einsetzender, extrem starker Kopfschmerz kann ein neurologischer Notfall sein. Rufen Sie jetzt {emergency_number} an oder gehen Sie sofort in die Notaufnahme.',
    'emergency.detail.anaphylaxis', 'Dies kann eine Anaphylaxie sein. Verwenden Sie Adrenalin, falls verfügbar, und rufen Sie sofort {emergency_number} an.',
    'emergency.detail.respiratory_distress', 'Schwere Atemprobleme benötigen sofortige Notfallversorgung. Rufen Sie jetzt {emergency_number} an oder gehen Sie sofort in die Notaufnahme.',
    'emergency.detail.surgical_abdomen', 'Starke Bauchschmerzen mit diesen Begleitsymptomen können ein chirurgischer Notfall sein. Gehen Sie sofort in die Notaufnahme.',
    'emergency.detail.suicidal_ideation', 'Rufen Sie jetzt {crisis_number} an oder senden Sie eine Nachricht, um einen Krisendienst zu erreichen. Bleiben Sie bei einer vertrauten Person, bis Sie Hilfe erhalten.',
    'emergency.detail.generic_medical', 'Diese Symptome können auf einen medizinischen Notfall hindeuten. Rufen Sie jetzt {emergency_number} an oder gehen Sie sofort in die nächste Notaufnahme.'
  )),
  ('fr', 'machine', jsonb_build_object(
    'emergency.heading', 'Pour des raisons de sécurité, nous avons dû mettre fin à cette consultation.',
    'emergency.standing.acs_chest_pain', 'Si vous pensez qu’il s’agit d’une urgence médicale, appelez immédiatement le {emergency_number} ou les services d’urgence locaux. Ne conduisez pas vous-même.',
    'emergency.standing.stroke_fast', 'Si vous pensez qu’il s’agit d’une urgence médicale, appelez immédiatement le {emergency_number} ou les services d’urgence locaux. Notez l’heure de début des symptômes et ne conduisez pas vous-même.',
    'emergency.standing.thunderclap_headache', 'Si vous pensez qu’il s’agit d’une urgence médicale, appelez immédiatement le {emergency_number} ou les services d’urgence locaux.',
    'emergency.standing.anaphylaxis', 'Si vous pensez qu’il s’agit d’une urgence médicale, appelez immédiatement le {emergency_number} ou les services d’urgence locaux. Utilisez de l’épinéphrine si vous en avez.',
    'emergency.standing.respiratory_distress', 'Si vous pensez qu’il s’agit d’une urgence médicale, appelez immédiatement le {emergency_number} ou les services d’urgence locaux.',
    'emergency.standing.surgical_abdomen', 'Si vous pensez qu’il s’agit d’une urgence médicale, appelez immédiatement le {emergency_number} ou les services d’urgence locaux.',
    'emergency.standing.suicidal_ideation', 'Si vous êtes en détresse émotionnelle, appelez immédiatement le {crisis_number} ou les services de crise locaux.',
    'emergency.standing.generic_medical', 'Si vous pensez qu’il s’agit d’une urgence médicale, appelez immédiatement le {emergency_number} ou les services d’urgence locaux.',
    'emergency.detail.acs_chest_pain', 'Ces symptômes peuvent indiquer une urgence cardiaque. Appelez le {emergency_number} ou rendez-vous immédiatement aux urgences. Ne conduisez pas vous-même.',
    'emergency.detail.stroke_fast', 'Ces symptômes peuvent indiquer un accident vasculaire cérébral. Appelez le {emergency_number} maintenant. Notez l’heure de début des symptômes et ne conduisez pas vous-même.',
    'emergency.detail.thunderclap_headache', 'Un mal de tête soudain et extrêmement intense peut être une urgence neurologique. Appelez le {emergency_number} ou rendez-vous immédiatement aux urgences.',
    'emergency.detail.anaphylaxis', 'Il peut s’agir d’une anaphylaxie. Utilisez de l’épinéphrine si vous en avez et appelez immédiatement le {emergency_number}.',
    'emergency.detail.respiratory_distress', 'De graves difficultés respiratoires nécessitent des soins d’urgence. Appelez le {emergency_number} ou rendez-vous immédiatement aux urgences.',
    'emergency.detail.surgical_abdomen', 'Une douleur abdominale intense accompagnée de ces signes peut être une urgence chirurgicale. Rendez-vous immédiatement aux urgences.',
    'emergency.detail.suicidal_ideation', 'Appelez ou envoyez un message au {crisis_number} maintenant pour joindre un service de crise. Restez avec une personne de confiance pendant que vous demandez de l’aide.',
    'emergency.detail.generic_medical', 'Ces symptômes peuvent indiquer une urgence médicale. Appelez le {emergency_number} ou rendez-vous immédiatement au service d’urgence le plus proche.'
  )),
  ('pt', 'machine', jsonb_build_object(
    'emergency.heading', 'Por motivos de segurança, tivemos de encerrar esta consulta.',
    'emergency.standing.acs_chest_pain', 'Se você acredita que se trata de uma emergência médica, ligue imediatamente para {emergency_number} ou para o serviço de emergência local. Não dirija.',
    'emergency.standing.stroke_fast', 'Se você acredita que se trata de uma emergência médica, ligue imediatamente para {emergency_number} ou para o serviço de emergência local. Anote quando os sintomas começaram e não dirija.',
    'emergency.standing.thunderclap_headache', 'Se você acredita que se trata de uma emergência médica, ligue imediatamente para {emergency_number} ou para o serviço de emergência local.',
    'emergency.standing.anaphylaxis', 'Se você acredita que se trata de uma emergência médica, ligue imediatamente para {emergency_number} ou para o serviço de emergência local. Use epinefrina, se disponível.',
    'emergency.standing.respiratory_distress', 'Se você acredita que se trata de uma emergência médica, ligue imediatamente para {emergency_number} ou para o serviço de emergência local.',
    'emergency.standing.surgical_abdomen', 'Se você acredita que se trata de uma emergência médica, ligue imediatamente para {emergency_number} ou para o serviço de emergência local.',
    'emergency.standing.suicidal_ideation', 'Se você estiver em sofrimento emocional, ligue imediatamente para {crisis_number} ou para o serviço local de apoio em crise.',
    'emergency.standing.generic_medical', 'Se você acredita que se trata de uma emergência médica, ligue imediatamente para {emergency_number} ou para o serviço de emergência local.',
    'emergency.detail.acs_chest_pain', 'Esses sintomas podem indicar uma emergência cardíaca. Ligue para {emergency_number} ou vá imediatamente ao pronto-socorro. Não dirija.',
    'emergency.detail.stroke_fast', 'Esses sintomas podem indicar um acidente vascular cerebral. Ligue para {emergency_number} agora. Anote quando os sintomas começaram e não dirija.',
    'emergency.detail.thunderclap_headache', 'Uma dor de cabeça súbita e extremamente intensa pode ser uma emergência neurológica. Ligue para {emergency_number} ou vá imediatamente ao pronto-socorro.',
    'emergency.detail.anaphylaxis', 'Isso pode ser anafilaxia. Use epinefrina, se disponível, e ligue imediatamente para {emergency_number}.',
    'emergency.detail.respiratory_distress', 'Problemas respiratórios graves precisam de atendimento de emergência. Ligue para {emergency_number} ou vá imediatamente ao pronto-socorro.',
    'emergency.detail.surgical_abdomen', 'Dor abdominal intensa com esses sinais pode ser uma emergência cirúrgica. Vá imediatamente ao pronto-socorro.',
    'emergency.detail.suicidal_ideation', 'Ligue ou envie uma mensagem para {crisis_number} agora para falar com um serviço de apoio em crise. Fique com uma pessoa de confiança enquanto busca ajuda.',
    'emergency.detail.generic_medical', 'Esses sintomas podem indicar uma emergência médica. Ligue para {emergency_number} ou vá imediatamente ao pronto-socorro mais próximo.'
  )),
  ('hi', 'machine', jsonb_build_object(
    'emergency.heading', 'सुरक्षा कारणों से हमें यह परामर्श समाप्त करना पड़ा है।',
    'emergency.standing.acs_chest_pain', 'यदि आपको लगता है कि यह चिकित्सकीय आपातस्थिति है, तो तुरंत {emergency_number} या अपनी स्थानीय आपातकालीन सेवा पर कॉल करें। खुद वाहन न चलाएँ।',
    'emergency.standing.stroke_fast', 'यदि आपको लगता है कि यह चिकित्सकीय आपातस्थिति है, तो तुरंत {emergency_number} या अपनी स्थानीय आपातकालीन सेवा पर कॉल करें। लक्षण कब शुरू हुए, यह समय नोट करें और खुद वाहन न चलाएँ।',
    'emergency.standing.thunderclap_headache', 'यदि आपको लगता है कि यह चिकित्सकीय आपातस्थिति है, तो तुरंत {emergency_number} या अपनी स्थानीय आपातकालीन सेवा पर कॉल करें।',
    'emergency.standing.anaphylaxis', 'यदि आपको लगता है कि यह चिकित्सकीय आपातस्थिति है, तो तुरंत {emergency_number} या अपनी स्थानीय आपातकालीन सेवा पर कॉल करें। यदि एपिनेफ्रिन उपलब्ध है, तो उसका उपयोग करें।',
    'emergency.standing.respiratory_distress', 'यदि आपको लगता है कि यह चिकित्सकीय आपातस्थिति है, तो तुरंत {emergency_number} या अपनी स्थानीय आपातकालीन सेवा पर कॉल करें।',
    'emergency.standing.surgical_abdomen', 'यदि आपको लगता है कि यह चिकित्सकीय आपातस्थिति है, तो तुरंत {emergency_number} या अपनी स्थानीय आपातकालीन सेवा पर कॉल करें।',
    'emergency.standing.suicidal_ideation', 'यदि आप भावनात्मक संकट में हैं, तो तुरंत {crisis_number} या अपनी स्थानीय संकट सहायता सेवा पर कॉल करें।',
    'emergency.standing.generic_medical', 'यदि आपको लगता है कि यह चिकित्सकीय आपातस्थिति है, तो तुरंत {emergency_number} या अपनी स्थानीय आपातकालीन सेवा पर कॉल करें।',
    'emergency.detail.acs_chest_pain', 'ये लक्षण हृदय से जुड़ी आपातस्थिति का संकेत हो सकते हैं। अभी {emergency_number} पर कॉल करें या आपातकालीन विभाग जाएँ। खुद वाहन न चलाएँ।',
    'emergency.detail.stroke_fast', 'ये लक्षण स्ट्रोक के हो सकते हैं। अभी {emergency_number} पर कॉल करें। लक्षण कब शुरू हुए, यह समय नोट करें और खुद वाहन न चलाएँ।',
    'emergency.detail.thunderclap_headache', 'अचानक शुरू हुआ अत्यंत गंभीर सिरदर्द एक न्यूरोलॉजिकल आपातस्थिति हो सकता है। अभी {emergency_number} पर कॉल करें या आपातकालीन विभाग जाएँ।',
    'emergency.detail.anaphylaxis', 'यह एनाफिलैक्सिस हो सकता है। यदि एपिनेफ्रिन उपलब्ध है, तो उसका उपयोग करें और तुरंत {emergency_number} पर कॉल करें।',
    'emergency.detail.respiratory_distress', 'साँस लेने में गंभीर परेशानी के लिए आपातकालीन देखभाल की आवश्यकता होती है। अभी {emergency_number} पर कॉल करें या आपातकालीन विभाग जाएँ।',
    'emergency.detail.surgical_abdomen', 'इन लक्षणों के साथ पेट में तेज दर्द एक शल्य-चिकित्सकीय आपातस्थिति हो सकता है। अभी आपातकालीन विभाग जाएँ।',
    'emergency.detail.suicidal_ideation', 'संकट सहायता सेवा से जुड़ने के लिए अभी {crisis_number} पर कॉल या संदेश करें। सहायता मिलने तक किसी भरोसेमंद व्यक्ति के साथ रहें।',
    'emergency.detail.generic_medical', 'ये लक्षण किसी चिकित्सकीय आपातस्थिति का संकेत हो सकते हैं। अभी {emergency_number} पर कॉल करें या निकटतम आपातकालीन विभाग जाएँ।'
  )),
  ('hi-Latn', 'human', jsonb_build_object(
    'emergency.heading', 'Safety reasons ki wajah se humein yeh consultation khatam karni padi hai.',
    'emergency.standing.acs_chest_pain', 'Agar aapko lagta hai ki yeh medical emergency hai, toh turant {emergency_number} ya apni local emergency service ko call karein. Khud drive na karein.',
    'emergency.standing.stroke_fast', 'Agar aapko lagta hai ki yeh medical emergency hai, toh turant {emergency_number} ya apni local emergency service ko call karein. Symptoms kab shuru hue, uska time note karein aur khud drive na karein.',
    'emergency.standing.thunderclap_headache', 'Agar aapko lagta hai ki yeh medical emergency hai, toh turant {emergency_number} ya apni local emergency service ko call karein.',
    'emergency.standing.anaphylaxis', 'Agar aapko lagta hai ki yeh medical emergency hai, toh turant {emergency_number} ya apni local emergency service ko call karein. Agar epinephrine available ho toh use karein.',
    'emergency.standing.respiratory_distress', 'Agar aapko lagta hai ki yeh medical emergency hai, toh turant {emergency_number} ya apni local emergency service ko call karein.',
    'emergency.standing.surgical_abdomen', 'Agar aapko lagta hai ki yeh medical emergency hai, toh turant {emergency_number} ya apni local emergency service ko call karein.',
    'emergency.standing.suicidal_ideation', 'Agar aap emotional crisis mein hain, toh turant {crisis_number} ya apni local crisis service ko call karein.',
    'emergency.standing.generic_medical', 'Agar aapko lagta hai ki yeh medical emergency hai, toh turant {emergency_number} ya apni local emergency service ko call karein.',
    'emergency.detail.acs_chest_pain', 'Yeh symptoms heart se judi emergency ka sign ho sakte hain. Abhi {emergency_number} par call karein ya emergency department jaayein. Khud drive na karein.',
    'emergency.detail.stroke_fast', 'Yeh symptoms stroke ke ho sakte hain. Abhi {emergency_number} par call karein. Symptoms kab shuru hue, uska time note karein aur khud drive na karein.',
    'emergency.detail.thunderclap_headache', 'Achanak shuru hua bahut tez headache neurological emergency ho sakta hai. Abhi {emergency_number} par call karein ya emergency department jaayein.',
    'emergency.detail.anaphylaxis', 'Yeh anaphylaxis ho sakta hai. Agar epinephrine available ho toh use karein aur turant {emergency_number} par call karein.',
    'emergency.detail.respiratory_distress', 'Saans lene mein bahut zyada dikkat ke liye emergency care chahiye. Abhi {emergency_number} par call karein ya emergency department jaayein.',
    'emergency.detail.surgical_abdomen', 'In symptoms ke saath pet mein bahut tez dard surgical emergency ho sakta hai. Abhi emergency department jaayein.',
    'emergency.detail.suicidal_ideation', 'Crisis support se judne ke liye abhi {crisis_number} par call ya message karein. Help milne tak kisi bharosemand insaan ke saath rahen.',
    'emergency.detail.generic_medical', 'Yeh symptoms medical emergency ka sign ho sakte hain. Abhi {emergency_number} par call karein ya sabse nazdeeki emergency department jaayein.'
  ))
)
insert into public.libertymd_message_catalog
  (message_key, language, content, version, status, source, reviewer_notes, approved_by, approved_at)
select
  entry.key,
  approved_copy.language,
  entry.value,
  1,
  'approved',
  approved_copy.source,
  'Approved to match the repository i18n bundle status for production testing.',
  'saksham-i18n-approval',
  now()
from approved_copy
cross join lateral jsonb_each_text(approved_copy.messages) as entry
on conflict (message_key, language, version) do update
set content = excluded.content,
    status = excluded.status,
    source = excluded.source,
    reviewer_notes = excluded.reviewer_notes,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    updated_at = now();

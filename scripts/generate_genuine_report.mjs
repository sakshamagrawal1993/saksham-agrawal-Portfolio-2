import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const url = process.env.VITE_SUPABASE_URL || 'https://ralhkmpbslsdkwnqzqen.supabase.co';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_gMdAKFb5sgN89c7OzhIRdA_nrNGz3pP';

const supabase = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

async function invokeProxy(session, body) {
  const response = await fetch(`${url}/functions/v1/libertymd-care-proxy`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ region: 'US', ...body }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Proxy error ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

(async () => {
  console.log("=== GENERATING GENUINE DOCTOR-READY CLINICAL REPORT ===");
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
  if (authError || !authData.session) {
    throw new Error("Failed to create anonymous session: " + authError?.message);
  }
  const session = authData.session;
  console.log("Created anonymous session:", session.user.id);

  // 1. Bootstrap
  await invokeProxy(session, { action: 'bootstrap' });

  // 2. Start consultation with `message`
  const start = await invokeProxy(session, {
    action: 'start_consultation',
    message: 'I have had a low fever of 100.2 F with fatigue, mild body aches, and dry cough for 3 days.'
  });
  const consultationId = start.consultation_id;
  console.log("Started consultation:", consultationId, "State:", start.state);

  // 3. Save demographics
  const demo = await invokeProxy(session, {
    action: 'save_demographics',
    consultation_id: consultationId,
    age: 34,
    sex_at_birth: 'female',
    message: 'I am 34 female, no underlying health conditions.'
  });
  console.log("Demographics saved. Next question:", demo.next_question?.slice(0, 60));

  // 4. Send turns until report_ready
  const turnAnswers = [
    "It started 3 days ago on Monday morning gradually.",
    "No shortness of breath, no chest pain, no difficulty swallowing, no severe headache.",
    "Warm fluids and rest help, but fatigue remains.",
    "I have no chronic medical conditions and take no regular medications.",
    "I have not traveled recently and no known sick contacts at home.",
    "The fever stays around 99.8 F to 100.4 F and responds to OTC acetaminophen."
  ];

  let currentResult = demo;
  for (let i = 0; i < turnAnswers.length; i++) {
    if (currentResult.report_ready || currentResult.report) {
      console.log(`Report ready on turn ${i}!`);
      break;
    }
    console.log(`Sending turn ${i + 1}: "${turnAnswers[i]}"...`);
    currentResult = await invokeProxy(session, {
      action: 'send_message',
      consultation_id: consultationId,
      client_message_id: crypto.randomUUID(),
      message: turnAnswers[i]
    });
    console.log(`Turn ${i + 1} state:`, currentResult.state || 'active', "Report ready:", Boolean(currentResult.report_ready));
  }

  // Save session details for Puppeteer to load report page directly
  const outPath = path.join(process.cwd(), 'scratch/report_session.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    consultationId,
    session,
    hasReport: Boolean(currentResult.report || currentResult.report_ready)
  }, null, 2));

  console.log(`\nConsultation complete! Data written to ${outPath}`);
})();

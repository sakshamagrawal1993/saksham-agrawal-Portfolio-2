async function testN8n() {
  console.log('--- Testing n8n Webhooks ---');

  // 1. Guardrail Test (Normal)
  console.log('\n1. Testing Guardrail (Normal message)');
  try {
    const res = await fetch('https://n8n.saksham-experiments.com/webhook/ai-care-guardrail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'I have a mild headache.' })
    });
    const data = await res.json();
    console.log('Guardrail Response:', data);
  } catch (e) {
    console.error('Guardrail Error:', e);
  }

  // 2. Guardrail Test (Emergency)
  console.log('\n2. Testing Guardrail (Emergency message)');
  try {
    const res = await fetch('https://n8n.saksham-experiments.com/webhook/ai-care-guardrail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'I have severe chest pain and my left arm is numb.' })
    });
    const data = await res.json();
    console.log('Guardrail Emergency Response:', data);
  } catch (e) {
    console.error('Guardrail Emergency Error:', e);
  }

  // 3. QA Generation Test
  console.log('\n3. Testing QA Generation');
  try {
    const res = await fetch('https://n8n.saksham-experiments.com/webhook/ai-care-qa-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: [{ role: 'user', content: 'I have a headache' }] })
    });
    const data = await res.json();
    console.log('QA Generation Response:', data);
  } catch (e) {
    console.error('QA Generation Error:', e);
  }

  // 4. Diagnosis Workflow Test
  console.log('\n4. Testing Diagnosis Workflow');
  try {
    const res = await fetch('https://n8n.saksham-experiments.com/webhook/ai-care-diagnosis-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: [
        { role: 'user', content: 'I have a headache' },
        { role: 'assistant', content: 'How long has it been?' },
        { role: 'user', content: '2 days' }
      ] })
    });
    
    if (res.ok) {
        const data = await res.json();
        console.log('Diagnosis Response:', data);
    } else {
        console.log('Diagnosis Workflow not fully active/configured to return JSON synchronously, Status:', res.status);
    }
  } catch (e) {
    console.error('Diagnosis Error:', e);
  }
}

testN8n();

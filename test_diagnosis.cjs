async function run() {
  const res = await fetch('https://n8n.saksham-experiments.com/webhook/ai-care-diagnosis-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      history: [
        { role: 'assistant', content: 'What are your symptoms?' },
        { role: 'user', content: 'I have a headache, fatigue, and fever.' }
      ]
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();

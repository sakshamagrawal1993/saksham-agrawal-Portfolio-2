async function run() {
  const res = await fetch('https://n8n.saksham-experiments.com/webhook/ai-care-diagnosis-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      history: [
        { role: 'assistant', content: 'What symptoms or concerns would you like to discuss today?' },
        { role: 'user', content: 'Frequent Headaches' },
        { role: 'assistant', content: 'How long have you been experiencing these frequent headaches?' },
        { role: 'user', content: 'No other symptoms' },
        { role: 'assistant', content: 'Can you describe the pain of your headaches?' },
        { role: 'user', content: 'No other symptoms' },
        { role: 'assistant', content: 'Do you have any other symptoms along with the headaches?' },
        { role: 'user', content: 'No other symptoms' },
        { role: 'assistant', content: 'Have you taken any medication for the headaches?' },
        { role: 'user', content: 'No other symptoms' },
        { role: 'assistant', content: 'Has anything made the headaches better or worse?' },
        { role: 'user', content: 'No other symptoms' }
      ]
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();

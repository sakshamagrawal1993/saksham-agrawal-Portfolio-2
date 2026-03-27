import http from 'node:http';

const port = Number(process.env.PORT || 8787);
const secret = process.env.MC_N8N_WEBHOOK_SECRET || 'placeholder-secret';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-n8n-secret',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/webhook/mind-coach-session-end') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  if ((req.headers['x-n8n-secret'] || '') !== secret) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid webhook secret' }));
    return;
  }

  let incoming;
  try {
    incoming = await readJsonBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const name = incoming?.profile?.name || 'User';
  const pathway = incoming?.session?.pathway || 'anxiety_and_stress_management';

  const payload = {
    case_notes: {
      presenting_concern: 'Recurring anxiety spikes around work performance and uncertainty.',
      dynamic_theme: 'Fear of failure and self-criticism loops',
      phase_progress:
        'Client identified core trigger pattern and practiced cognitive defusion once during the session.',
      readiness_for_next_phase: 'ready',
      risk_level: 'low',
      requires_escalation: false,
    },
    session_summary: {
      title: 'Finding steadier ground',
      opening_reflection:
        `${name} noticed how quickly worry stories escalate and began responding with more self-compassion.`,
      quote_of_the_day:
        'You do not have to believe every thought you think.',
      energy_shift: {
        start: 'Tense and over-alert',
        end: 'More grounded and clear',
      },
      psychological_flexibility: {
        self_awareness: 72,
        observation: 68,
        physical_awareness: 63,
        core_values: 66,
        relationships: 61,
      },
      self_compassion_score: 64,
      suggested_pathway: pathway,
      crisis_detected: false,
      requires_escalation: false,
    },
    extracted_tasks: [
      {
        task_type: 'cognitive_reframing',
        dynamic_title: `${name}'s worry thought check`,
        dynamic_description:
          'When a worry spike appears, write the thought, evidence for/against it, and one kinder balanced response.',
        frequency: 'daily',
        suggested_duration_days: 7,
      },
      {
        task_type: 'somatic_exercise',
        dynamic_title: 'Two-minute downshift reset',
        dynamic_description:
          'Practice a 2-minute slow exhale breathing reset before high-pressure meetings.',
        frequency: 'situational',
        suggested_duration_days: 10,
      },
    ],
    extracted_memories: [
      {
        memory_text: 'Work evaluations trigger fear of disappointing others.',
        memory_type: 'trigger',
      },
      {
        memory_text: 'Slow exhale breathing reduced chest tightness within session.',
        memory_type: 'coping_strategy',
      },
    ],
  };

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
});

server.listen(port, () => {
  console.log(`Dummy session-end webhook listening on http://localhost:${port}/webhook/mind-coach-session-end`);
});

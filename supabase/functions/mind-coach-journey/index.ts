import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

// OpenAI API key is no longer used here; routing logic is delegated to n8n.

const PATHWAY_PLAYBOOKS: Record<string, { name: string; phases: { name: string; goal: string; sessions: number }[] }> = {
  crisis_intervention_and_suicide_prevention: {
    name: 'Safety & Connection Plan',
    phases: [
      { name: 'Safety First', goal: "Reduce access to means; know your warning signs and use your safety plan; reach out to one trusted person or crisis line when needed.", sessions: 3 },
      { name: 'Stay Connected', goal: "Identify 2–3 people or resources you will contact when you feel at risk; practice reaching out before a crisis.", sessions: 3 },
      { name: 'Daily Anchors', goal: "Keep 1–2 small non-negotiable daily actions (e.g. one call, one short walk); use them especially on hard days.", sessions: 3 },
      { name: 'When to Reach Out', goal: "Know when to use your safety plan or crisis line; review it weekly so it stays clear and usable.", sessions: 3 },
    ],
  },
  grief_and_loss_processing: {
    name: 'Healing Through Grief Plan',
    phases: [
      { name: 'Honour the Loss', goal: "Allow space to feel and talk about the loss; acknowledge that grief has no fixed timeline.", sessions: 3 },
      { name: 'Feel & Process', goal: "Notice and name emotions; allow memories and meaning-making without pressure to 'move on'.", sessions: 3 },
      { name: 'Re-engage Gently', goal: "Choose one or two small valued activities to return to, at your own pace.", sessions: 3 },
      { name: 'Carry Forward', goal: "Plan for difficult days (e.g. anniversaries); keep a way to remember and stay connected to what matters.", sessions: 3 },
    ],
  },
  depression_and_behavioral_activation: {
    name: 'Re-engagement & Mood Plan',
    phases: [
      { name: 'Understand the Cycle', goal: "Notice how withdrawal and low activity affect your mood; small steps can break the cycle.", sessions: 3 },
      { name: 'Small Steps Back', goal: "Schedule 1–2 very small, achievable activities each day linked to what you value.", sessions: 3 },
      { name: 'Build Momentum', goal: "Gradually add variety and a bit more challenge; notice mood and mastery after each activity.", sessions: 3 },
      { name: 'Keep Going', goal: "Keep a simple routine of activities; when you slip, return to small steps without self-criticism.", sessions: 3 },
    ],
  },
  anxiety_and_stress_management: {
    name: 'Calm & Coping Plan',
    phases: [
      { name: 'Understand Your Anxiety', goal: "Notice what triggers worry and stress; see how avoidance keeps anxiety going.", sessions: 3 },
      { name: 'Ground & Breathe', goal: "Practice grounding and slow breathing when anxious; use them before facing a stressor.", sessions: 3 },
      { name: 'Face Fears Gradually', goal: "Take one small step toward a situation you avoid; repeat until it feels more manageable.", sessions: 3 },
      { name: 'Stay Steady', goal: "Keep using grounding and exposure; plan for setbacks and return to the plan without judgment.", sessions: 3 },
    ],
  },
  emotion_regulation_and_distress_tolerance: {
    name: 'Emotional Balance Plan',
    phases: [
      { name: 'Notice & Name', goal: "Pause to notice and name emotions without judging them; see how they show up in your body.", sessions: 3 },
      { name: 'Tolerate Distress', goal: "Use distress tolerance (e.g. TIPP, self-soothe, brief distraction) when emotions are intense.", sessions: 3 },
      { name: 'Regulate & Choose', goal: "Check the facts and try opposite action when emotions don't fit the situation; choose how to respond.", sessions: 3 },
      { name: 'Practice Daily', goal: "Use one skill each day; notice what helps and what gets in the way.", sessions: 3 },
    ],
  },
  trauma_processing_and_ptsd: {
    name: 'Safety to Healing Plan',
    phases: [
      { name: 'Safety & Stability', goal: "Focus on feeling safe in the here and now; use grounding and emotion regulation before going deeper.", sessions: 3 },
      { name: 'Understand Trauma', goal: "Learn how trauma affects mind and body; work at your pace with a professional when ready.", sessions: 3 },
      { name: 'Process at Your Pace', goal: "Process trauma memories in a structured way when stable; re-integrate and find meaning.", sessions: 3 },
      { name: 'Live Beyond Triggers', goal: "Plan for triggers and setbacks; keep using grounding and coping so life feels more manageable.", sessions: 3 },
    ],
  },
  relationship_conflict_and_interpersonal: {
    name: 'Connection & Communication Plan',
    phases: [
      { name: 'See the Pattern', goal: "Notice how you and the other person interact in conflict (e.g. blame, withdrawal); clarify what you each need.", sessions: 3 },
      { name: 'Communicate Clearly', goal: "Practice I-statements and listening; name your feelings and ask for what you need in one situation.", sessions: 3 },
      { name: 'Try New Ways', goal: "Try one new way of responding in a real situation; reflect on what worked and what was hard.", sessions: 3 },
      { name: 'Nurture the Relationship', goal: "Keep using clear communication and boundaries; address setbacks without falling back into old patterns.", sessions: 3 },
    ],
  },
  self_worth_and_self_esteem: {
    name: 'Self-Worth Building Plan',
    phases: [
      { name: 'Challenge the Inner Critic', goal: "Notice negative self-talk; gather evidence for and against those thoughts.", sessions: 3 },
      { name: 'Act As If', goal: "Do one small thing 'as if' you believe you have value; notice what happens.", sessions: 3 },
      { name: 'Self-Compassion', goal: "When you're self-critical, offer yourself the same kindness you'd give a friend.", sessions: 3 },
      { name: 'Own Your Story', goal: "Build a fairer story about yourself using evidence and values-based actions.", sessions: 3 },
    ],
  },
  boundary_setting_and_assertiveness: {
    name: 'Boundaries & Respect Plan',
    phases: [
      { name: 'Know Your Limits', goal: "Clarify what you're okay with and what you're not; name one situation where you need a boundary.", sessions: 3 },
      { name: 'Say It Clearly', goal: "Practice one clear, calm, assertive statement (e.g. 'I need...' or 'I'm not able to...').", sessions: 3 },
      { name: 'Start Small', goal: "Use your boundary in one lower-stakes situation; notice guilt or fear and still hold the line.", sessions: 3 },
      { name: 'Hold Steady', goal: "Use boundaries in other relationships; reinforce them without apologising for your needs.", sessions: 3 },
    ],
  },
  overthinking_rumination_and_cognitive_restructuring: {
    name: 'Quiet Mind Plan',
    phases: [
      { name: 'Catch the Loop', goal: "Notice when you're overthinking or ruminating; name the trigger and the thought.", sessions: 3 },
      { name: 'Question Thoughts', goal: "Use a thought record: situation, thought, emotion, then evidence for and against the thought.", sessions: 3 },
      { name: 'Worry Time Only', goal: "Postpone worry to a short daily 'worry time'; when thoughts come earlier, note and return to the present.", sessions: 3 },
      { name: 'Distance & Let Go', goal: "See thoughts as just thoughts; practise mindfulness or defusion when the loop starts.", sessions: 3 },
    ],
  },
  sleep_and_insomnia: {
    name: 'Restful Sleep Plan',
    phases: [
      { name: 'Sleep Habits', goal: "Keep a consistent wake time; use the bed only for sleep; avoid screens and caffeine close to bedtime.", sessions: 3 },
      { name: 'Wind Down', goal: "Do a short relaxation or wind-down routine before bed; create a calm environment.", sessions: 3 },
      { name: 'Bed for Sleep Only', goal: "If you're awake 15–20 minutes, get up and do something calm until sleepy; then return to bed.", sessions: 3 },
      { name: 'Track & Adjust', goal: "Keep a simple sleep diary; adjust habits based on what helps you fall or stay asleep.", sessions: 3 },
    ],
  },
  panic_and_physical_anxiety_symptoms: {
    name: 'Calm Body & Mind Plan',
    phases: [
      { name: 'Understand Panic', goal: "Learn that panic is the body's alarm; it's uncomfortable but not dangerous.", sessions: 3 },
      { name: 'Breathe & Ground', goal: "Practise slow breathing and grounding when calm; use them as soon as you notice early signs of panic.", sessions: 3 },
      { name: 'Face Sensations', goal: "Practise interoceptive exposure (e.g. brief breath-holding, spinning) to reduce fear of sensations.", sessions: 3 },
      { name: 'Stay Calm in Life', goal: "Gradually enter situations you've avoided; keep using breathing and grounding.", sessions: 3 },
    ],
  },
  family_conflict_and_dynamics: {
    name: 'Family Calm & Boundaries Plan',
    phases: [
      { name: 'Map the Dynamics', goal: "Notice who's involved, what triggers conflict, and what you want versus what others expect.", sessions: 3 },
      { name: 'Regulate & Communicate', goal: "Use emotion regulation when triggered; practise one clear, calm way to say what you feel or need.", sessions: 3 },
      { name: 'Set Boundaries', goal: "Choose one boundary with family (e.g. a topic, a visit length); state it and keep it.", sessions: 3 },
      { name: 'Stay Steady with Family', goal: "Keep using regulation and boundaries; plan for difficult conversations or events.", sessions: 3 },
    ],
  },
  abuse_and_safety: {
    name: 'Safety First Plan',
    phases: [
      { name: 'Safety Now', goal: "Know where you're safe; reduce immediate risk; have one safe contact or resource (e.g. shelter, helpline).", sessions: 3 },
      { name: 'Plan Your Exit', goal: "If you're still at risk, make a practical exit plan: where to go, what to take, who to call.", sessions: 3 },
      { name: 'Connect to Support', goal: "Reach out to services (shelter, legal, counselling) when you're ready; you don't have to do it alone.", sessions: 3 },
      { name: 'Heal When Safe', goal: "When you're in a safer place, focus on trauma and emotional healing with professional support.", sessions: 3 },
    ],
  },
  life_transition_and_adjustment: {
    name: 'Transition & Adjustment Plan',
    phases: [
      { name: 'Acknowledge the Change', goal: "Name what has changed and what you've lost or gained; allow mixed feelings.", sessions: 3 },
      { name: 'Cope Day to Day', goal: "Use one or two coping strategies (e.g. problem-solving, support, rest) that work for you.", sessions: 3 },
      { name: 'Rebuild Routines', goal: "Re-establish small daily routines and roles that give structure and meaning.", sessions: 3 },
      { name: 'Find New Meaning', goal: "Set short-term goals; build new support and meaning in this chapter of life.", sessions: 3 },
    ],
  },
  identity_and_self_concept: {
    name: 'Discovering Yourself Plan',
    phases: [
      { name: 'Explore Without Judgment', goal: "Notice what you value and how you want to be, without pressure to have it all figured out.", sessions: 3 },
      { name: 'Clarify Values', goal: "Name what matters in different life areas; see where society or family pressure conflicts with your values.", sessions: 3 },
      { name: 'Try On Who You Are', goal: "Do one small experiment in self-expression or a choice that feels more 'you'.", sessions: 3 },
      { name: 'Own Your Story', goal: "Gradually build a story about yourself that fits your values and actions; allow it to evolve.", sessions: 3 },
    ],
  },
  social_anxiety_and_isolation: {
    name: 'Reconnect & Comfort Plan',
    phases: [
      { name: 'Understand Your Fears', goal: "Notice automatic thoughts and safety behaviours in social situations; see how they keep fear going.", sessions: 3 },
      { name: 'Challenge Thoughts', goal: "Question thoughts about judgment or rejection; test them with one small behavioural experiment.", sessions: 3 },
      { name: 'Step Out Gently', goal: "Do one small social step (e.g. say hi, join a short call); repeat and slightly increase when comfortable.", sessions: 3 },
      { name: 'Build Connection', goal: "Keep taking small steps; focus on one or two people or activities that matter to you.", sessions: 3 },
    ],
  },
  anger_management: {
    name: 'Calm Response Plan',
    phases: [
      { name: 'Spot the Triggers', goal: "Notice what triggers anger and the first signs in your body and thoughts.", sessions: 3 },
      { name: 'Pause & Ground', goal: "As soon as you notice anger building, pause; use breathing or grounding before reacting.", sessions: 3 },
      { name: "Respond, Don't React", goal: "Check the facts; choose an assertive response instead of aggression.", sessions: 3 },
      { name: 'Keep Your Cool', goal: "Practise the pause and assertive response in real situations; plan for high-trigger moments.", sessions: 3 },
    ],
  },
  health_anxiety_and_somatic_symptoms: {
    name: 'Body-Mind Calm Plan',
    phases: [
      { name: 'Understand the Link', goal: "Learn how worry and attention affect body sensations; reduce reassurance-seeking and checking.", sessions: 3 },
      { name: 'Less Reassurance', goal: "Cut down on checking or asking others for reassurance; sit with uncertainty for short periods.", sessions: 3 },
      { name: 'Face Health Fears', goal: "Gradually face health-related triggers (e.g. body focus, health information) without reassurance.", sessions: 3 },
      { name: 'Live Fully', goal: "Shift attention to valued activities and away from body monitoring; keep using skills when worry spikes.", sessions: 3 },
    ],
  },
  engagement_rapport_and_assessment: {
    name: 'First Steps Plan',
    phases: [
      { name: 'Build Trust', goal: "Take your time; this is a space to be heard. Share only what feels safe.", sessions: 3 },
      { name: 'Clarify What You Need', goal: "Name what you'd like to be different or what you want from support.", sessions: 3 },
      { name: 'Choose Your Focus', goal: "Pick one or two areas to work on first; we can adjust as we go.", sessions: 3 },
      { name: 'Next Steps', goal: "Decide on one small next step (e.g. another session, a resource, or a practice) and when you'll do it.", sessions: 3 },
    ],
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { profile_id, dynamic_theme, concerns } = await req.json();

    if (!profile_id) {
      return new Response(
        JSON.stringify({ error: 'profile_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Delegate pathway routing to n8n
    const n8nWebhookUrl = Deno.env.get('MC_N8N_JOURNEY_WEBHOOK_URL') || 'https://your-n8n-instance.com/webhook/mind-coach-journey';
    const n8nSecret = Deno.env.get('MC_N8N_WEBHOOK_SECRET') || 'placeholder-secret';

    const webhookResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-n8n-secret': n8nSecret,
      },
      body: JSON.stringify({
        profile_id,
        concerns,
        dynamic_theme,
      }),
    });

    if (!webhookResponse.ok) {
      const errText = await webhookResponse.text();
      console.error('n8n routing error:', errText);
      return new Response(
        JSON.stringify({ error: 'Pathway routing failed via n8n', details: errText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    const aiResult = await webhookResponse.json();
    const routerOutput = Array.isArray(aiResult) ? aiResult[0] : aiResult;
    const selectedPathway = routerOutput.pathway || 'exploratory_validation';
    const playbook = PATHWAY_PLAYBOOKS[selectedPathway] || PATHWAY_PLAYBOOKS.exploratory_validation;

    // Create journey
    const { data: journey, error: journeyErr } = await supabaseAdmin
      .from('mind_coach_journeys')
      .insert({
        profile_id,
        pathway: selectedPathway,
        title: playbook.name,
        phases: playbook.phases,
        current_phase_index: 0,
        sessions_completed: 0,
        active: true,
      })
      .select()
      .single();

    if (journeyErr) {
      console.error('Journey creation error:', journeyErr);
      return new Response(
        JSON.stringify({ error: 'Failed to create journey', details: journeyErr.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        journey,
        pathway: selectedPathway,
        reasoning: routerOutput.reasoning,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('mind-coach-journey error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

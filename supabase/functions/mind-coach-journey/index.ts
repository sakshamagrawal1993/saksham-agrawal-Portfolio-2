import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

const PATHWAY_PLAYBOOKS: Record<string, { name: string; phases: { name: string; goal: string; sessions: number }[] }> = {
  cognitive_reframing: {
    name: 'Cognitive Reframing Journey',
    phases: [
      { name: 'Awareness', goal: 'Identify automatic negative thought patterns', sessions: 3 },
      { name: 'Challenge', goal: 'Learn to question and test distorted thoughts', sessions: 3 },
      { name: 'Reframe', goal: 'Build alternative, balanced perspectives', sessions: 3 },
      { name: 'Integration', goal: 'Solidify new thinking habits in daily life', sessions: 3 },
    ],
  },
  boundary_setting: {
    name: 'Boundary Building Journey',
    phases: [
      { name: 'Recognition', goal: 'Identify where boundaries are lacking', sessions: 3 },
      { name: 'Assertiveness', goal: 'Develop communication skills for boundary-setting', sessions: 3 },
      { name: 'Practice', goal: 'Apply boundaries in key relationships', sessions: 3 },
      { name: 'Maintenance', goal: 'Sustain boundaries without guilt', sessions: 3 },
    ],
  },
  emotional_regulation: {
    name: 'Emotional Balance Journey',
    phases: [
      { name: 'Grounding', goal: 'Build distress tolerance and crisis survival skills', sessions: 3 },
      { name: 'Awareness', goal: 'Identify emotional triggers and body signals', sessions: 3 },
      { name: 'Modulation', goal: 'Apply regulation techniques in real situations', sessions: 3 },
      { name: 'Resilience', goal: 'Develop long-term emotional flexibility', sessions: 3 },
    ],
  },
  grief_and_acceptance: {
    name: 'Healing & Acceptance Journey',
    phases: [
      { name: 'Acknowledgment', goal: 'Create space to honor the loss', sessions: 3 },
      { name: 'Processing', goal: 'Explore complicated emotions without avoidance', sessions: 3 },
      { name: 'Meaning-Making', goal: 'Find meaning and integrate the experience', sessions: 3 },
      { name: 'Moving Forward', goal: 'Rebuild identity and engage with life again', sessions: 3 },
    ],
  },
  self_worth_building: {
    name: 'Self-Worth Journey',
    phases: [
      { name: 'Inner Critic Audit', goal: 'Map the self-critical voice and its origins', sessions: 3 },
      { name: 'Self-Compassion', goal: 'Develop a kind inner dialogue', sessions: 3 },
      { name: 'Values Alignment', goal: 'Define worth through personal values, not external validation', sessions: 3 },
      { name: 'Embodiment', goal: 'Live confidently from a place of inherent worth', sessions: 3 },
    ],
  },
  behavioral_activation: {
    name: 'Momentum & Motivation Journey',
    phases: [
      { name: 'Activity Mapping', goal: 'Understand the activity-mood connection', sessions: 3 },
      { name: 'Small Wins', goal: 'Schedule and complete achievable activities', sessions: 3 },
      { name: 'Values-Driven Action', goal: 'Align actions with personal values', sessions: 3 },
      { name: 'Sustainable Momentum', goal: 'Maintain motivation independently', sessions: 3 },
    ],
  },
  exploratory_validation: {
    name: 'Exploratory Journey',
    phases: [
      { name: 'Safe Exploration', goal: 'Create a trusting space to share openly', sessions: 3 },
      { name: 'Pattern Discovery', goal: 'Identify recurring themes and patterns', sessions: 3 },
      { name: 'Focused Work', goal: 'Deepen into the most impactful theme', sessions: 3 },
      { name: 'Consolidation', goal: 'Summarize learnings and plan forward', sessions: 3 },
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

    // Use OpenAI to route concerns to the best pathway
    const routerPrompt = `You are a Dynamic Theme Router for an AI therapy system.

Given the user's concerns and the identified dynamic theme, select the BEST matching therapeutic pathway.

Available pathways:
1. cognitive_reframing - For: negative thought patterns, imposter syndrome, catastrophic thinking, self-doubt, overthinking
2. boundary_setting - For: relationship conflicts, feeling overwhelmed by others, family issues, friend betrayal, couples issues
3. emotional_regulation - For: acute stress, anger, panic, anxiety, emotional overwhelm
4. grief_and_acceptance - For: loss, breakups, unchangeable situations, abandonment, midlife challenges
5. self_worth_building - For: low self-esteem, low confidence, identity exploration, bullying
6. behavioral_activation - For: low motivation, depression, loneliness, sleep issues, work stress avoidance
7. exploratory_validation - FALLBACK: when concerns don't clearly map to above pathways

Return ONLY valid JSON: { "pathway": "<pathway_key>", "reasoning": "<one sentence>" }`;

    const userPrompt = `User concerns: ${JSON.stringify(concerns || [])}
Dynamic theme (if identified): ${dynamic_theme || 'Not yet identified'}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: routerPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 200,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error('OpenAI routing error:', errText);
      return new Response(
        JSON.stringify({ error: 'Pathway routing failed', details: errText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    const aiResult = await openaiResponse.json();
    const routerOutput = JSON.parse(aiResult.choices?.[0]?.message?.content || '{}');
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

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// These webhook URLs should be set in Supabase environment variables,
// but for the sake of the demo, they can be overriden or hardcoded here if needed.
const N8N_GUARDRAIL_WEBHOOK = Deno.env.get('N8N_GUARDRAIL_WEBHOOK') || 'https://n8n.saksham-experiments.com/webhook/ai-care-guardrail';
const N8N_QA_WEBHOOK = Deno.env.get('N8N_QA_WEBHOOK') || 'https://n8n.saksham-experiments.com/webhook/ai-care-qa-generation';
const N8N_DIAGNOSIS_WEBHOOK = Deno.env.get('N8N_DIAGNOSIS_WEBHOOK') || 'https://n8n.saksham-experiments.com/webhook/ai-care-diagnosis-workflow';

interface ChatRequestPayload {
  action: 'start_session' | 'send_message';
  session_id?: string;
  message?: string;
  user_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get the user to verify authentication
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const payload: ChatRequestPayload = await req.json()

    if (payload.action === 'start_session') {
      // Create new session
      const { data: session, error: sessionError } = await supabaseClient
        .from('jivi_chat_sessions')
        .insert({ user_id: user.id })
        .select()
        .single()

      if (sessionError) throw sessionError;

      // Ask first question
      const initialQuestion = "Hello " + (user.email?.split('@')[0] || '') + ", what symptoms or concerns would you like to discuss today?";
      
      await supabaseClient.from('jivi_chat_messages').insert({
        session_id: session.id,
        role: 'assistant',
        content: initialQuestion,
        options: [
          "I am constantly thirsty and have to use the bathroom all night.",
          "I have a sharp pain in the lower right side of my stomach.",
          "I get breathless and my chest feels tight.",
          "I have a bad headache that won't go away."
        ]
      })

      return new Response(
        JSON.stringify({ session_id: session.id, initial_question: initialQuestion }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (payload.action === 'send_message') {
      const sessionId = payload.session_id;
      const userMessage = payload.message;

      if (!sessionId || !userMessage) {
         return new Response(JSON.stringify({ error: 'Missing session_id or message' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
         })
      }

      // Save user message
      await supabaseClient.from('jivi_chat_messages').insert({
        session_id: sessionId,
        role: 'user',
        content: userMessage
      });

      // 1. Guardrail Check
      const guardrailRes = await fetch(N8N_GUARDRAIL_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      
      const guardrailData = await guardrailRes.json().catch(() => ({ is_emergency: false }));
      
      if (guardrailData.is_emergency) {
        // Save alert
        await supabaseClient.from('jivi_alerts').insert({
          session_id: sessionId,
          is_emergency: true,
          message: guardrailData.message || 'Emergency detected'
        });

        // Update session status
        await supabaseClient.from('jivi_chat_sessions').update({ status: 'emergency_stopped' }).eq('id', sessionId);

        return new Response(
          JSON.stringify({ emergency: true, message: guardrailData.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 2. Fetch Chat History
      const { data: messages } = await supabaseClient
        .from('jivi_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      const messageHistory = messages?.map((m: any) => ({ role: m.role, content: m.content })) || [];
      const userMessageCount = messageHistory.filter(m => m.role === 'user').length;

      // 3. Diagnosis Check (Only if > 5 questions asked)
      if (userMessageCount > 5) {
        // Fetch session to get intermediate diagnoses from the latest system message
        const { data: systemMsg } = await supabaseClient
            .from('jivi_chat_messages')
            .select('content')
            .eq('session_id', sessionId)
            .eq('role', 'system')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        let intermediate = [];
        try {
            if (systemMsg && systemMsg.content) {
                intermediate = JSON.parse(systemMsg.content).intermediate_diagnoses || [];
            }
        } catch(e) {}

        const diagRes = await fetch(N8N_DIAGNOSIS_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
             history: messageHistory,
             intermediate_diagnoses: intermediate
          })
        });
        
        let diagData = await diagRes.json().catch(() => ({ confidence_score: 0 }));

        // Parse output: handle stringified JSON or markdown-wrapped JSON
        if (typeof diagData.output === 'string') {
           try {
              diagData = JSON.parse(diagData.output);
           } catch(e) {
              const match = diagData.output.match(/```json\n([\s\S]*?)\n```/);
              if (match) {
                 try { diagData = JSON.parse(match[1]); } catch(e2) {}
              }
           }
        } else if (diagData.output && typeof diagData.output === 'object') {
           diagData = diagData.output;
        }

        let confScore = 0;
        let diagnosesList = [];
        
        if (diagData.confidence_score !== undefined) {
           confScore = diagData.confidence_score;
           diagnosesList = diagData.diagnoses || [];
        } else if (diagData.diagnosis) {
           confScore = diagData.diagnosis.confidence || 0;
           diagnosesList = [diagData.diagnosis];
        } else if (diagData.differential_diagnosis && diagData.differential_diagnosis.length > 0) {
           const confString = String(diagData.differential_diagnosis[0].confidence || '0');
           confScore = parseInt(confString.replace('%', '')) || 0;
           diagnosesList = diagData.differential_diagnosis;
        }

        if (confScore >= 80 || userMessageCount >= 15) {
           // Save diagnosis
           await supabaseClient.from('jivi_diagnoses').insert({
             session_id: sessionId,
             diagnosis_data: diagnosesList,
             confidence_score: confScore
           });

           await supabaseClient.from('jivi_chat_sessions').update({ status: 'completed' }).eq('id', sessionId);

           return new Response(
              JSON.stringify({ diagnosis_ready: true }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
           )
        } else if (diagnosesList.length > 0) {
           // Save intermediate diagnosis as a system message for context in the next turn
           await supabaseClient.from('jivi_chat_messages').insert({
             session_id: sessionId,
             role: 'system',
             content: JSON.stringify({ intermediate_diagnoses: diagnosesList })
           });
        }
      }

      // 4. Next Question Generation
      const qaRes = await fetch(N8N_QA_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history: messageHistory })
      });
      
      const qaData = await qaRes.json().catch(() => ({ next_question: "Could you tell me more about that?", options: [] }));
      
      const optionsArray = Array.isArray(qaData.options) ? qaData.options : [];

      // Save assistant message
      await supabaseClient.from('jivi_chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: qaData.next_question || qaData.question,
        options: optionsArray
      });

      return new Response(
        JSON.stringify({ next_question: qaData.next_question || qaData.question, options: optionsArray }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
    })

  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

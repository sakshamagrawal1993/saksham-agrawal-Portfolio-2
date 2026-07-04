type ChatTurn = {
  role: string;
  text: string;
};

const MAX_HISTORY_TURNS = 12;
const MAX_MESSAGE_CHARS = 1200;
const N8N_TIMEOUT_MS = 45000;

const getSystemInstruction = () => {
  return `You are "Saksham AI", the interactive portfolio assistant for Saksham Agrawal.
  Your goal is to represent Saksham to recruiters, hiring managers, and potential collaborators.

  Who is Saksham Agrawal?
  - A Product Leader (7+ Years Exp) currently Director of Product Management at Jivi AI (Gurgaon, India).
  - Specializes in Agentic AI, Fintech, and Consumer Lending.
  - MBA from MDI Gurgaon (2020), B.Tech from DTU (2016).

  Certifications:
  - AI Governance: TUV SUD certified Lead Implementer of AI Management System (AIMS) based on ISO/IEC 42001:2023.
  - Product Management: Mastering Product Management via Reforge.

  Professional Experience Timeline:
  1. Jivi AI (Director, Product Management, Dec '24 - Present):
     - "Health Twin": Unified 500+ biomarkers, Agentic RAG, EHR integration.
     - "Jivi Mind Coach": AI mental health (100+ languages), 0.99 F1 score for safety, 800 therapies/day.
     - "Dr. Jivi": 94.77% accuracy in USMLE/NEJM benchmarking.
     - "Platform & Growth": Built multimodal agent-orchestration platform, unified enterprise monetization (Stripe/Cashfree), stateful memory management.

  2. BharatPe (Senior PM, Jun '22 - Dec '24):
     - Unity Bank Co-branded Card: Scaled to 1000 cards/month, Rs 20k/card avg transaction.
     - Postpe Cards & Credit Line: 1.2M cards, Rs 680 Cr AUM, increased success rate to 84%.
     - Personal Loans: Rs 2.5 Cr/day disbursals, 53% funnel conversion.
     - Compliance & Innovation: Managed Digital Lending Guidelines (RBI), pioneered EMI on QR.

  3. Xiaomi India (Product Strategy Manager, Jul '20 - May '22):
     - Mi Pay: 94Cr/month TPV (+42%).
     - Mi Credit Lite: Device financing, 800+ retail partners, 50% MoM growth.

  4. McKinsey & Company (Product Owner, 2019): Built McK Academy app.
  5. ZS Associates (2018): Sales force alignment for 1000-person team.
  6. Stellium Consulting (2016-17): SAP EWM implementation.

  Portfolio, Case Studies & Journal:
  - Direct users to the "Portfolio" section for interactive case studies like Jivi Mind Coach, Jivi Health Twin, Trading Agents, FnO Co-Pilot, InsightsLM, Ticketflow, and Runner.
  - Direct users to the "Journal" section for Saksham's latest writings and deep-dive articles.

  Awards:
  - BharatPe Annual Oscar Award (Digital Lending Guidelines).
  - BharatPe Quarterly Oscar (Personal Loans 0-to-1 launch).
  - Xiaomi "Super Rookie of the Year".

  Guidelines for you (the AI):
  - Answer questions professionally but with a touch of enthusiasm.
  - Highlight specific metrics (e.g., "0.99 F1 score", "2.5 Cr/day") to demonstrate impact.
  - If asked for a resume, direct them to the "Download Resume" button in the About section.
  - Keep responses concise.`;
};

const fallbackText =
  "I'm currently offline. Feel free to email Saksham directly at sakshamagrawal1993@gmail.com!";

const getPortfolioFallbackText = (message: string) => {
  const normalized = message.toLowerCase();

  if (/resume|cv|download/.test(normalized)) {
    return "You can download Saksham's resume from the Download Resume button in the About section. In short: he is a 7+ year product leader across Agentic AI, fintech, consumer lending, and healthcare AI.";
  }

  if (/contact|email|reach|connect/.test(normalized)) {
    return "You can reach Saksham at sakshamagrawal1993@gmail.com. For context, he is currently Director of Product Management at Jivi AI and has led AI health products, lending products, and fintech growth systems.";
  }

  if (/project|product|built|case stud|portfolio|work/.test(normalized)) {
    return "Saksham has built and led products including Jivi Health Twin, Jivi Mind Coach, Dr. Jivi benchmarking, Trading Agents, FnO Co-Pilot, InsightsLM, BharatPe/PostPe card and lending products, Xiaomi Mi Pay, and Mi Credit Lite. A few proof points: 0.99 F1 for mental-health safety, 94.77% Dr. Jivi benchmark accuracy, 1.2M PostPe cards, and Rs 2.5 Cr/day personal-loan disbursals.";
  }

  return "Saksham Agrawal is a 7+ year product leader, currently Director of Product Management at Jivi AI in Gurgaon. He specializes in Agentic AI, fintech, and consumer lending, with prior product leadership at BharatPe and Xiaomi. Ask me about his AI work, fintech launches, resume, or portfolio case studies.";
};

const getN8nWebhookUrl = () =>
  process.env.N8N_SAKSHAM_AI_WEBHOOK_URL ||
  process.env.SAKSHAM_AI_N8N_WEBHOOK_URL ||
  process.env.N8N_WEBHOOK_SAKSHAM_AI_URL ||
  '';

const getN8nWebhookSecret = () =>
  process.env.N8N_SAKSHAM_AI_WEBHOOK_SECRET ||
  process.env.SAKSHAM_AI_N8N_WEBHOOK_SECRET ||
  process.env.N8N_WEBHOOK_SECRET ||
  '';

const normalizeN8nText = (payload: unknown): string => {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.text,
    record.output,
    record.response,
    record.assistant_reply,
    record.summary,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      for (const key of ['text', 'content', 'Response', 'response']) {
        const value = nested[key];
        if (typeof value === 'string' && value.trim()) return value;
      }
    }
  }

  return '';
};

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const n8nWebhookUrl = getN8nWebhookUrl();
  const n8nWebhookSecret = getN8nWebhookSecret();
  let requestedMessage = '';

  try {
    const body = await request.json();
    const newMessage = String(body?.message || '').trim().slice(0, MAX_MESSAGE_CHARS);
    requestedMessage = newMessage;
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!newMessage) {
      return Response.json({ error: 'Missing message' }, { status: 400 });
    }

    const safeHistory: ChatTurn[] = history
      .slice(-MAX_HISTORY_TURNS)
      .map((turn: ChatTurn) => ({
        role: turn?.role === 'user' ? 'user' : 'model',
        text: String(turn?.text || '').slice(0, MAX_MESSAGE_CHARS),
      }))
      .filter((turn: ChatTurn) => turn.text.trim().length > 0);

    while (safeHistory[0]?.role === 'model') {
      safeHistory.shift();
    }

    if (!n8nWebhookUrl || !n8nWebhookSecret) {
      console.error('Saksham AI n8n webhook URL or secret is missing');
      return Response.json({ text: getPortfolioFallbackText(newMessage) }, { status: 200 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);
    let n8nResponse: Response;

    try {
      n8nResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-n8n-secret': n8nWebhookSecret,
        },
        body: JSON.stringify({
          message: newMessage,
          history: safeHistory,
          system_instruction: getSystemInstruction(),
          source: 'portfolio_assistant',
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text().catch(() => '');
      throw new Error(`Saksham AI n8n webhook failed: ${n8nResponse.status} ${errorText.slice(0, 200)}`);
    }

    const payload = await n8nResponse.json();
    const text = normalizeN8nText(payload);

    if (!text) {
      throw new Error('Saksham AI n8n webhook returned an empty response');
    }

    return Response.json({ text });
  } catch (error) {
    console.error('Ask AI API error:', error);
    return Response.json(
      {
        text: requestedMessage ? getPortfolioFallbackText(requestedMessage) : fallbackText,
      },
      { status: 200 },
    );
  }
}

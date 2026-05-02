
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { Project, JournalArticle } from './types';

// Placeholder PDF Base64. In production, replace this with a link to the actual file like "/Saksham_Agrawal_Resume.pdf"
export const RESUME_DATA_URI = "https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/Resume/Saksham_Agrawal_Resume_10_04.pdf";

export const EXPERIENCE = [
  {
    company: "Jivi AI",
    role: "Director, Product Management",
    period: "Dec '24 - Present",
    location: "Delhi, India",
    description: [
      "Architected Health Twin, a centralized platform unifying 500+ biomarker data points using Agentic RAG. Leading the strategic integration with the world's largest smartphone OEM.",
      "Launched Jivi Mind Coach, a voice-first AI therapist scaling to ~800 therapies/day, and established an observability framework with 0.99 F1 score.",
      "Led multi-agent triaging workflow for Dr. Jivi, achieving top-3 diagnostic accuracy of 94.77% in USMLE/NEJM benchmarking.",
      "Built multimodal agent-orchestration platform empowering non-tech teams to compose AI agents, reducing TTM by ~50%.",
      "Architected a stateful memory management system integrating episodic session context and long-term user profiles for deep personalization.",
      "Drove user acquisition to 3.7M+ users through performance marketing and PLG freemium models, reducing CAC by 75%.",
      "Leveraged LLM-native development tools to build and deploy functional full-stack prototypes, streamlining technical feasibility and demos."
    ]
  },
  {
    company: "BharatPe",
    role: "Senior Product Manager, Consumer Lending",
    period: "Jun '22 - Dec '24",
    location: "Delhi, India",
    description: [
      "Led a cross-functional team of business, design, engineering, and risk to successfully launch Co-branded Credit Cards (0-to-1). Scaled acquisition to ~1,000 cards/month with an average transaction value exceeding INR 20k.",
      "Managed Postpe cards (1.2M+ active cards) and CCMS platform integrations. Spearheaded a team of 2 APMs to disburse INR 420 Cr/month with an AUM of ~INR 680 Cr.",
      "Increased transaction success rate from 72% to 84%, generating an additional INR 30 Cr/month in disbursals.",
      "Spearheaded Personal Loan product from concept to launch with E-Nach validation and real-time disbursals, scaling portfolio to INR 2.5 Cr/day.",
      "Pioneered industry-first 'EMI on QR' feature, unlocking a new INR 1 Cr/day portfolio in consumer durable loans.",
      "Defined and executed the comprehensive strategic roadmap for strict compliance with RBI's Digital Lending Guidelines."
    ]
  },
  {
    company: "Xiaomi India",
    role: "Product Strategy, Xiaomi Financial Services",
    period: "Jul '20 - May '22",
    location: "Delhi, India",
    description: [
      "Architected strategy and roadmap for Xiaomi's Financial Services ecosystem, including Mi Pay.",
      "Launched Device Financing with Home Credit, completing 2,000+ contracts within 3 months.",
      "Analyzed user behavior in Mi Pay, boosting Total Payment Value by 42% to INR 94 Cr monthly."
    ]
  },
  {
    company: "McKinsey & Company",
    role: "Product Owner (Internship)",
    period: "Apr '19 - May '19",
    location: "Gurgaon, India",
    description: [
      "Led the Agile/Scrum development and successful launch of the client-facing Learning Management mobile app for the McKinsey Academy."
    ]
  },
  {
    company: "ZS Associates",
    role: "Decision Analytics Associate",
    period: "Feb '18 - May '18",
    location: "Gurgaon, India",
    description: [
      "Orchestrated strategic realignment of a 1,000-person sales force across 7 brand portfolios following the J&J-Actelion merger, optimizing market coverage through data-driven analysis."
    ]
  },
  {
    company: "Stellium Consulting",
    role: "Associate Consultant",
    period: "Jul '16 - Sep '17",
    location: "Delhi, India",
    description: [
      "Led India's first RFID-integrated SAP EWM implementation for a major textile client, increasing operational throughput by 18%.",
      "Implemented SAP EWM at an automobile spares warehouse, increasing throughput by 23% and decreasing inbound time by 15%."
    ]
  }
];

export const PROJECTS: Project[] = [
  {
    id: 'ai-gate',
    name: 'AI Gating Lab',
    tagline: 'Phase 0 decision engine for AI products.',
    description: 'An interactive DICE and taxonomy evaluator that decides whether a workflow should be built with deterministic code, classical ML, or LLM/agentic systems.',
    longDescription: 'AI Gating Lab turns the article "The Gating Decision — Should You Build with AI?" into a working portfolio demo. A user can pick a sample idea or submit their own workflow, the concept is stored in Supabase, an edge-function proxy can trigger n8n evaluation logic, and the returned result is rendered as a visual decision dashboard showing taxonomy class, DICE scores, reliability vs stakes posture, and the recommended level of automation.',
    role: 'Product Architect & Full Stack Builder',
    category: 'Strategy',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1000',
    gallery: [],
    techStack: ['React', 'Supabase', 'n8n', 'Recharts', 'Decision Science'],
    demoUrl: '/ai-gate'
  },
  {
    id: 'trading-agents',
    name: 'Trading Agents',
    tagline: 'Multi-Agent Fintech Researcher.',
    description: 'A sophisticated agentic research platform to analyze markets, debate positions, and manage portfolio risk using LLMs.',
    longDescription: 'Trading Agents is a full-stack AI orchestration platform. It uses a network of autonomous agents (Market Analyst, News Analyst, Bull/Bear debaters, and a Portfolio Manager) connected via n8n and Supabase to formulate robust trading decisions in real-time.',
    role: 'Creator & Architect',
    category: 'AI / Fintech',
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=1000',
    gallery: [],
    techStack: ['n8n', 'Supabase', 'React', 'OpenAI'],
    demoUrl: '/trading-agents'
  },
  {
    id: 'insightslm',
    name: 'InsightsLM',
    tagline: 'AI Notebook for Research',
    description: 'An AI-powered research assistant that turns documents into audio overviews and interactive Q&A.',
    longDescription: 'InsightsLM is a clone of NotebookLM, designed to help researchers and students synthesize information faster. Users can upload PDFs, generate audio podcasts summarizing the content, and ask complex questions grounded in their documents.',
    role: 'Full Stack Developer',
    category: 'AI / SaaS',
    imageUrl: 'https://images.unsplash.com/photo-1518186285589-2f7649de83e0?auto=format&fit=crop&q=80&w=1000',
    gallery: [],
    techStack: ['React', 'Supabase', 'N8N', 'RAG'],
    demoUrl: '/insightslm'
  },
  {
    id: 'ticketflow',
    name: 'Ticketflow',
    tagline: 'Streamlined support ticket management.',
    description: 'A comprehensive ticketing system for operators to manage, track, and resolve user complaints efficiently.',
    longDescription: 'Ticketflow enables operators to log complaints, track status changes, and analyze support metrics in real-time. Features include a secure login, detailed ticket dashboard, remark logging, and interactive analytics visualization involved in support operations.',
    role: 'Full Stack Developer',
    category: 'SaaS / Enterprise',
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1000', // Placeholder or use a specific one
    gallery: [],
    techStack: ['React', 'TypeScript', 'Tailwind CSS', 'Analytics'],
    demoUrl: '/ticketflow'
  },
  {
    id: 'runner',
    name: 'Runner',
    tagline: 'Endless 3D Runner.',
    description: 'A 3D endless runner game built with React Three Fiber.',
    longDescription: 'Test your reflexes in this endless 3D runner. Dodge boulders, avoid trees, and collect coins to set the high score. Built using React Three Fiber and Zustand for high-performance state management.',
    role: 'Game Developer',
    category: 'Game / 3D',
    imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=1000',
    gallery: [],
    techStack: ['React Three Fiber', 'Three.js', 'Zustand', 'WebGL'],
    demoUrl: '/runner'
  },
  {
    id: 'digital-twin',
    name: 'Health Twin Platform',
    tagline: 'Connected care via Knowledge Graphs.',
    description: 'A centralized platform connecting biomarkers to give users a holistic view of their health.',
    longDescription: 'At Jivi.ai, I identified a gap where users struggled with fragmented medical history. I standardized parameters across biomarkers to allow integration with EHRs. I implemented the Health Assistant using Agentic RAG and Knowledge Graphs, providing accurate insights to users and doctors.',
    role: 'Senior Product Manager @ Jivi AI',
    category: 'Healthcare AI',
    imageUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=1000',
    gallery: [
      'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=1000'
    ],
    techStack: ['Agentic RAG', 'Knowledge Graphs', 'EHR Integration', 'Healthcare Data'],
    demoUrl: '/health-twin'
  },
  {
    id: 'mind-coach',
    name: 'Jivi Mind Coach',
    tagline: 'AI Therapy at scale.',
    description: 'Mental health platform with real-time conversational capabilities in 100+ languages.',
    longDescription: 'Launched Jivi Mind Coach, scaling it to ~800 therapies/day. I conceptualized an emergency monitoring system that catches crises with an F1 score of 0.99. I also implemented LLM evaluations across 11 rubrics to ensure clinical safety.',
    role: 'Product Lead @ Jivi AI',
    category: 'Healthcare AI',
    imageUrl: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&q=80&w=1000',
    gallery: [
      'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&q=80&w=1000'
    ],
    techStack: ['LLMs', 'Safety Guardrails', 'Multilingual Support', 'PLG'],
    demoUrl: '/mind-coach'
  },
  {
    id: 'p3',
    name: 'BharatPe Unity Card',
    tagline: 'Co-branded credit card launch.',
    description: 'Led the 0-1 launch of BharatPe and Unity Bank’s first co-branded credit card.',
    longDescription: 'Co-led a cross-functional team to launch this product. We scaled to ~1000 cards monthly with an average transaction value of Rs. 20,000/card. I owned the product proposition and customer experience from concept to scale.',
    role: 'Senior Product Manager @ BharatPe',
    category: 'Fintech',
    imageUrl: 'https://images.unsplash.com/photo-1614212959648-8a2b535d496e?auto=format&fit=crop&q=80&w=1000',
    gallery: [
      'https://images.unsplash.com/photo-1614212959648-8a2b535d496e?auto=format&fit=crop&q=80&w=1000'
    ],

    techStack: ['Banking Integration', 'Credit Risk', 'Go-To-Market', 'Stakeholder Mgmt'],
    demoUrl: '/unity-card',

  },
  {
    id: 'p4',
    name: 'Postpe & Personal Loans',
    tagline: 'Scaling consumer lending.',
    description: 'Managed 3rd largest BNPL card player with 1.2M cards and launched Personal Loans.',
    longDescription: 'Managed Postpe cards (AUM ~Rs 680 Cr). I pioneered the industry-first "EMI on QR" feature. For Personal Loans, I spearheaded the product from concept to launch with real-time disbursals, scaling to Rs 2.5 Cr/day.',
    role: 'Senior Product Manager @ BharatPe',
    category: 'Fintech',
    imageUrl: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&q=80&w=1000',
    gallery: [
      'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&q=80&w=1000'
    ],
    techStack: ['Lending Lifecycle', 'Regulatory Compliance', 'E-Nach', 'Risk Modeling'],
    demoUrl: '#'
  },
  {
    id: 'p5',
    name: 'Mi Pay & Device Financing',
    tagline: 'Financial inclusion ecosystem.',
    description: 'Strategized payments and lending roadmap for Xiaomi Financial Services.',
    longDescription: 'Increased Mi Pay TPV by 42% to 94Cr/month. Launched "Mi Credit Lite" for device financing, onboarding 800+ retail partners and achieving 2000+ contracts in 3 months with 50% MoM growth.',
    role: 'Product Strategy @ Xiaomi',
    category: 'Fintech',
    imageUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&q=80&w=1000',
    gallery: [
      'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&q=80&w=1000'
    ],
    techStack: ['Payments', 'Supply Chain Finance', 'Strategy', 'P&L'],
    demoUrl: '#'
  },
  {
    id: 'p6',
    name: 'WealthWise AI',
    tagline: 'Hyper-personalized financial planning.',
    description: 'AI-driven personal finance app that provides real-time investment insights and budget tracking.',
    longDescription: 'Developed an AI-driven personal finance assistant that aggregates user financial data to provide actionable investment insights and automated budgeting. Achieved 15% improvement in user savings rates within the first 6 months.',
    role: 'Product Lead',
    category: 'Fintech',
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1000',
    gallery: [
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1000'
    ],
    techStack: ['Python', 'React Native', 'TensorFlow', 'Finance API'],
    demoUrl: '#'
  },
  {
    id: 'p7',
    name: 'ChainSecure ID',
    tagline: 'Decentralized identity for the new web.',
    description: 'Blockchain-based identity verification system reducing fraud and onboarding time.',
    longDescription: 'Led the product definition and launch of a decentralized identity verification solution using Ethereum compliant credentials. Reduced customer onboarding time by 40% and eliminated synthetic identity fraud.',
    role: 'Senior PM',
    category: 'Blockchain',
    imageUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&q=80&w=1000',
    gallery: [
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&q=80&w=1000'
    ],
    techStack: ['Solidity', 'Ethereum', 'Node.js', 'Web3.js'],
    demoUrl: '#'
  },
  {
    id: 'p8',
    name: 'AdGenius',
    tagline: 'Generative AI for high-conversion copy.',
    description: 'Marketing tool leveraging LLMs to generate and A/B test ad copy automatically.',
    longDescription: 'Conceptualized and launched a generative AI tool for marketers that creates diverse ad copy variations. Integrated with major ad platforms for automated A/B testing, resulting in a 25% increase in CTR for pilot clients.',
    role: 'Product Manager',
    category: 'AI / Marketing',
    imageUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=1000',
    gallery: [
      'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=1000'
    ],
    techStack: ['OpenAI API', 'React', 'Node.js', 'Analytics'],
    demoUrl: '#'
  }
];

 export const JOURNAL_ARTICLES: JournalArticle[] = [];

export const BRAND_NAME = 'Saksham.';

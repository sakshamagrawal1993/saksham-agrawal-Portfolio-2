
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { Project, JournalArticle } from './types';

// Placeholder PDF Base64. In production, replace this with a link to the actual file like "/Saksham_Agrawal_Resume.pdf"
export const RESUME_DATA_URI = "https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/Resume/Saksham_Agrawal_Resume_26_11_2025.pdf";

export const EXPERIENCE = [
  {
    company: "Jivi AI",
    role: "Senior Product Manager",
    period: "Dec '24 - Present",
    location: "Gurugram, India",
    description: [
      "Leading product for Health Twin, unifying data across biomarkers to create a connected care platform using Agentic RAG and Knowledge Graphs.",
      "Launched Jivi Mind Coach (AI Therapist) supporting 100+ languages; implemented emergency monitoring with F1 score of 0.99.",
      "Scaled Jivi Mind Coach to ~800 therapies/day with 4% conversion rate.",
      "Built agent-orchestration platform reducing time-to-market for AI agents by ~50%."
    ]
  },
  {
    company: "BharatPe",
    role: "Senior Product Manager, Consumer Lending",
    period: "Jun '22 - Dec '24",
    location: "New Delhi, India",
    description: [
      "Co-led 0-1 launch of BharatPe Unity Bank co-branded credit card; scaled to ~1000 cards monthly with avg transaction value of Rs. 20,000.",
      "Managed Postpe cards (3rd largest BNPL player) with 1.2 million cards; increased transaction success rate from 72% to 84%.",
      "Spearheaded Personal Loan product with real-time disbursals, scaling to ~Rs 2.5 Cr/day.",
      "Defined roadmap for compliance with RBI's Digital Lending Guidelines."
    ]
  },
  {
    company: "Xiaomi India",
    role: "Product Strategy Manager, Financial Services",
    period: "Jul '20 - May '22",
    location: "Bengaluru, India",
    description: [
      "Developed strategy for Mi Pay, boosting Total Payment Value by 42% to 94 Cr/month.",
      "Launched 'Mi Credit Lite' (Device Financing), onboarding 800+ retail outlets and growing disbursements 50% MoM.",
      "Managed P&L and roadmap for Prepaid Cards and Wearable Payments."
    ]
  },
  {
    company: "McKinsey & Company",
    role: "Product Owner (Summer Intern)",
    period: "Apr '19 - May '19",
    location: "Bengaluru, India",
    description: [
      "Led development of 'McK Academy' client-facing Learning Management app.",
      "Created product roadmap and implemented using SCRUM methodology."
    ]
  },
  {
    company: "ZS Associates",
    role: "Decision Analytics Associate",
    period: "Feb '18 - May '18",
    location: "Gurgaon, India",
    description: [
      "Orchestrated strategic realignment of a 1,000-person sales force across 7 brand portfolios.",
      "Optimized market coverage and territorial alignment."
    ]
  },
  {
    company: "Stellium Consulting",
    role: "Associate Consultant",
    period: "Jul '16 - Sep '17",
    location: "Jaipur, India",
    description: [
      "Led India's first RFID-integrated SAP EWM implementation for a major textile client, increasing throughput by 18%.",
      "Implemented SAP EWM solution for automobile spares, decreasing inbound time by 15%."
    ]
  }
];

export const PROJECTS: Project[] = [
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
    id: 'p1',
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
    demoUrl: '#'
  },
  {
    id: 'p2',
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
    demoUrl: '#'
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
    demoUrl: '#',

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

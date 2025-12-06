
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { Project, JournalArticle } from './types';

// Placeholder PDF Base64. In production, replace this with a link to the actual file like "/Saksham_Agrawal_Resume.pdf"
export const RESUME_DATA_URI = "data:application/pdf;base64,JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXwKICAvTWVkaWFCb3ggWyAwIDAgNTk1LjI4IDg0MS44OSBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSCisgICAgPj4KICA+PgogIC9Db250ZW50cyA1IDAgUgo+PgplbmRvYmoKCjQgMCBvYmoKPDwKICAvVHlwZSAvRm9udAogIC9TdWJ0eXBlIC9UeXBlMQogIC9CYXNlRm9udCAvSGVsdmV0aWNhCj4+CmVuZG9iagoKNSAwIG9iago8PAogIC9MZW5ndGggNDQKPj4Kc3RyZWFtCkJUCi9FMSAxMiBUZgo1MCA3NTAgVGQKKFBsZWFzZSByZXBsYWNlIHRoaXMgZmlsZSB3aXRoIFNha3NoYW0ncyBhY3R1YWwgUERGIFJlc3VtZSkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDE1NyAwMDAwMCBuIAowMDAwMDAwMjU1IDAwMDAwIG4gCjAwMDAwMDAzNDQgMDAwMDAgbiAKdHJhaWxlcgo8PAogIC9TaXplIDYKICAvUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKNDM4CiUlRU9GCg==";

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
    demoUrl: '#' // This will be intercepted in App.tsx
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
      'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&q=80&w=1000'
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
    demoUrl: '#'
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

export const JOURNAL_ARTICLES: JournalArticle[] = [
  {
    id: 1,
    title: "Agentic AI in Healthcare",
    date: "December 2024",
    excerpt: "How Jivi AI is moving from chatbots to connected care.",
    image: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&q=80&w=1000",
    content: React.createElement(React.Fragment, null,
      React.createElement("p", { className: "mb-6 text-[#5D5A53]" },
        "At Jivi, we are not just building another chatbot. We are building 'Health Twin', a platform that understands a user's complete biomarker profile."
      ),
      React.createElement("p", { className: "mb-8 text-[#5D5A53]" },
        "By utilizing Agentic RAG and Knowledge Graphs, we can provide differential diagnosis with high accuracy (94%+ in USMLE for Dr. Jivi), bridging the gap between fragmented data and actionable medical advice."
      )
    )
  },
  {
    id: 2,
    title: "Navigating Digital Lending Guidelines",
    date: "October 2023",
    excerpt: "Compliance as a product feature at BharatPe.",
    image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&q=80&w=1000",
    content: React.createElement(React.Fragment, null,
      React.createElement("p", { className: "mb-6 text-[#5D5A53]" },
        "When RBI released new Digital Lending Guidelines, many saw it as a hurdle. At BharatPe, I led the product roadmap to turn compliance into a trust-building feature."
      ),
      React.createElement("p", { className: "mb-6 text-[#5D5A53]" },
        "We redesigned the Credit Line/CCMS platform integration with NBFC partners, ensuring transparency while maintaining a seamless user experience for our 1.2 million Postpe card users."
      )
    )
  },
  {
    id: 3,
    title: "The Strategy of Device Financing",
    date: "May 2022",
    excerpt: "Unlocking growth for the underbanked at Xiaomi.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?auto=format&fit=crop&q=80&w=1000",
    content: React.createElement(React.Fragment, null,
      React.createElement("p", { className: "mb-6 text-[#5D5A53]" },
        "Launching Mi Credit Lite required onboarding 800+ offline retail partners. The challenge wasn't just credit risk; it was operational scalability."
      ),
      React.createElement("p", { className: "mb-8 text-[#5D5A53]" },
        "By synchronizing the Xiaomi band with XFS for wearable payments and offering NFC-based solutions, we created an ecosystem that incentivized both merchants and consumers."
      )
    )
  }
];

export const BRAND_NAME = 'Saksham.';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { Cpu, Rocket, ShieldCheck, TrendingUp } from 'lucide-react';
import { RESUME_DATA_URI } from '../constants';

const capabilities = [
  {
    title: 'AI Product Systems',
    icon: Cpu,
    evidence: 'At Jivi, built multi-agent, multi-modal workflows in healthcare with clinical-grade performance. Proficient in agent harnesses, including observability, evals, and guardrail systems.',
  },
  {
    title: 'Growth & Scale',
    icon: TrendingUp,
    evidence: 'Scaled Jivi to 3.7M+ users and BharatPe Consumer Lending to 1.2M+ active cards, INR 420 Cr/month disbursals, and ~INR 680 Cr AUM through funnels, reliability, and PLG.',
  },
  {
    title: '0-1 Product Development',
    icon: Rocket,
    evidence: 'Built 0-1 products by identifying customer needs, shaping the value proposition, and taking BharatPe Credit Cards, Personal Loans, EMI on QR, Xiaomi Device Financing, and Jivi monetization to market.',
  },
  {
    title: 'Regulated Product Leadership',
    icon: ShieldCheck,
    evidence: 'Led products in regulated fintech and healthcare environments, including RBI Digital Lending, HIPAA readiness, AI safety evals, and bank/NBFC integrations, balancing speed with governance.',
  },
];

const About: React.FC = () => {
  return (
    <section id="about" className="bg-[#EBE7DE]">

      {/* Introduction / Bio */}
      <div className="py-12 md:py-16 px-6 md:px-12 max-w-[1800px] mx-auto flex flex-col md:flex-row items-start gap-16 md:gap-32">
        <div className="md:w-1/3">
          <h2 className="text-4xl md:text-6xl font-serif text-[#2C2A26] leading-tight">
            Strategy meets <br /> execution.
          </h2>
        </div>
        <div className="md:w-2/3">
          <div className="max-w-2xl">
            <p className="text-lg md:text-xl text-[#5D5A53] font-light leading-relaxed mb-8">
              I am Saksham, a Product Leader with 7+ years of experience directing product strategy, scaling operations, and driving P&L impact across high-growth Fintech and cutting-edge AI sectors.
            </p>
            <p className="text-lg md:text-xl text-[#5D5A53] font-light leading-relaxed mb-8">
              With deep empathy for customers and a comprehensive understanding across business, technology, and AI, I bridge the gap between complex engineering challenges and tangible business value while delivering a compelling customer value proposition. From architecting Agentic AI healthcare solutions to managing a high-volume consumer lending portfolio, my philosophy remains the same: <strong>Solve real problems with clarity and precision.</strong>
            </p>

            <div className="mb-12">
              <a
                href={RESUME_DATA_URI}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 bg-[#2C2A26] text-[#F5F2EB] text-sm font-semibold uppercase tracking-widest hover:bg-[#444] transition-all duration-300 shadow-lg hover:-translate-y-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Resume
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 border-t border-[#A8A29E]/30 pt-8">
            <div>
              <h4 className="font-serif text-[#2C2A26] text-xl mb-4">Education</h4>
              <div className="space-y-4">
                <div>
                  <p className="font-medium text-[#5D5A53]">MBA (Strategy, Finance)</p>
                  <p className="text-sm text-[#A8A29E]">Management Development Institute, Gurgaon (2020)</p>
                </div>
                <div>
                  <p className="font-medium text-[#5D5A53]">B. Tech (Electrical)</p>
                  <p className="text-sm text-[#A8A29E]">Delhi Technological University (2016)</p>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-serif text-[#2C2A26] text-xl mb-4">Core Competencies</h4>
              <ul className="text-[#5D5A53] font-light space-y-2">
                <li>Product Vision & Strategy</li>
                <li>Agentic AI & Orchestration</li>
                <li>0-to-1 Product Innovation</li>
                <li>AI Evals & Observability</li>
              </ul>
            </div>
            <div>
              <h4 className="font-serif text-[#2C2A26] text-xl mb-4">Certifications</h4>
              <div className="space-y-4">
                <div>
                  <p className="font-medium text-[#5D5A53]">AI Governance</p>
                  <p className="text-sm text-[#A8A29E]">Lead Implementer of AI Management System (ISO/IEC 42001:2023)</p>
                </div>
                <div>
                  <p className="font-medium text-[#5D5A53]">Product Management</p>
                  <p className="text-sm text-[#A8A29E]">Mastering Product Management via Reforge</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#F5F2EB] px-6 py-16 md:px-12 md:py-20">
        <div className="mx-auto max-w-[1800px]">
          <div className="mb-12 flex flex-col items-start justify-between gap-8 border-b border-[#D6D1C7] pb-8 md:flex-row md:items-end">
            <div>
              <h3 className="text-4xl font-serif text-[#2C2A26] md:text-6xl">
                What I ship
              </h3>
            </div>
            <p className="max-w-2xl text-lg font-light leading-relaxed text-[#5D5A53] md:text-xl">
              I build regulated AI, fintech, and growth products from zero to one, then scale them with data, systems, and commercial ownership.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {capabilities.map(({ title, icon: Icon, evidence }) => (
              <article
                key={title}
                className="min-h-[280px] rounded-lg border border-[#D6D1C7] bg-[#EBE7DE] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#A8A29E] hover:bg-[#F0ECE3]"
              >
                <div className="mb-12 flex h-12 w-12 items-center justify-center rounded-lg border border-[#D6D1C7] bg-[#F5F2EB] text-[#8B7644]">
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <h4 className="mb-5 text-2xl font-serif font-medium text-[#2C2A26]">
                  {title}
                </h4>
                <p className="text-base font-light leading-7 text-[#5D5A53]">
                  {evidence}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;

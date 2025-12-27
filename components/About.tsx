/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { RESUME_DATA_URI } from '../constants';

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
        <div className="md:w-2/3 max-w-2xl">
          <p className="text-lg md:text-xl text-[#5D5A53] font-light leading-relaxed mb-8">
            I am Saksham, a Senior Product Manager obsessed with building scalable solutions in Fintech and Healthcare.
          </p>
          <p className="text-lg md:text-xl text-[#5D5A53] font-light leading-relaxed mb-8">
            With an MBA in Strategy & Finance and a deep technical understanding of AI, I bridge the gap between complex engineering challenges and tangible business value. Whether it's launching a neo-banking credit card or architecting an AI therapist, my philosophy remains the same: <strong>Solve real problems with clarity and precision.</strong>
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

          <div className="grid grid-cols-2 gap-8 mt-12 border-t border-[#A8A29E]/30 pt-8">
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
                <li>Go-To-Market (GTM)</li>
                <li>0-to-1 Product Innovation</li>
                <li>Data Analytics (SQL, Mixpanel)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
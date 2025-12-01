/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { EXPERIENCE } from '../constants';

const Experience: React.FC = () => {
  return (
    <section id="experience" className="py-24 px-6 md:px-12 bg-[#EBE7DE]">
      <div className="max-w-[1800px] mx-auto">
        <div className="mb-16">
          <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#A8A29E] mb-4">Professional Timeline</span>
          <h2 className="text-4xl md:text-5xl font-serif text-[#2C2A26]">Experience</h2>
        </div>

        <div className="relative border-l border-[#A8A29E]/30 ml-3 md:ml-6 space-y-16">
          {EXPERIENCE.map((exp, idx) => (
            <div key={idx} className="relative pl-8 md:pl-16">
              {/* Timeline Dot */}
              <div className="absolute left-[-5px] md:left-[-7px] top-2 w-2.5 h-2.5 md:w-3.5 md:h-3.5 bg-[#2C2A26] rounded-full border-2 border-[#EBE7DE]"></div>
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12">
                {/* Header: Role & Date */}
                <div className="lg:col-span-4">
                   <h3 className="text-2xl font-serif text-[#2C2A26] mb-1">{exp.company}</h3>
                   <p className="text-lg text-[#5D5A53] font-medium mb-2">{exp.role}</p>
                   <div className="flex flex-col gap-1 text-sm font-light uppercase tracking-wider text-[#A8A29E]">
                      <span>{exp.period}</span>
                      <span>{exp.location}</span>
                   </div>
                </div>

                {/* Content: Description */}
                <div className="lg:col-span-8">
                   <ul className="space-y-3">
                      {exp.description.map((item, i) => (
                        <li key={i} className="flex gap-3 text-[#5D5A53] font-light leading-relaxed">
                          <span className="mt-2 w-1.5 h-1.5 bg-[#A8A29E] rounded-full flex-shrink-0"></span>
                          <span>{item}</span>
                        </li>
                      ))}
                   </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Experience;
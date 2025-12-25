import React, { useMemo } from 'react';
import { EXPERIENCE } from '../constants';
import { Timeline } from './ui/timeline';

const Experience: React.FC = () => {

  const timelineData = useMemo(() => {
    return EXPERIENCE.map(exp => {
      // Extract year from period. Assuming format "Dec '24 - Present" or similar.
      // We look for the first 2-digit number following an apostrophe "'".
      const yearMatch = exp.period.match(/'(\d{2})/)
      const year = yearMatch ? `20${yearMatch[1]}` : exp.period

      return {
        title: year,
        content: (
          <div>
            <div className="mb-4">
              <h4 className="text-2xl md:text-3xl font-serif text-[#2C2A26] mb-1 font-bold">{exp.company}</h4>
              <p className="text-lg text-[#5D5A53] font-medium mb-2">{exp.role}</p>
              <div className="flex flex-col md:flex-row md:items-center gap-2 text-sm font-light uppercase tracking-wider text-[#A8A29E]">
                <span>{exp.period}</span>
                <span className="hidden md:inline">•</span>
                <span>{exp.location}</span>
              </div>
            </div>
            <ul className="space-y-3">
              {exp.description.map((item, i) => (
                <li key={i} className="flex gap-3 text-[#5D5A53] font-light leading-relaxed">
                  <span className="mt-2 w-1.5 h-1.5 bg-[#A8A29E] rounded-full flex-shrink-0"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      }
    });
  }, []);

  return (
    <section id="experience" className="bg-[#EBE7DE]">
      <Timeline data={timelineData} />
    </section>
  );
};

export default Experience;

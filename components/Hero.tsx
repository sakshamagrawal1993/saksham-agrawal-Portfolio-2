
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { TypingAnimation } from './ui/typing-animation';

const Hero: React.FC = () => {
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      const headerOffset = 85;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });

      try {
        window.history.pushState(null, '', `#${targetId}`);
      } catch (err) {
      }
    }
  };

  return (
    <section className="relative w-full h-screen min-h-[800px] overflow-hidden bg-[#D6D1C7]">

      {/* Background - Code/Tech abstract feel */}
      <div className="absolute inset-0 w-full h-full">
        <img
          src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=2000"
          alt="Modern Architecture"
          className="w-full h-full object-cover grayscale contrast-[0.8] brightness-[0.7]"
        />
        {/* Warm Overlay */}
        <div className="absolute inset-0 bg-[#433E38]/60 mix-blend-multiply"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-center items-start px-6 md:px-24 max-w-[1800px] mx-auto">
        <div className="animate-fade-in-up w-full md:w-2/3">
          <span className="block text-xs md:text-sm font-medium uppercase tracking-[0.2em] text-white/80 mb-6 px-4 py-2 border border-white/20 rounded-full w-fit">
            Senior Product Manager
          </span>
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif font-normal text-[#F5F2EB] italic tracking-tight mb-8 drop-shadow-sm leading-[1.1]">
            <TypingAnimation
              text="Saksham"
              as="span"
              className="text-6xl md:text-8xl lg:text-9xl font-serif font-normal text-[#F5F2EB] italic tracking-tight leading-[1.1] drop-shadow-sm"
              duration={80}
            />
            <br />
            <TypingAnimation
              text="Agrawal."
              as="span"
              className="text-6xl md:text-8xl lg:text-9xl font-serif font-normal text-[#F5F2EB] italic tracking-tight leading-[1.1] drop-shadow-sm"
              duration={80}
              delay={600}
            />
          </h1>
          <p className="max-w-xl text-lg md:text-xl text-white/90 font-light leading-relaxed mb-12 border-l border-white/30 pl-6">
            Building the next generation of AI & Fintech products.
            Currently transforming Healthcare at Jivi.ai.
          </p>

          <div className="flex gap-4">
            <a
              href="#work"
              onClick={(e) => handleNavClick(e, 'work')}
              className="px-8 py-4 bg-[#F5F2EB] text-[#2C2A26] text-sm font-semibold uppercase tracking-widest hover:bg-white transition-all duration-300 shadow-lg hover:translate-y-[-2px] flex items-center justify-center text-center"
            >
              View Projects
            </a>
            <a
              href="#contact"
              onClick={(e) => handleNavClick(e, 'contact')}
              className="px-8 py-4 bg-transparent border border-[#F5F2EB] text-[#F5F2EB] text-sm font-semibold uppercase tracking-widest hover:bg-[#F5F2EB] hover:text-[#2C2A26] transition-all duration-300 flex items-center justify-center text-center"
            >
              Contact
            </a>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce text-white/50 z-20">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>
  );
};

export default Hero;

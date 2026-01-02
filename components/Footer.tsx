
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';

interface FooterProps {
  onLinkClick: (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => void;
}

const Footer: React.FC<FooterProps> = ({ onLinkClick }) => {
  return (
    <footer id="contact" className="bg-[#EBE7DE] pt-24 pb-12 px-6 text-[#5D5A53]">
      <div className="max-w-[1800px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-12">

        <div className="md:col-span-4">
          <h4 className="text-2xl font-serif text-[#2C2A26] mb-6">Saksham Agrawal.</h4>
          <p className="max-w-xs font-light leading-relaxed mb-6">
            Senior Product Manager specializing in building exceptional AI and Fintech experiences.
            Open for collaborations and opportunities.
          </p>
          <a href="mailto:sakshamagrawal1993@gmail.com" className="text-[#2C2A26] border-b border-[#2C2A26] pb-1 hover:opacity-60 transition-opacity">sakshamagrawal1993@gmail.com</a>
        </div>

        <div className="md:col-span-2">
          <h4 className="font-medium text-[#2C2A26] mb-6 tracking-wide text-sm uppercase">Sitemap</h4>
          <ul className="space-y-4 font-light">
            <li><a href="#work" onClick={(e) => onLinkClick(e, 'work')} className="hover:text-[#2C2A26] transition-colors underline-offset-4 hover:underline">Products</a></li>
            <li><a href="#about" onClick={(e) => onLinkClick(e, 'about')} className="hover:text-[#2C2A26] transition-colors underline-offset-4 hover:underline">About</a></li>
            <li><a href="#journal" onClick={(e) => onLinkClick(e, 'journal')} className="hover:text-[#2C2A26] transition-colors underline-offset-4 hover:underline">Journal</a></li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <h4 className="font-medium text-[#2C2A26] mb-6 tracking-wide text-sm uppercase">Social</h4>
          <ul className="space-y-4 font-light">
            <li><a href="https://www.linkedin.com/in/saksham-agrawal/" target="_blank" rel="noreferrer" className="hover:text-[#2C2A26] transition-colors underline-offset-4 hover:underline">LinkedIn</a></li>
            <li><a href="https://github.com/sakshamagrawal1993" target="_blank" rel="noreferrer" className="hover:text-[#2C2A26] transition-colors underline-offset-4 hover:underline">GitHub</a></li>
            <li><a href="https://twitter.com" target="_blank" rel="noreferrer" className="hover:text-[#2C2A26] transition-colors underline-offset-4 hover:underline">Twitter/X</a></li>
          </ul>
        </div>


      </div>

      <div className="max-w-[1800px] mx-auto mt-20 pt-8 border-t border-[#D6D1C7] flex flex-col md:flex-row justify-between items-center text-xs uppercase tracking-widest opacity-60">
        <p>&copy; 2024 Saksham Agrawal</p>
        <p>Product & Strategy</p>
      </div>
    </footer>
  );
};

export default Footer;

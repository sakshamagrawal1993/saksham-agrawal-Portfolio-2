/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useEffect } from 'react';
import { BRAND_NAME } from '../constants';
import { BrandIcon } from './BrandIcon';
import { NavBar } from './ui/tubelight-navbar';
import { User, Briefcase, FileText, Send } from 'lucide-react';

interface NavbarProps {
  onNavClick: (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => void;
  activeSection?: string;
}

const Navbar: React.FC<NavbarProps> = ({ onNavClick, activeSection }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { name: 'About', url: '#about', icon: User },
    { name: 'Products', url: '#work', icon: Briefcase },
    { name: 'Journal', url: '#journal', icon: FileText },
    { name: 'Contact', url: '#contact', icon: Send }
  ];

  return (
    <>
      <nav
        className={`fixed top-0 left-0 z-50 p-6 md:p-8 transition-opacity duration-500 ${scrolled ? 'opacity-0 md:opacity-100' : 'opacity-100'
          }`}
      >
        {/* Logo - Hides on scroll on mobile to avoid cluttering the bottom nav view, but keeps visible on desktop */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            onNavClick(e, '');
          }}
          className="text-2xl font-serif font-bold tracking-tight text-[#2C2A26] flex items-center gap-2"
        >
          <BrandIcon className="w-10 h-10" isDark={true} />
        </a>
      </nav>

      {/* Tubelight Navbar - Fixed Top Center on Desktop, Bottom Center on Mobile */}
      <NavBar items={navItems} activeTab={activeSection} />
    </>
  );
};

export default Navbar;
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/



import React, { useState, useMemo } from 'react';
import { PROJECTS } from '../constants';
import { Project } from '../types';
import ProjectCard from './ProductCard';
import { useNavigate } from 'react-router-dom';

const categories = ['All', 'Healthcare AI', 'Fintech', 'Strategy', 'SaaS / Enterprise'];

interface ProductGridProps {
  onProductClick: (project: Project) => void;
  featuredOnly?: boolean;
}

const ProductGrid: React.FC<ProductGridProps> = ({ onProductClick, featuredOnly = false }) => {
  const [activeCategory, setActiveCategory] = useState('All');
  const navigate = useNavigate();

  const filteredProjects = useMemo(() => {
    if (featuredOnly) {
      // Show only specific featured items in order
      const featuredIds = ['insightslm', 'runner', 'p1', 'p2'];
      return featuredIds.map(id => PROJECTS.find(p => p.id === id)).filter((p): p is Project => !!p);
    }

    if (activeCategory === 'All') return PROJECTS;
    return PROJECTS.filter(p => p.category === activeCategory);
  }, [activeCategory, featuredOnly]);

  return (
    <section id="work" className="py-16 md:py-20 px-6 md:px-12 bg-[#F5F2EB]">
      <div className="max-w-[1800px] mx-auto">

        {/* Header Area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 pb-8 border-b border-[#D6D1C7]">
          <div>
            <h2 className="text-4xl md:text-6xl font-serif text-[#2C2A26]">The Portfolio</h2>
          </div>

          {/* View All Button - only show if featuredOnly */}
          {featuredOnly && (
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'instant' });
                navigate('/portfolio');
              }}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#2C2A26] hover:opacity-60 transition-opacity mt-8 md:mt-0"
            >
              View All Products
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
              </svg>
            </button>
          )}
        </div>

        {/* Minimal Filter - only show if NOT featuredOnly */}
        {!featuredOnly && (
          <div className="flex flex-wrap gap-8 mb-16 w-full">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-sm uppercase tracking-widest pb-1 border-b transition-all duration-300 ${activeCategory === cat
                  ? 'border-[#2C2A26] text-[#2C2A26]'
                  : 'border-transparent text-[#A8A29E] hover:text-[#2C2A26]'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Large Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-x-12 gap-y-24">
          {filteredProjects.map(project => (
            <ProjectCard key={project.id} project={project} onClick={onProductClick} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductGrid;
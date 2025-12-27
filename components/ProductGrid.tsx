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
    <section id="work" className="py-16 md:py-32 px-6 md:px-12 bg-[#F5F2EB]">
      <div className="max-w-[1800px] mx-auto">

        {/* Header Area */}
        <div className="flex flex-col items-center text-center mb-24 space-y-8">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#A8A29E]">Key Case Studies</span>
          <h2 className="text-4xl md:text-6xl font-serif text-[#2C2A26]">The Portfolio</h2>

          {/* Minimal Filter - only show if NOT featuredOnly */}
          {!featuredOnly && (
            <div className="flex flex-wrap justify-center gap-8 pt-4 border-t border-[#D6D1C7]/50 w-full max-w-2xl">
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
        </div>

        {/* Large Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-x-12 gap-y-24">
          {filteredProjects.map(project => (
            <ProjectCard key={project.id} project={project} onClick={onProductClick} />
          ))}
        </div>

        {/* View All Button - only show if featuredOnly */}
        {featuredOnly && (
          <div className="flex justify-center mt-24">
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'instant' });
                navigate('/portfolio');
              }}
              className="px-8 py-4 bg-transparent border border-[#2C2A26] text-[#2C2A26] text-sm font-semibold uppercase tracking-widest hover:bg-[#2C2A26] hover:text-[#F5F2EB] transition-all duration-300"
            >
              View All Products
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductGrid;
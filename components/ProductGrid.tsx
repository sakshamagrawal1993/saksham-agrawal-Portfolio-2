import React, { useMemo } from 'react';
import { PROJECTS } from '../constants';
import { Project } from '../types';
import ProjectCard from './ProductCard';
import { useProjectMetadata } from '../hooks/useProjectMetadata';

interface ProductGridProps {
  onProductClick: (project: Project) => void;
  featuredOnly?: boolean;
}

const ProductGrid: React.FC<ProductGridProps> = ({ onProductClick, featuredOnly = false }) => {
  const metadataMap = useProjectMetadata();

  const getMergedProject = (project: Project): Project => {
    const meta = metadataMap[project.id];
    return {
      ...project,
      imageUrl: meta?.image_url || project.imageUrl,
      slideDeckUrl: meta?.slide_deck_url || project.slideDeckUrl,
    };
  };

  const featuredProjects = useMemo(() => {
    if (featuredOnly) {
      const featuredIds = ['digital-twin', 'trading-agents', 'mind-coach', 'insightslm'];
      return featuredIds.map(id => PROJECTS.find(p => p.id === id)).filter((p): p is Project => !!p);
    }
    return [];
  }, [featuredOnly]);

  const jiviProjects = useMemo(() => PROJECTS.filter(p => p.company === 'Jivi AI'), []);
  const bharatpeProjects = useMemo(() => PROJECTS.filter(p => p.company === 'BharatPe'), []);
  const mvpProjects = useMemo(() => {
    const professionalDemoIds = new Set(['mind-coach', 'digital-twin', 'p3']);
    return PROJECTS.filter(p => p.demoUrl && p.demoUrl !== '#' && !professionalDemoIds.has(p.id));
  }, []);

  return (
    <section id="work" className="py-16 md:py-16 px-6 md:px-12 bg-[#F5F2EB]">
      <div className="max-w-[1800px] mx-auto">
        {featuredOnly ? (
          <>
            {/* Header Area for Featured */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 pb-6 border-b border-[#D6D1C7]">
              <div>
                <h2 className="text-4xl md:text-6xl font-serif text-[#2C2A26]">The Portfolio</h2>
              </div>
              <button
                onClick={() => {
                  window.location.href = '/portfolio';
                }}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#2C2A26] hover:opacity-60 transition-opacity mt-8 md:mt-0"
              >
                View All Products
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                </svg>
              </button>
            </div>
            {/* Large Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-x-12 gap-y-16">
              {featuredProjects.map(project => (
                <ProjectCard key={project.id} project={getMergedProject(project)} onClick={onProductClick} />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Header Area for Full Portfolio */}
            <div className="mb-16 pb-6 border-b border-[#D6D1C7]">
              <h2 className="text-4xl md:text-6xl font-serif text-[#2C2A26]">The Portfolio</h2>
            </div>

            {/* Section 1: Professional Projects */}
            <div className="mb-24">
              <h3 className="text-3xl font-serif text-[#2C2A26] mb-12 border-b border-[#D6D1C7] inline-block pb-2">1. Professional Projects</h3>

              {/* Subsection 1: Jivi AI */}
              <div className="mb-16">
                <h4 className="text-xl font-bold uppercase tracking-widest text-[#5D5A53] mb-8">Jivi AI</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-x-12 gap-y-16">
                  {jiviProjects.map(project => (
                    <ProjectCard key={project.id} project={getMergedProject(project)} onClick={onProductClick} />
                  ))}
                </div>
              </div>

              {/* Subsection 2: BharatPe */}
              <div>
                <h4 className="text-xl font-bold uppercase tracking-widest text-[#5D5A53] mb-8">BharatPe</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-x-12 gap-y-16">
                  {bharatpeProjects.map(project => (
                    <ProjectCard key={project.id} project={getMergedProject(project)} onClick={onProductClick} />
                  ))}
                </div>
              </div>
            </div>

            {/* Section 2: Showcase MVPs */}
            <div>
              <h3 className="text-3xl font-serif text-[#2C2A26] mb-12 border-b border-[#D6D1C7] inline-block pb-2">2. Showcase MVPs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-x-12 gap-y-16">
                {mvpProjects.map(project => (
                  <ProjectCard key={project.id} project={getMergedProject(project)} onClick={onProductClick} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default ProductGrid;


/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { Project } from '../types';
import { GlowingEffect } from './ui/glowing-effect';
import CreditCard from './ui/credit-card';
import { ShaderAnimation } from './ui/shader-animation';

interface ProjectCardProps {
  project: Project;
  onClick: (project: Project) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick }) => {
  return (
    <div className="group relative rounded-3xl h-full w-full p-4 cursor-pointer" onClick={() => onClick(project)}>
      <GlowingEffect blur={0} borderWidth={3} spread={80} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
      <div className="relative z-10 flex flex-col gap-6 h-full">
        <div className="relative w-full aspect-[16/9] overflow-hidden bg-[#EBE7DE] rounded-xl">
          {project.id === 'p3' ? (
            <div
              className="w-full h-full flex items-center justify-center bg-[#F5F2EB]"
            >
              <div className="scale-[0.85] origin-center">
                <CreditCard />
              </div>
            </div>
          ) : project.id === 'digital-twin' ? (
            <div className="w-full h-full overflow-hidden rounded-xl">
              <ShaderAnimation />
            </div>
          ) : (
            <>
              <img
                src={project.imageUrl}
                alt={project.name}
                className="w-full h-full object-cover transition-transform duration-1000 ease-in-out group-hover:scale-105 grayscale-[0.2] group-hover:grayscale-0"
              />
              <div className="absolute inset-0 bg-[#2C2A26]/0 group-hover:bg-[#2C2A26]/10 transition-colors duration-500 flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                  <span className="bg-white/90 backdrop-blur text-[#2C2A26] px-6 py-3 rounded-full text-xs uppercase tracking-widest font-medium">
                    View Case Study
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="text-left">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-3xl font-serif font-medium text-[#2C2A26] group-hover:opacity-70 transition-opacity">{project.name}</h3>
            <span className="text-xs font-bold uppercase tracking-widest border border-[#A8A29E] px-2 py-1 text-[#5D5A53] rounded">{project.category}</span>
          </div>
          <p className="text-lg font-light text-[#5D5A53] mb-3 tracking-wide">{project.tagline}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {project.techStack.slice(0, 3).map(tech => (
              <span key={tech} className="text-xs text-[#A8A29E] uppercase tracking-wider">#{tech}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
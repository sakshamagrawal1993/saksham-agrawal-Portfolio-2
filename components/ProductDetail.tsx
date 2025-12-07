/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '../types';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

const ProductDetail: React.FC<ProjectDetailProps> = ({ project, onBack }) => {
  const navigate = useNavigate();

  return (
    <div className="pt-24 min-h-screen bg-[#F5F2EB] animate-fade-in-up">
      <div className="max-w-[1800px] mx-auto px-6 md:px-12 pb-24">

        {/* Breadcrumb / Back */}
        <button
          onClick={onBack}
          className="group flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[#A8A29E] hover:text-[#2C2A26] transition-colors mb-8"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 group-hover:-translate-x-1 transition-transform">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Work
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">

          {/* Left: Images */}
          <div className="lg:col-span-7 flex flex-col gap-8">
            <div className="w-full aspect-video bg-[#EBE7DE] overflow-hidden">
              <img
                src={project.imageUrl}
                alt={project.name}
                className="w-full h-full object-cover animate-fade-in-up"
              />
            </div>
            {project.gallery?.slice(1).map((img, idx) => (
              <div key={idx} className="w-full aspect-video bg-[#EBE7DE] overflow-hidden">
                <img src={img} alt="Detail" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>

          {/* Right: Details */}
          <div className="lg:col-span-5 flex flex-col lg:sticky lg:top-32 h-fit">
            <span className="text-sm font-medium text-[#A8A29E] uppercase tracking-widest mb-2">{project.category}</span>
            <h1 className="text-4xl md:text-5xl font-serif text-[#2C2A26] mb-4">{project.name}</h1>
            <p className="text-xl font-light text-[#2C2A26] mb-8">{project.tagline}</p>

            <div className="flex gap-4 mb-8">
              {project.demoUrl && (
                <button
                  onClick={() => {
                    if (project.demoUrl?.startsWith('/')) {
                      // Use client-side navigation for internal apps (SPA)
                      // This avoids 404s from server-side routing on Vercel
                      navigate(project.demoUrl);
                    } else {
                      window.open(project.demoUrl, '_blank');
                    }
                  }}
                  className="flex-1 py-4 bg-[#2C2A26] text-[#F5F2EB] text-center uppercase tracking-widest text-sm font-medium hover:bg-[#433E38] transition-colors"
                >
                  Live Demo
                </button>
              )}
              {project.repoUrl && (
                <a href={project.repoUrl} className="flex-1 py-4 border border-[#2C2A26] text-[#2C2A26] text-center uppercase tracking-widest text-sm font-medium hover:bg-[#2C2A26] hover:text-[#F5F2EB] transition-colors">
                  View Code
                </a>
              )}
            </div>

            <div className="mb-12">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#2C2A26] mb-4">About the Project</h3>
              <p className="text-[#5D5A53] leading-relaxed font-light text-lg mb-8">
                {project.longDescription || project.description}
              </p>
            </div>

            <div className="mb-8">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#2C2A26] mb-4">Role</h3>
              <p className="text-[#5D5A53]">{project.role}</p>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#2C2A26] mb-4">Tech Stack</h3>
              <div className="flex flex-wrap gap-2">
                {project.techStack.map(tech => (
                  <span key={tech} className="bg-[#EBE7DE] px-3 py-1 text-sm text-[#5D5A53] rounded-sm">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
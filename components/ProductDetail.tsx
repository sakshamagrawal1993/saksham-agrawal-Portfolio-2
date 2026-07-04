/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { Project } from '../types';
import CreditCard from './ui/credit-card';
import { ShaderAnimation } from './ui/shader-animation';
import { useNavigate } from 'react-router-dom';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

const CASE_STUDY_SECTION_ID = 'case-study';
const HEALTH_TWIN_WALKTHROUGH_EMBED_URL = 'https://www.youtube-nocookie.com/embed/5NH8JYPBPVk?rel=0';
const HEALTH_TWIN_SHORTS_EMBED_URL = 'https://www.youtube-nocookie.com/embed/IcV-6lwGv74?rel=0';
const DR_JIVI_WALKTHROUGH_EMBED_URL = 'https://www.youtube-nocookie.com/embed/gqfU1VsBQe8?rel=0';

const scrollToCaseStudy = () => {
  const section = document.getElementById(CASE_STUDY_SECTION_ID);
  if (!section) return;
  const headerOffset = 88;
  const top = section.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({ top, behavior: 'smooth' });
};

interface CaseStudySectionProps {
  project: Project;
  className?: string;
}

const CaseStudySection: React.FC<CaseStudySectionProps> = ({ project, className = '' }) => {
  if (!project.slideDeckUrl) return null;

  return (
    <section
      id={CASE_STUDY_SECTION_ID}
      className={`scroll-mt-24 ${className}`}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-bold uppercase tracking-widest text-[#2C2A26]">Case Study</h2>
        <a
          href={project.slideDeckUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full border border-[#2C2A26] px-4 py-2 text-xs font-medium uppercase tracking-widest text-[#2C2A26] transition-colors hover:bg-[#2C2A26] hover:text-[#F5F2EB]"
        >
          Open Case Study
        </a>
      </div>

      <div className="w-full h-[50vh] min-h-[280px] md:h-[72vh] md:min-h-[480px] lg:min-h-[560px] max-h-[960px] bg-[#EBE7DE] rounded-xl overflow-hidden border border-[#D6D1C7] shadow-sm">
        <iframe
          src={`${project.slideDeckUrl}#view=FitH&navpanes=0`}
          className="hidden h-full w-full border-0 md:block"
          title={`${project.name} Case Study`}
        />
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center md:hidden">
          <p className="max-w-sm text-sm leading-relaxed text-[#5D5A53]">
            The embedded deck can be unreliable on mobile. Open the full case study in a new tab for the best reading experience.
          </p>
          <a
            href={project.slideDeckUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full bg-[#2C2A26] px-6 py-3 text-xs font-medium uppercase tracking-widest text-[#F5F2EB] transition-colors hover:bg-[#433E38]"
          >
            Open Case Study
          </a>
        </div>
      </div>
    </section>
  );
};

const ProductDetail: React.FC<ProjectDetailProps> = ({ project, onBack }) => {
  const navigate = useNavigate();
  const hasCaseStudy = Boolean(project.slideDeckUrl);

  const openLiveDemo = () => {
    if (!project.demoUrl) return;
    if (project.demoUrl.startsWith('/')) {
      navigate(project.demoUrl);
      return;
    }
    window.open(project.demoUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`pt-4 min-h-screen bg-[#F5F2EB] animate-fade-in-up ${project.id === 'p3' ? 'md:pt-14' : 'md:pt-24'}`}>
      <div className="max-w-[1800px] mx-auto px-6 md:px-12 pb-24">

        {/* Breadcrumb / Back */}
        <button
          onClick={onBack}
          className={`group flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[#A8A29E] hover:text-[#2C2A26] transition-colors ${project.id === 'p3' ? 'mb-5' : 'mb-8'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 group-hover:-translate-x-1 transition-transform">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Work
        </button>

        {project.id === 'p3' ? (
          <div className="flex flex-col gap-7">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6 lg:gap-10">
              <div className="relative h-[180px] lg:h-[220px] flex items-center justify-center bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl overflow-hidden">
                <div className="w-[640px] shrink-0 scale-[0.48] sm:scale-[0.55] lg:scale-[0.58] origin-center">
                  <CreditCard />
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)] gap-5 xl:gap-10">
                <div>
                  <span className="block text-xs font-medium text-[#A8A29E] uppercase tracking-widest mb-1">{project.category}</span>
                  <h1 className="text-3xl md:text-4xl font-serif text-[#2C2A26] leading-tight mb-2">{project.name}</h1>
                  <p className="text-lg font-light text-[#2C2A26] mb-4">{project.tagline}</p>
                  {hasCaseStudy && (
                    <button
                      type="button"
                      onClick={scrollToCaseStudy}
                      className="mb-4 inline-flex items-center justify-center rounded-full border border-[#2C2A26] px-4 py-2 text-xs font-medium uppercase tracking-widest text-[#2C2A26] transition-colors hover:bg-[#2C2A26] hover:text-[#F5F2EB] lg:hidden"
                    >
                      View Case Study
                    </button>
                  )}
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#2C2A26] mb-2">About the Project</h3>
                  <p className="text-[#5D5A53] leading-relaxed font-light text-base">
                    {project.longDescription || project.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-5 content-start">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#2C2A26] mb-2">Role</h3>
                    <p className="text-sm text-[#5D5A53]">{project.role}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#2C2A26] mb-2">Tech Stack</h3>
                    <div className="flex flex-wrap gap-2">
                      {project.techStack.map(tech => (
                        <span key={tech} className="bg-[#EBE7DE] px-2.5 py-1 text-xs text-[#5D5A53] rounded-sm">
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <CaseStudySection project={project} />
          </div>
        ) : (
          <div className="flex flex-col gap-12 lg:gap-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">

            {/* Left: Images */}
            <div className="lg:col-span-7 flex flex-col gap-8">
              {project.id === 'digital-twin' ? (
                <div className="w-full aspect-video overflow-hidden rounded-xl">
                  <ShaderAnimation />
                </div>
              ) : (
                <div className="w-full aspect-video bg-[#EBE7DE] overflow-hidden">
                  <img
                    src={project.imageUrl}
                    alt={project.name}
                    className="w-full h-full object-cover animate-fade-in-up"
                  />
                </div>
              )}

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

              <div className="flex flex-col gap-3 sm:flex-row mb-8">
                {project.demoUrl && (
                  <button
                    onClick={openLiveDemo}
                    className="flex-1 py-4 bg-[#2C2A26] text-[#F5F2EB] text-center uppercase tracking-widest text-sm font-medium hover:bg-[#433E38] transition-colors"
                  >
                    Live Demo
                  </button>
                )}
                {hasCaseStudy && (
                  <button
                    type="button"
                    onClick={scrollToCaseStudy}
                    className="flex-1 py-4 border border-[#2C2A26] text-[#2C2A26] text-center uppercase tracking-widest text-sm font-medium hover:bg-[#2C2A26] hover:text-[#F5F2EB] transition-colors lg:hidden"
                  >
                    View Case Study
                  </button>
                )}
              </div>

              <div className="mb-12">
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#2C2A26] mb-4">About the Project</h3>
                <p className="text-[#5D5A53] leading-relaxed font-light text-lg mb-4">
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

          {project.id === 'digital-twin' && (
            <section className="flex flex-col gap-5 md:gap-8">
              <h2 className="text-base font-bold uppercase tracking-widest text-[#2C2A26]">
                Health Twin Product Walkthrough
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-start">
                <div className="overflow-hidden rounded-xl border border-[#D6D1C7] bg-[#EBE7DE] shadow-sm">
                  <div className="aspect-video overflow-hidden">
                    <iframe
                      src={HEALTH_TWIN_WALKTHROUGH_EMBED_URL}
                      className="h-full w-full border-0"
                      title="Health Twin Concept Walkthrough"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                  <div className="p-4 bg-white">
                    <h3 className="font-serif text-lg text-[#2C2A26]">Concept walkthrough</h3>
                    <p className="mt-1 text-sm text-[#5D5A53]">How Health Twin context powers personalized health guidance.</p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-[#D6D1C7] bg-[#EBE7DE] shadow-sm">
                  <div className="flex justify-center bg-[#F5F2EB] py-4">
                    <div className="w-full max-w-[240px] overflow-hidden rounded-xl border border-[#D6D1C7] bg-[#EBE7DE]">
                      <div className="aspect-[9/16] overflow-hidden">
                        <iframe
                          src={HEALTH_TWIN_SHORTS_EMBED_URL}
                          className="h-full w-full border-0"
                          title="Health Twin Smart Health Concept Demo"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-white">
                    <h3 className="font-serif text-lg text-[#2C2A26]">Smart Health interface</h3>
                    <p className="mt-1 text-sm text-[#5D5A53]">Biomarker dashboards, insights, and coach-led next actions.</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {project.id === 'dr-jivi' && (
            <section className="flex flex-col gap-5 md:gap-8">
              <h2 className="text-base font-bold uppercase tracking-widest text-[#2C2A26]">
                Dr. Jivi Product Walkthrough
              </h2>

              <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-[#D6D1C7] bg-[#EBE7DE] shadow-sm">
                <div className="aspect-[16/10] max-h-[220px] overflow-hidden sm:max-h-none sm:aspect-video">
                  <iframe
                    src={DR_JIVI_WALKTHROUGH_EMBED_URL}
                    className="h-full w-full border-0"
                    title="Dr. Jivi Concept Walkthrough"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </div>
            </section>
          )}

          <CaseStudySection project={project} />

          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetail;

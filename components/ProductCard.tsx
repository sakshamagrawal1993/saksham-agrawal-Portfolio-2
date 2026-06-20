
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
  const ribbonText = project.ribbonLabel || (project.status === 'completed' ? 'Completed' : 'In Development');
  const ribbonWidthClassName = ribbonText.length > 14
    ? 'w-[270px]'
    : ribbonText.length > 9
      ? 'w-[238px]'
      : 'w-[214px]';
  const statusLabel = project.status === 'completed'
    ? {
      text: ribbonText,
      widthClassName: ribbonWidthClassName,
      faceGradient: 'linear-gradient(100deg, #18884E 0%, #2FA866 58%, #70D893 100%)',
      foldGradient: 'linear-gradient(145deg, #115D36 0%, #1E7C49 62%, #0D3D26 100%)',
    }
    : project.status === 'under-development'
      ? {
        text: ribbonText,
        widthClassName: ribbonWidthClassName,
        faceGradient: 'linear-gradient(100deg, #C76616 0%, #E88A2E 58%, #FFB05E 100%)',
        foldGradient: 'linear-gradient(145deg, #7F3F0D 0%, #A95B1D 62%, #5C2D09 100%)',
      }
      : null;

  return (
    <div className="group relative rounded-3xl h-full w-full p-4 cursor-pointer" onClick={() => onClick(project)}>
      <GlowingEffect blur={0} borderWidth={3} spread={80} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
      <div className="relative z-10 flex flex-col gap-6 h-full">

        <div className="relative isolate w-full aspect-[16/9] shrink-0">
          {statusLabel && (
            <>
              <div
                className="pointer-events-none absolute -right-10 top-7 z-30 h-[48px] overflow-hidden text-white shadow-[0_12px_18px_rgba(44,42,38,0.24)]"
                style={{
                  background: statusLabel.faceGradient,
                  clipPath: 'polygon(0 0, 88% 0, 100% 100%, 11% 100%, 0 50%, 11% 0)',
                }}
              >
                <div className="absolute inset-0 bg-[linear-gradient(108deg,transparent_0%,transparent_55%,rgba(255,255,255,0.28)_72%,transparent_88%)]" />
                <div className={`flex h-full items-center justify-center pl-9 pr-9 text-[11px] font-bold uppercase tracking-[0.17em] drop-shadow-sm ${statusLabel.widthClassName}`}>
                  {statusLabel.text}
                </div>
              </div>

              <div
                className="pointer-events-none absolute -right-4 top-[72px] z-0 h-[56px] w-[76px] rounded-br-[24px] shadow-[0_14px_18px_rgba(44,42,38,0.22)]"
                style={{
                  background: statusLabel.foldGradient,
                  clipPath: 'polygon(0 0, 100% 0, 100% 76%, 46% 100%)',
                }}
              />

              <div
                className="pointer-events-none absolute -right-5 top-[72px] z-20 h-[14px] w-[36px] bg-black/25"
                style={{ clipPath: 'polygon(0 0, 100% 0, 82% 100%)' }}
              />
            </>
          )}

          <div className="absolute inset-0 z-10 overflow-hidden bg-[#EBE7DE] rounded-xl">
            {project.id === 'p3' ? (
              <div
                className="absolute inset-0 flex items-center justify-center bg-[#F5F2EB]"
              >
                <div className="scale-[0.85] origin-center">
                  <CreditCard />
                </div>
              </div>
            ) : project.id === 'digital-twin' ? (
              <div className="absolute inset-0 overflow-hidden rounded-xl">
                <ShaderAnimation />
              </div>
            ) : (
              <>
                <img
                  src={project.imageUrl}
                  alt={project.name}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 ease-in-out group-hover:scale-105 grayscale-[0.2] group-hover:grayscale-0"
                />
                <div className="absolute inset-0 bg-[#2C2A26]/5 md:bg-[#2C2A26]/0 md:group-hover:bg-[#2C2A26]/10 transition-colors duration-500 flex items-center justify-center">
                  <div className="opacity-100 translate-y-0 transition-all duration-500 md:opacity-0 md:translate-y-4 md:group-hover:opacity-100 md:group-hover:translate-y-0">
                    <span className="bg-white/90 backdrop-blur text-[#2C2A26] px-6 py-3 rounded-full text-xs uppercase tracking-widest font-medium">
                      View Case Study
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="text-left">
          <div className="flex justify-between items-start mb-2">
            <div className="pr-4">
              <h3 className="text-3xl font-serif font-medium text-[#2C2A26] group-hover:opacity-70 transition-opacity">{project.name}</h3>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="text-xs font-bold uppercase tracking-widest border border-[#A8A29E] px-2 py-1 text-[#5D5A53] rounded">{project.category}</span>
            </div>
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

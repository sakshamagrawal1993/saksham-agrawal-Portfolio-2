/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { JournalArticle } from '../types';
import CommentSection from './CommentSection';

interface JournalDetailProps {
  article: JournalArticle;
  onBack: () => void;
}

const JournalDetail: React.FC<JournalDetailProps> = ({ article: initialArticle, onBack }) => {
  const [article, setArticle] = React.useState<JournalArticle | null>(initialArticle || null);

  // If initialArticle is missing, we might need to fetch it (e.g. direct link)
  // But currently parent passes it. If we want to support direct linking where parent doesn't have it, 
  // we should handle it in the parent or here. 
  // Given App.tsx structure: params -> find in constant -> pass prop.
  // We need to change App.tsx to fetch if not found (or always fetch).
  // For now, let's assume article is passed, BUT content is now HTML string, not ReactNode.

  // Actually, App.tsx passes "article" from constants which has ReactNode content.
  // We are migrating to Supabase where content is string. 
  // We need to handle both or migrate completely. 
  // The plan is to migrate completely.

  // So, let's just render the content as HTML.

  return (
    <div className="min-h-screen bg-[#F5F2EB] animate-fade-in-up">
      {/* Hero Image for Article - Full bleed to top so navbar sits on it */}
      <div className="w-full h-[50vh] md:h-[60vh] relative overflow-hidden">
        <img
          src={article?.image}
          alt={article?.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20"></div>
      </div>

      <div className="max-w-3xl mx-auto px-6 md:px-12 -mt-32 relative z-10 pb-32">
        <div className="bg-[#F5F2EB] p-8 md:p-16 shadow-xl shadow-[#2C2A26]/5">
          <div className="flex justify-between items-center mb-12 border-b border-[#D6D1C7] pb-8">
            <button
              onClick={onBack}
              className="group flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[#A8A29E] hover:text-[#2C2A26] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 group-hover:-translate-x-1 transition-transform">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back to Journal
            </button>
            <span className="text-xs font-medium uppercase tracking-widest text-[#A8A29E]">{article?.date}</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-serif text-[#2C2A26] mb-12 leading-tight text-center">
            {article?.title}
          </h1>

          <div
            className="prose prose-stone prose-lg mx-auto font-light leading-loose text-[#5D5A53]"
            dangerouslySetInnerHTML={{ __html: article?.content as string || '' }}
          />

          <div className="mt-16 pt-12 border-t border-[#D6D1C7] flex justify-center">
            <span className="text-2xl font-serif italic text-[#2C2A26]">Aura</span>
          </div>

          {article?.id && <CommentSection articleId={String(article.id)} />}
        </div>
      </div>
    </div>
  );
};



export default JournalDetail;


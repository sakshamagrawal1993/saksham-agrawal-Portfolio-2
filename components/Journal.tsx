/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useEffect, useState } from 'react';
import { blogService, Post } from '../services/blog';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const Journal: React.FC = () => {
  const [articles, setArticles] = useState<Post[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const loadArticles = async () => {
      try {
        const data = await blogService.getPosts(true); // true = published only
        setArticles(data.slice(0, 3));
      } catch (error) {
        console.error('Failed to load journal articles', error);
      }
    };
    loadArticles();
  }, []);

  return (
    <section id="journal" className="bg-[#F5F2EB] py-32 px-6 md:px-12">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 pb-8 border-b border-[#D6D1C7]">
          <div>
            <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#A8A29E] mb-4">Editorial</span>
            <h2 className="text-4xl md:text-6xl font-serif text-[#2C2A26]">The Journal</h2>
          </div>
          <button
            onClick={() => navigate('/journal')}
            className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#2C2A26] hover:opacity-60 transition-opacity mt-8 md:mt-0"
          >
            View All Articles
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {articles.map((article) => (
            <div key={article.id} className="group cursor-pointer flex flex-col text-left" onClick={() => navigate(`/journal/${article.slug}`)}>
              <div className="w-full aspect-[4/3] overflow-hidden mb-8 bg-[#EBE7DE]">
                {article.cover_image_url ? (
                  <img
                    src={article.cover_image_url}
                    alt={article.title}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 grayscale-[0.2] group-hover:grayscale-0"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#EBE7DE] text-brand-gray/30 text-4xl font-serif">
                    {article.title.charAt(0)}
                  </div>
                )}

              </div>
              <div className="flex flex-col flex-1 text-left">
                <span className="text-xs font-medium uppercase tracking-widest text-[#A8A29E] mb-3">{format(new Date(article.created_at), 'MMM dd, yyyy')}</span>
                <h3 className="text-2xl font-serif text-[#2C2A26] mb-4 leading-tight group-hover:underline decoration-1 underline-offset-4">{article.title}</h3>
                <p className="text-[#5D5A53] font-light leading-relaxed line-clamp-3">{article.excerpt}</p>
              </div>
            </div>
          ))}
        </div>

        {articles.length === 0 && (
          <div className="text-center text-[#A8A29E] italic py-12">
            Loading journal entries...
          </div>
        )}

        <div className="mt-12 md:hidden flex justify-center">
          <button
            onClick={() => navigate('/journal')}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#2C2A26] hover:opacity-60 transition-opacity"
          >
            View All Articles
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
};

export default Journal;

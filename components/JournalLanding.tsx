
import React, { useEffect, useState } from 'react';
import { journalService } from '../services/journal';
import { JournalArticle } from '../types';
import { useNavigate } from 'react-router-dom';
import { GlowCard } from './ui/spotlight-card';

const JournalLanding: React.FC = () => {
    const [articles, setArticles] = useState<JournalArticle[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        const loadArticles = async () => {
            try {
                const data = await journalService.getArticles();
                setArticles(data);
            } catch (error) {
                console.error('Failed to load journal articles', error);
            }
        };
        loadArticles();
    }, []);

    return (
        <div className="min-h-screen bg-[#F5F2EB] py-32 px-6 md:px-12 animate-fade-in-up">
            <div className="max-w-[1000px] mx-auto">
                <div className="mb-20 text-center">
                    <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#A8A29E] mb-4">Editorial</span>
                    <h1 className="text-4xl md:text-6xl font-serif text-[#2C2A26]">The Journal</h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {articles.map((article) => (
                        <GlowCard
                            key={article.id}
                            glowColor="orange"
                            customSize={true}
                            className="w-full h-full cursor-pointer group !p-0"
                            onClick={() => navigate(`/journal/${article.id}`)}
                        >
                            <div className="flex flex-col h-full bg-[#EBE7DE]/30">
                                <div className="w-full aspect-[4/3] overflow-hidden bg-[#EBE7DE]">
                                    <img
                                        src={article.image}
                                        alt={article.title}
                                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 grayscale-[0.2] group-hover:grayscale-0"
                                    />
                                </div>
                                <div className="flex flex-col text-left p-6 flex-grow">
                                    <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-[#A8A29E] mb-3">
                                        <span>{article.date}</span>
                                        <span className="w-1 h-1 rounded-full bg-[#A8A29E]"></span>
                                        <span>Saksham</span>
                                    </div>
                                    <h2 className="text-xl font-serif text-[#2C2A26] mb-3 leading-tight group-hover:text-[#A84A00] transition-colors">{article.title}</h2>
                                    <p className="text-[#5D5A53] font-light leading-relaxed line-clamp-3 mb-4 text-sm flex-grow">{article.excerpt}</p>
                                    <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-[#2C2A26] border-b border-[#2C2A26] pb-1 self-start group-hover:border-[#A84A00] group-hover:text-[#A84A00] transition-colors">Read Article</span>
                                </div>
                            </div>
                        </GlowCard>
                    ))}
                </div>

                {articles.length === 0 && (
                    <div className="text-center text-[#A8A29E] italic py-12">
                        Loading journal entries...
                    </div>
                )}
            </div>
        </div>
    );
};

export default JournalLanding;

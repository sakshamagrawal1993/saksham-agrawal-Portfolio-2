
import React, { useEffect, useState } from 'react';
import { journalService } from '../services/journal';
import { JournalArticle } from '../types';
import { useNavigate } from 'react-router-dom';

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

                <div className="space-y-20">
                    {articles.map((article) => (
                        <div key={article.id} className="group cursor-pointer grid grid-cols-1 md:grid-cols-2 gap-12 items-center" onClick={() => navigate(`/journal/${article.id}`)}>
                            <div className="w-full aspect-[4/3] overflow-hidden bg-[#EBE7DE] order-last md:order-first">
                                <img
                                    src={article.image}
                                    alt={article.title}
                                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 grayscale-[0.2] group-hover:grayscale-0"
                                />
                            </div>
                            <div className="flex flex-col text-left">
                                <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-[#A8A29E] mb-4">
                                    <span>{article.date}</span>
                                    <span className="w-1 h-1 rounded-full bg-[#A8A29E]"></span>
                                    <span>Saksham Agrawal</span>
                                </div>
                                <h2 className="text-3xl font-serif text-[#2C2A26] mb-6 leading-tight group-hover:underline decoration-1 underline-offset-4">{article.title}</h2>
                                <p className="text-[#5D5A53] font-light leading-relaxed line-clamp-3 mb-6 text-lg">{article.excerpt}</p>
                                <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#2C2A26] border-b border-[#2C2A26] pb-1 self-start">Read Article</span>
                            </div>
                        </div>
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

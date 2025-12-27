
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { GlowCard } from '../ui/spotlight-card';

interface BlogCardProps {
    post: {
        id?: string; // Optional if using slug for nav
        slug: string;
        title: string;
        excerpt?: string;
        cover_image_url?: string;
        created_at: string;
        author?: {
            full_name?: string;
        }
    };
}

const BlogCard: React.FC<BlogCardProps> = ({ post }) => {
    const navigate = useNavigate();

    return (
        <GlowCard
            glowColor="orange"
            customSize={true}
            className="group cursor-pointer w-full h-full !p-0"
            onClick={() => navigate(`/journal/${post.slug}`)}
        >
            <div className="flex flex-col h-full rounded-2xl overflow-hidden">
                <div className="w-full aspect-[4/3] overflow-hidden mb-6 bg-brand-light">
                    {post.cover_image_url ? (
                        <img
                            src={post.cover_image_url}
                            alt={post.title}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#EBE7DE] text-brand-gray/30 font-serif text-4xl">
                            {post.title.charAt(0)}
                        </div>
                    )}
                </div>
                <div className="flex flex-col flex-1 text-left px-4 pb-4">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-brand-gray mb-3">
                        <span>{format(new Date(post.created_at), 'MMM dd, yyyy')}</span>
                    </div>
                    <h3 className="text-2xl font-serif text-brand-dark mb-3 leading-tight group-hover:text-[#A84A00] transition-colors">
                        {post.title}
                    </h3>
                    <p className="text-brand-text font-light leading-relaxed line-clamp-3 text-sm">
                        {post.excerpt}
                    </p>
                </div>
            </div>
        </GlowCard>
    );
};

export default BlogCard;

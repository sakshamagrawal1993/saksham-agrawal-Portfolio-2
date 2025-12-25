
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

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
        <div
            className="group cursor-pointer flex flex-col text-left"
            onClick={() => navigate(`/journal/${post.slug}`)}
        >
            <div className="w-full aspect-[16/9] overflow-hidden mb-6 bg-brand-light border border-brand-gray/10 rounded-sm">
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
            <div className="flex flex-col flex-1 text-left">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-brand-gray mb-3">
                    <span>{format(new Date(post.created_at), 'MMM dd, yyyy')}</span>
                </div>
                <h3 className="text-2xl font-serif text-brand-dark mb-3 leading-tight group-hover:underline decoration-1 underline-offset-4">
                    {post.title}
                </h3>
                <p className="text-brand-text font-light leading-relaxed line-clamp-3">
                    {post.excerpt}
                </p>
            </div>
        </div>
    );
};

export default BlogCard;

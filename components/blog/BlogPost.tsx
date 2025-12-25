
import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { blogService } from '../../services/blog';
import PostViewer from './PostViewer';
import SEOHead from '../SEOHead';
import CommentSection from '../CommentSection'; // Reusing your existing comment component
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const BlogPost: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();

    const { data: post, isLoading, error } = useQuery({
        queryKey: ['blog-post', slug],
        queryFn: () => blogService.getPostBySlug(slug!),
        enabled: !!slug,
    });

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-brand-light">
                <Loader2 className="w-8 h-8 animate-spin text-brand-dark" />
            </div>
        );
    }

    if (error || !post) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-brand-light text-brand-text">
                Post not found.
            </div>
        );
    }

    return (
        <>
            <SEOHead
                title={post.title}
                description={post.excerpt}
                image={post.cover_image_url}
            />
            <div className="min-h-screen bg-brand-light pt-32 pb-20 animate-fade-in-up">
                <article className="max-w-3xl mx-auto px-6">
                    <header className="mb-12 text-center">
                        <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-widest text-brand-gray mb-6">
                            <span>{format(new Date(post.created_at), 'MMMM dd, yyyy')}</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-serif text-brand-dark mb-8 leading-tight">
                            {post.title}
                        </h1>
                        {post.cover_image_url && (
                            <div className="w-full aspect-[21/9] overflow-hidden rounded-sm mb-12 bg-gray-100">
                                <img
                                    src={post.cover_image_url}
                                    alt={post.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                    </header>

                    <div className="mb-20">
                        <PostViewer content={post.content} />
                    </div>

                    <hr className="border-brand-gray/20 mb-16" />

                    <div className="bg-white/50 p-8 rounded-sm">
                        {/* Reusing the CommentSection you already built, but passing the UUID logic */}
                        <CommentSection articleId={post.id} />
                    </div>
                </article>
            </div>
        </>
    );
};

export default BlogPost;

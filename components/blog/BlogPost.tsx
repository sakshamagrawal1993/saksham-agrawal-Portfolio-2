
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { blogService } from '../../services/blog';
import PostViewer from './PostViewer';
import ShareButtons from '../ui/ShareButtons';
import SEOHead from '../SEOHead';
import CommentSection from '../CommentSection'; // Reusing your existing comment component
import { Loader2, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import ScrollProgress from '../ui/ScrollProgress';

const BlogPost: React.FC = () => {
    const navigate = useNavigate();
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
            <ScrollProgress />
            <SEOHead
                title={post.title}
                description={post.excerpt}
                image={post.cover_image_url}
            />
            <div className="min-h-screen bg-brand-light pt-32 pb-20 animate-fade-in-up relative">
                <button
                    onClick={() => navigate('/journal')}
                    className="fixed top-24 left-6 md:left-12 z-40 text-brand-gray hover:text-brand-dark transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-brand-light/80 backdrop-blur-sm px-3 py-2 rounded-full border border-transparent hover:border-brand-dark/10"
                    title="Back to Journal"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>

                <article className="max-w-3xl mx-auto px-6">
                    <header className="mb-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-4 mb-8">
                            <span className="text-xs font-medium uppercase tracking-widest text-brand-gray border-b border-brand-gray/20 pb-1">
                                {format(new Date(post.created_at), 'MMMM dd, yyyy')}
                            </span>
                        </div>

                        <h1 className="text-4xl md:text-6xl font-serif text-brand-dark mb-8 leading-tight">
                            {post.title}
                        </h1>

                        <div className="flex items-center justify-center gap-4 mb-12">
                            {/* Author Byline */}
                            <div className="flex items-center gap-3 text-left">
                                <div className="w-10 h-10 rounded-full bg-brand-gray/20 overflow-hidden">
                                    {/* Placeholder for Author Image - replace with actual if available */}
                                    {/* <img src="..." alt="Saksham Agrawal" /> */}
                                    <div className="w-full h-full flex items-center justify-center bg-brand-dark text-white font-serif font-bold">S</div>
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-brand-dark">Saksham Agrawal</div>
                                    <div className="text-xs text-brand-gray">Product Manager and Builder</div>
                                </div>
                            </div>
                        </div>

                        {post.cover_image_url && (
                            <div className="w-full aspect-video overflow-hidden rounded-sm mb-12 bg-gray-100 shadow-sm">
                                <img
                                    src={post.cover_image_url}
                                    alt={post.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                    </header>

                    <div className="mb-12">
                        <PostViewer content={post.content} />
                    </div>

                    <div className="flex justify-between items-center py-8 border-t border-b border-brand-gray/10 mb-16">
                        <div className="text-sm font-serif italic text-brand-gray">
                            Thanks for reading. Link to share:
                        </div>
                        <ShareButtons title={post.title} />
                    </div>

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

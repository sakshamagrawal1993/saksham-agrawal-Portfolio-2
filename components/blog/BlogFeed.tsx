
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { blogService } from '../../services/blog';
import BlogCard from './BlogCard';
import SEOHead from '../SEOHead';
import { Loader2, LogIn, LayoutDashboard, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const BlogFeed: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { data: posts, isLoading, error } = useQuery({
        queryKey: ['blog-posts'],
        queryFn: () => blogService.getPosts(true),
    });

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-brand-light">
                <Loader2 className="w-8 h-8 animate-spin text-brand-dark" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-brand-light text-red-500">
                Failed to load posts.
            </div>
        );
    }

    return (
        <>
            <SEOHead
                title="Blog"
                description="Thoughts on Product Management, AI, and Engineering."
            />
            <div className="min-h-screen bg-brand-light py-32 px-6 md:px-12 animate-fade-in-up">
                <div className="max-w-[1200px] mx-auto relative px-0">
                    <button
                        onClick={() => navigate('/#work')}
                        className="absolute top-0 left-0 text-brand-gray hover:text-brand-dark transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                        title="Back to Home"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>
                    {user ? (
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="absolute top-0 right-0 text-brand-gray hover:text-brand-dark transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                            title="Open Dashboard"
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            Dashboard
                        </button>
                    ) : (
                        <button
                            onClick={() => navigate('/login')}
                            className="absolute top-0 right-0 text-brand-gray hover:text-brand-dark transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                            title="Author Login"
                        >
                            <LogIn className="w-4 h-4" />
                            Login
                        </button>
                    )}

                    <div className="mb-20 text-center">
                        <span className="block text-xs font-bold uppercase tracking-[0.2em] text-brand-gray mb-4">Editorial</span>
                        <h1 className="text-4xl md:text-6xl font-serif text-brand-dark">The Journal</h1>
                    </div>

                    {!posts || posts.length === 0 ? (
                        <div className="text-center text-brand-gray italic py-20">
                            No posts found. Check back soon.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                            {posts.map((post) => (
                                <BlogCard key={post.id} post={post} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default BlogFeed;


import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blogService } from '../../services/blog';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Loader2, Eye, EyeOff, LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [session, setSession] = useState<any>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        // Check auth state
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            checkAdmin(session?.user?.id);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            checkAdmin(session?.user?.id);
        });

        return () => subscription.unsubscribe();
    }, []);

    const checkAdmin = async (userId?: string) => {
        if (!userId) {
            setIsAdmin(false);
            setAuthLoading(false);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', userId)
                .single();

            if (data && data.is_admin) {
                setIsAdmin(true);
            } else {
                setIsAdmin(false);
            }
        } catch (e) {
            console.error("Error checking admin status", e);
            setIsAdmin(false);
        } finally {
            setAuthLoading(false);
        }
    }

    // Fetch posts - if admin, fetch all (false), if not, maybe just published?
    // Dashboard is usually for managing, so regular users might see nothing or just public posts?
    // Prompt says: "On the dashboard where all journal articles are visible"
    // So we fetch ALL posts even for public, but maybe they can't see draft status if not admin?
    // Let's safe side: regular users see published posts, Admins see all.
    const { data: posts, isLoading } = useQuery({
        queryKey: ['dashboard-posts', isAdmin], // key depends on auth
        queryFn: () => blogService.getPosts(!isAdmin), // if not admin, publishedOnly=true
        enabled: !authLoading
    });

    const deleteMutation = useMutation({
        mutationFn: blogService.deletePost,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard-posts'] });
            queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
        },
    });

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this post?')) {
            deleteMutation.mutate(id);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/journal');
    }

    if (authLoading || isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-brand-light">
                <Loader2 className="w-8 h-8 animate-spin text-brand-dark" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-brand-light py-32 px-6 md:px-12 animate-fade-in-up">
            <div className="max-w-[1200px] mx-auto">
                <div className="flex justify-between items-center mb-12">
                    <h1 className="text-4xl font-serif text-brand-dark">Dashboard</h1>

                    <div className="flex items-center gap-4">
                        {!session ? (
                            <button
                                onClick={() => navigate('/login')}
                                className="flex items-center gap-2 bg-brand-dark text-brand-light px-6 py-3 rounded-sm text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                            >
                                <LogIn className="w-4 h-4" />
                                Login
                            </button>
                        ) : (
                            <>
                                {isAdmin && (
                                    <button
                                        onClick={() => navigate('/dashboard/create')}
                                        className="flex items-center gap-2 bg-brand-dark text-brand-light px-6 py-3 rounded-sm text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                                    >
                                        <Plus className="w-4 h-4" />
                                        New Post
                                    </button>
                                )}
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-2 border border-brand-dark text-brand-dark px-6 py-3 rounded-sm text-xs font-bold uppercase tracking-widest hover:bg-brand-gray/10 transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Logout
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-sm border border-brand-gray/20 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-brand-gray/5 border-b border-brand-gray/20">
                                <th className="p-6 text-xs font-bold uppercase tracking-widest text-brand-gray">Title</th>
                                <th className="p-6 text-xs font-bold uppercase tracking-widest text-brand-gray">Status</th>
                                <th className="p-6 text-xs font-bold uppercase tracking-widest text-brand-gray">Date</th>
                                {isAdmin && <th className="p-6 text-xs font-bold uppercase tracking-widest text-brand-gray text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {!posts || posts.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-brand-gray italic">No posts found.</td>
                                </tr>
                            ) : (
                                posts.map((post) => (
                                    <tr key={post.id} className="border-b border-brand-gray/10 hover:bg-brand-gray/5 transition-colors">
                                        <td className="p-6 font-medium text-brand-dark">{post.title}</td>
                                        <td className="p-6">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${post.is_published ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {post.is_published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                                {post.is_published ? 'Published' : 'Draft'}
                                            </span>
                                        </td>
                                        <td className="p-6 text-sm text-brand-gray">{format(new Date(post.created_at), 'MMM dd, yyyy')}</td>
                                        {isAdmin && (
                                            <td className="p-6 text-right">
                                                <div className="flex justify-end gap-3">
                                                    <button
                                                        onClick={() => navigate(`/dashboard/edit/${post.id}`)}
                                                        className="text-brand-gray hover:text-brand-dark transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(post.id)}
                                                        className="text-brand-gray hover:text-red-600 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

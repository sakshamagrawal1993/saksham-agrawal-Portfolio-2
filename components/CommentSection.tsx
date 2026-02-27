import React, { useState, useEffect } from 'react';
import { Comment, blogService } from '../services/blog';
import { supabase } from '../lib/supabaseClient';

interface CommentSectionProps {
    articleId: string;
}

const CommentSection: React.FC<CommentSectionProps> = ({ articleId }) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        fetchComments();
        checkUser();

        // Subscribe to auth changes
        const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
            setUserId(session?.user?.id || null);
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, [articleId]);

    const checkUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id || null);
    };

    const fetchComments = async () => {
        try {
            const data = await blogService.getComments(articleId);
            setComments(data);
        } catch (error) {
            console.error('Failed to load comments', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !userId) return;

        setIsLoading(true);
        try {
            const comment = await blogService.createComment({
                post_id: articleId,
                content: newComment
            });
            if (comment) {
                // Refresh comments to get profile data if needed, or just append
                // Since createComment return might lack joined profile, we fetch again or just append optimally
                // For now, simpler to refetch or append with current user details if we had them
                fetchComments();
                setNewComment('');
            }
        } catch (error) {
            console.error('Failed to post comment', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!window.confirm('Are you sure you want to delete this comment?')) return;

        try {
            // Check if blogService has deleteComment, if not we add it or use supabase directly
            const { error } = await supabase.from('comments').delete().eq('id', commentId);
            if (!error) {
                setComments(comments.filter(c => c.id !== commentId));
            }
        } catch (error) {
            console.error('Failed to delete comment', error);
        }
    };

    // Edit functionality omitted for brevity if not strictly requested by "merge",
    // but preserving "Delete" which is common. 
    // If edit is needed, need to add updateComment to blogService.

    return (
        <div className="mt-16 pt-12 border-t border-[#D6D1C7]">
            <h3 className="text-2xl font-serif text-[#2C2A26] mb-8">Comments ({comments.length})</h3>

            {/* Comment List */}
            <div className="space-y-8 mb-12">
                {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#EBE7DE] overflow-hidden flex-shrink-0">
                            {comment.profiles?.avatar_url ? (
                                <img src={comment.profiles.avatar_url} alt={comment.profiles.full_name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#A8A29E] font-bold text-sm">
                                    {comment.profiles?.full_name?.charAt(0) || '?'}
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="font-medium text-[#2C2A26] block">{comment.profiles?.full_name || 'Anonymous'}</span>
                                    <span className="text-xs text-[#A8A29E]">{new Date(comment.created_at).toLocaleDateString()}</span>
                                </div>
                                {userId === comment.user_id && (
                                    <div className="flex gap-2 text-xs">
                                        <button onClick={() => handleDelete(comment.id)} className="text-red-400 hover:text-red-900">Delete</button>
                                    </div>
                                )}
                            </div>
                            <p className="mt-2 text-[#5D5A53] leading-relaxed">{comment.content}</p>
                        </div>
                    </div>
                ))}

                {comments.length === 0 && (
                    <p className="text-[#A8A29E] italic">No comments yet. Be the first to share your thoughts.</p>
                )}
            </div>

            {/* Add Comment Form */}
            {userId ? (
                <form onSubmit={handleSubmit} className="bg-white p-6 border border-[#D6D1C7] shadow-sm">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-[#A8A29E] mb-4">Leave a Comment</h4>
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Share your thoughts..."
                        className="w-full p-4 bg-[#F5F2EB] border-none focus:ring-1 focus:ring-[#2C2A26] text-[#5D5A53] mb-4 resize-none"
                        rows={4}
                        required
                    />
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-6 py-3 bg-[#2C2A26] text-[#F5F2EB] text-xs font-bold uppercase tracking-widest hover:bg-[#4a4741] transition-colors disabled:opacity-50"
                        >
                            {isLoading ? 'Posting...' : 'Post Comment'}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="bg-[#EBE7DE] p-8 text-center text-[#5D5A53]">
                    Please <a href="/login" className="underline decoration-1 underline-offset-4 text-[#2C2A26]">sign in</a> to leave a comment.
                </div>
            )}
        </div>
    );
};

export default CommentSection;

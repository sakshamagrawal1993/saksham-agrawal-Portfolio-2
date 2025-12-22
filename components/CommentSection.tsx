
import React, { useState, useEffect } from 'react';
import { JournalComment } from '../types';
import { journalService } from '../services/journal';
import { supabase } from '../services/journal';

interface CommentSectionProps {
    articleId: string;
}

const CommentSection: React.FC<CommentSectionProps> = ({ articleId }) => {
    const [comments, setComments] = useState<JournalComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        fetchComments();
        checkUser();

        // Subscribe to auth changes
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
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
            const data = await journalService.getComments(articleId);
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
            const comment = await journalService.createComment(articleId, userId, newComment);
            if (comment) {
                setComments([...comments, comment]);
                setNewComment('');
            }
        } catch (error) {
            console.error('Failed to post comment', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = (comment: JournalComment) => {
        setEditingId(comment.id);
        setEditContent(comment.content);
    };

    const handleUpdate = async (commentId: string) => {
        if (!editContent.trim()) return;

        try {
            const updated = await journalService.updateComment(commentId, editContent);
            if (updated) {
                setComments(comments.map(c => c.id === commentId ? updated : c));
                setEditingId(null);
                setEditContent('');
            }
        } catch (error) {
            console.error('Failed to update comment', error);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!window.confirm('Are you sure you want to delete this comment?')) return;

        try {
            const success = await journalService.deleteComment(commentId);
            if (success) {
                setComments(comments.filter(c => c.id !== commentId));
            }
        } catch (error) {
            console.error('Failed to delete comment', error);
        }
    };

    return (
        <div className="mt-16 pt-12 border-t border-[#D6D1C7]">
            <h3 className="text-2xl font-serif text-[#2C2A26] mb-8">Comments ({comments.length})</h3>

            {/* Comment List */}
            <div className="space-y-8 mb-12">
                {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#EBE7DE] overflow-hidden flex-shrink-0">
                            {comment.user?.avatar_url ? (
                                <img src={comment.user.avatar_url} alt={comment.user.full_name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#A8A29E] font-bold text-sm">
                                    {comment.user?.full_name?.charAt(0) || '?'}
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="font-medium text-[#2C2A26] block">{comment.user?.full_name || 'Anonymous'}</span>
                                    <span className="text-xs text-[#A8A29E]">{new Date(comment.created_at).toLocaleDateString()}</span>
                                </div>
                                {userId === comment.user_id && (
                                    <div className="flex gap-2 text-xs">
                                        <button onClick={() => handleEdit(comment)} className="text-[#A8A29E] hover:text-[#2C2A26]">Edit</button>
                                        <button onClick={() => handleDelete(comment.id)} className="text-red-400 hover:text-red-900">Delete</button>
                                    </div>
                                )}
                            </div>

                            {editingId === comment.id ? (
                                <div className="mt-2">
                                    <textarea
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        className="w-full p-3 bg-white border border-[#D6D1C7] focus:outline-none focus:border-[#2C2A26] resize-none text-[#5D5A53]"
                                        rows={3}
                                    />
                                    <div className="flex justify-end gap-2 mt-2">
                                        <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs uppercase tracking-wider text-[#A8A29E] hover:text-[#2C2A26]">Cancel</button>
                                        <button onClick={() => handleUpdate(comment.id)} className="px-3 py-1 bg-[#2C2A26] text-[#F5F2EB] text-xs uppercase tracking-wider hover:bg-[#4a4741]">Save</button>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-2 text-[#5D5A53] leading-relaxed">{comment.content}</p>
                            )}
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


import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { blogService, Post } from '../../services/blog';
import RichTextEditor from '../blog/RichTextEditor';
import { Loader2, Save, ArrowLeft, Upload, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const PostEditor: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [excerpt, setExcerpt] = useState('');
    const [content, setContent] = useState<any>(null);
    const [coverImage, setCoverImage] = useState('');
    const [isPublished, setIsPublished] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Fetch existing post if editing
    const { data: existingPost, isLoading: isLoadingPost } = useQuery({
        queryKey: ['post-editor', id],
        queryFn: () => blogService.getPostById(id!),
        enabled: !!id,
    });

    useEffect(() => {
        if (existingPost) {
            setTitle(existingPost.title);
            setSlug(existingPost.slug);
            setExcerpt(existingPost.excerpt || '');
            setContent(existingPost.content);
            setCoverImage(existingPost.cover_image_url || '');
            setIsPublished(existingPost.is_published);
        }
    }, [existingPost]);

    const createMutation = useMutation({
        mutationFn: blogService.createPost,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard-posts'] });
            queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
            navigate('/dashboard');
        },
    });

    const updateMutation = useMutation({
        mutationFn: (updates: Partial<Post>) => blogService.updatePost(id!, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard-posts'] });
            queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
            queryClient.invalidateQueries({ queryKey: ['blog-post', slug] }); // invalidating by slug too
            navigate('/dashboard');
        },
    });

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setTitle(newTitle);
        if (!id) { // Only auto-generate slug for new posts
            setSlug(newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        setIsUploading(true);
        try {
            const file = e.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('blog-media')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('blog-media').getPublicUrl(filePath);
            setCoverImage(data.publicUrl);
        } catch (error) {
            console.error("Upload failed", error);
            alert("Upload failed");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = () => {
        if (!title || !slug) return alert('Title and slug are required');

        const postData = {
            title,
            slug,
            excerpt,
            content,
            cover_image_url: coverImage,
            is_published: isPublished,
        };

        if (id) {
            updateMutation.mutate(postData);
        } else {
            createMutation.mutate(postData);
        }
    };

    if (id && isLoadingPost) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    }

    const isSaving = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="min-h-screen bg-brand-light py-20 px-6 animate-fade-in-up">
            <div className="max-w-[900px] mx-auto bg-white p-8 md:p-12 shadow-sm border border-brand-gray/10">

                {/* Header */}
                <div className="flex justify-between items-center mb-8 pb-8 border-b border-brand-gray/10">
                    <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-gray hover:text-brand-dark">
                        <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isPublished}
                                onChange={(e) => setIsPublished(e.target.checked)}
                                className="accent-brand-dark w-4 h-4"
                            />
                            <span className="text-xs font-bold uppercase tracking-widest text-brand-dark">Publish</span>
                        </label>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 bg-brand-dark text-brand-light px-6 py-3 rounded-sm text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                    </div>
                </div>

                {/* Form */}
                <div className="space-y-8">
                    {/* Cover Image */}
                    <div className="bg-brand-gray/5 p-8 border border-dashed border-brand-gray/30 text-center rounded relative">
                        {coverImage ? (
                            <div className="relative w-full aspect-[21/9] overflow-hidden bg-brand-gray/10">
                                <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
                                <button onClick={() => setCoverImage('')} className="absolute top-2 right-2 bg-white text-red-500 p-2 text-xs font-bold uppercase shadow">Remove</button>
                            </div>
                        ) : (
                            <label className="cursor-pointer flex flex-col items-center justify-center gap-2">
                                {isUploading ? <Loader2 className="w-8 h-8 animate-spin text-brand-gray" /> : <Upload className="w-8 h-8 text-brand-gray" />}
                                <span className="text-xs font-bold uppercase tracking-widest text-brand-gray">Upload Cover Image</span>
                                <input type="file" onChange={handleImageUpload} className="hidden" accept="image/*" />
                            </label>
                        )}
                    </div>

                    {/* Title & Slug */}
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="Post Title"
                            value={title}
                            onChange={handleTitleChange}
                            className="w-full text-4xl md:text-5xl font-serif text-brand-dark placeholder-brand-gray/30 bg-transparent border-none focus:ring-0 p-0"
                        />
                        <input
                            type="text"
                            placeholder="url-slug"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            className="w-full text-xs font-mono text-brand-gray bg-transparent border-none focus:ring-0 p-0"
                        />
                    </div>

                    {/* Excerpt */}
                    <textarea
                        placeholder="Write a short excerpt..."
                        value={excerpt}
                        onChange={(e) => setExcerpt(e.target.value)}
                        rows={2}
                        className="w-full text-lg font-light text-brand-text placeholder-brand-gray/40 bg-transparent border-b border-brand-gray/10 focus:border-brand-dark focus:ring-0 p-2 resize-none"
                    />

                    {/* Editor */}
                    <div className="pt-8">
                        <RichTextEditor content={content} onChange={setContent} />
                    </div>
                </div>

            </div>
        </div>
    );
};

export default PostEditor;

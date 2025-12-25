import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Quote, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface RichTextEditorProps {
    content: any;
    onChange: (content: any) => void;
    editable?: boolean;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ content, onChange, editable = true }) => {
    const uploadImage = async (file: File): Promise<string | null> => {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('blog-media')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            const { data } = supabase.storage.from('blog-media').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (error) {
            console.error('Error uploading image:', error);
            alert('Error uploading image');
            return null;
        }
    };

    const addImage = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            if (input.files?.length) {
                const file = input.files[0];
                const url = await uploadImage(file);
                if (url && editor) {
                    editor.chain().focus().setImage({ src: url }).run();
                }
            }
        };
        input.click();
    }, []);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Image.configure({
                inline: true,
                allowBase64: true,
            }),
            Link.configure({
                openOnClick: false,
            }),
            Placeholder.configure({
                placeholder: 'Tell your story...',
            }),
        ],
        content,
        editable,
        onUpdate: ({ editor }) => {
            onChange(editor.getJSON());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-lg max-w-none focus:outline-none min-h-[300px]',
            },
            handleDrop: (view, event, _slice, moved) => {
                if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
                    event.preventDefault();
                    const file = event.dataTransfer.files[0];
                    if (file.type.startsWith('image/')) {
                        uploadImage(file).then(url => {
                            if (url) {
                                const { schema } = view.state;
                                const node = schema.nodes.image.create({ src: url });
                                const tr = view.state.tr.replaceSelectionWith(node);
                                view.dispatch(tr);
                            }
                        });
                        return true;
                    }
                }
                return false;
            }
        },
    });

    if (!editor) {
        return null;
    }

    return (
        <div className="relative">
            {editable && (
                <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-brand-gray/20 p-2 flex gap-2 mb-4">
                    <button
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`p-2 rounded hover:bg-brand-gray/10 ${editor.isActive('bold') ? 'bg-brand-gray/20' : ''}`}
                    >
                        <Bold className="w-5 h-5 text-brand-dark" />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`p-2 rounded hover:bg-brand-gray/10 ${editor.isActive('italic') ? 'bg-brand-gray/20' : ''}`}
                    >
                        <Italic className="w-5 h-5 text-brand-dark" />
                    </button>
                    <div className="w-px bg-brand-gray/20 mx-1" />
                    <button
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        className={`p-2 rounded hover:bg-brand-gray/10 ${editor.isActive('heading', { level: 1 }) ? 'bg-brand-gray/20' : ''}`}
                    >
                        <Heading1 className="w-5 h-5 text-brand-dark" />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={`p-2 rounded hover:bg-brand-gray/10 ${editor.isActive('heading', { level: 2 }) ? 'bg-brand-gray/20' : ''}`}
                    >
                        <Heading2 className="w-5 h-5 text-brand-dark" />
                    </button>
                    <div className="w-px bg-brand-gray/20 mx-1" />
                    <button
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={`p-2 rounded hover:bg-brand-gray/10 ${editor.isActive('bulletList') ? 'bg-brand-gray/20' : ''}`}
                    >
                        <List className="w-5 h-5 text-brand-dark" />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={`p-2 rounded hover:bg-brand-gray/10 ${editor.isActive('orderedList') ? 'bg-brand-gray/20' : ''}`}
                    >
                        <ListOrdered className="w-5 h-5 text-brand-dark" />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        className={`p-2 rounded hover:bg-brand-gray/10 ${editor.isActive('blockquote') ? 'bg-brand-gray/20' : ''}`}
                    >
                        <Quote className="w-5 h-5 text-brand-dark" />
                    </button>
                    <div className="w-px bg-brand-gray/20 mx-1" />
                    <button
                        onClick={addImage}
                        className="p-2 rounded hover:bg-brand-gray/10"
                    >
                        <ImageIcon className="w-5 h-5 text-brand-dark" />
                    </button>
                </div>
            )}
            <EditorContent editor={editor} />
        </div>
    );
};

export default RichTextEditor;

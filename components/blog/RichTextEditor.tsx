import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { Extension } from '@tiptap/core';
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough,
    List, ListOrdered, Quote, Image as ImageIcon,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Highlighter
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

// --- Custom Font Size Extension ---
const FontSize = Extension.create({
    name: 'fontSize',
    addOptions() {
        return {
            types: ['textStyle'],
        };
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: element => element.style.fontSize.replace(/['"]+/g, ''),
                        renderHTML: attributes => {
                            if (!attributes.fontSize) {
                                return {};
                            }
                            return {
                                style: `font-size: ${attributes.fontSize}`,
                            };
                        },
                    },
                },
            },
        ];
    },
    addCommands() {
        return {
            setFontSize: (fontSize: string) => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize })
                    .run();
            },
            unsetFontSize: () => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize: null })
                    .removeEmptyTextStyle()
                    .run();
            },
        };
    },
});

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        fontSize: {
            setFontSize: (size: string) => ReturnType;
            unsetFontSize: () => ReturnType;
        };
    }
}

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

            if (uploadError) throw uploadError;

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
            Image.configure({ inline: true, allowBase64: true }),
            Link.configure({ openOnClick: false }),
            Placeholder.configure({ placeholder: 'Tell your story...' }),
            Underline,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TextStyle,
            FontFamily,
            Color,
            Highlight.configure({ multicolor: true }),
            FontSize,
        ],
        content,
        editable,
        onUpdate: ({ editor }) => {
            onChange(editor.getJSON());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-lg max-w-none focus:outline-none min-h-[300px] p-4',
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

    React.useEffect(() => {
        if (editor && content) {
            const currentContent = editor.getJSON();
            if (JSON.stringify(currentContent) !== JSON.stringify(content)) {
                editor.commands.setContent(content);
            }
        }
    }, [content, editor]);

    if (!editor) return null;

    const ToolbarButton = ({ onClick, isActive = false, children, title }: any) => (
        <button
            onClick={onClick}
            title={title}
            className={`p-2 rounded hover:bg-gray-100 transition-colors ${isActive ? 'bg-gray-200 text-black' : 'text-gray-600'}`}
            type="button"
        >
            {children}
        </button>
    );

    return (
        <div className="flex flex-col h-full bg-transparent" >
            {editable && (
                <div className="bg-transparent border-b border-gray-200/50 p-2 flex flex-wrap gap-1 sticky top-0 z-20">
                    {/* History */}
                    <div className="flex gap-1 border-r border-gray-200 pr-2 mr-1">
                        <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="p-2 rounded hover:bg-gray-100 disabled:opacity-30">
                            Back
                        </button>
                        <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="p-2 rounded hover:bg-gray-100 disabled:opacity-30">
                            Fwd
                        </button>
                    </div>

                    {/* Text Style */}
                    <div className="flex gap-1 border-r border-gray-200 pr-2 mr-1">
                        <select
                            className="h-9 px-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-black"
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value === 'paragraph') editor.chain().focus().setParagraph().run();
                                else if (value.startsWith('h')) editor.chain().focus().toggleHeading({ level: parseInt(value.replace('h', '')) as any }).run();
                            }}
                            value={editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'paragraph'}
                        >
                            <option value="paragraph">Normal</option>
                            <option value="h1">Heading 1</option>
                            <option value="h2">Heading 2</option>
                            <option value="h3">Heading 3</option>
                        </select>

                        <select
                            className="h-9 px-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-black w-24"
                            onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
                            value={editor.getAttributes('textStyle').fontFamily || ''}
                        >
                            <option value="">Default Font</option>
                            <option value="Inter, sans-serif">Inter</option>
                            <option value="Arial, sans-serif">Arial</option>
                            <option value="Georgia, serif">Georgia</option>
                            <option value="Courier New, monospace">Monospace</option>
                            <option value="Comic Sans MS, cursive">Comic Sans</option>
                        </select>

                        <select
                            className="h-9 px-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-black w-20"
                            onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
                            value={editor.getAttributes('textStyle').fontSize || ''}
                        >
                            <option value="">Size</option>
                            <option value="12px">12px</option>
                            <option value="14px">14px</option>
                            <option value="16px">16px</option>
                            <option value="18px">18px</option>
                            <option value="20px">20px</option>
                            <option value="24px">24px</option>
                            <option value="30px">30px</option>
                        </select>
                    </div>

                    {/* Basic Formatting */}
                    <div className="flex gap-1 border-r border-gray-200 pr-2 mr-1">
                        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold">
                            <Bold className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic">
                            <Italic className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline">
                            <UnderlineIcon className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Strikethrough">
                            <Strikethrough className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive('highlight')} title="Highlight">
                            <Highlighter className="w-4 h-4" />
                        </ToolbarButton>
                        <input
                            type="color"
                            onInput={(event: any) => editor.chain().focus().setColor(event.target.value).run()}
                            value={editor.getAttributes('textStyle').color || '#000000'}
                            className="w-8 h-9 p-0.5 border border-gray-200 rounded cursor-pointer"
                            title="Text Color"
                        />
                    </div>

                    {/* Alignment */}
                    <div className="flex gap-1 border-r border-gray-200 pr-2 mr-1">
                        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Align Left">
                            <AlignLeft className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Align Center">
                            <AlignCenter className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Align Right">
                            <AlignRight className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Justify">
                            <AlignJustify className="w-4 h-4" />
                        </ToolbarButton>
                    </div>

                    {/* Lists & Extras */}
                    <div className="flex gap-1">
                        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet List">
                            <List className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Ordered List">
                            <ListOrdered className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Blockquote">
                            <Quote className="w-4 h-4" />
                        </ToolbarButton>
                        <ToolbarButton onClick={addImage} title="Add Image">
                            <ImageIcon className="w-4 h-4" />
                        </ToolbarButton>
                    </div>
                </div>
            )}

            < div className="flex-1 overflow-auto bg-transparent cursor-text" onClick={() => editor.commands.focus()}>
                <EditorContent editor={editor} className="min-h-full" />
            </div >

            <style>{`
                .ProseMirror {
                    min-height: 100%;
                    padding: 1.5rem;
                    outline: none;
                }
                .ProseMirror p.is-editor-empty:first-child::before {
                    color: #adb5bd;
                    content: attr(data-placeholder);
                    float: left;
                    height: 0;
                    pointer-events: none;
                }
            `}</style>
        </div >
    );
};

export default RichTextEditor;

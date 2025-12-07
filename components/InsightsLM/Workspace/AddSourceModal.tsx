import React, { useState, useRef } from 'react';
import Analytics from '../../../services/analytics';

interface AddSourceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddSource: (type: 'file' | 'link' | 'text', data: any) => void;
}

const AddSourceModal: React.FC<AddSourceModalProps> = ({ isOpen, onClose, onAddSource }) => {
    const [view, setView] = useState<'default' | 'link' | 'text'>('default');
    const [linkType, setLinkType] = useState<'website' | 'youtube'>('website');
    const [inputValue, setInputValue] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const resetAndClose = () => {
        setView('default');
        setInputValue('');
        onClose();
    };

    const handleFileClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            Analytics.track('Source Added', { type: 'file', fileName: e.target.files[0].name });
            onAddSource('file', e.target.files[0]);
            resetAndClose();
        }
    };

    const handleSubmit = () => {
        if (!inputValue.trim()) return;

        if (view === 'link') {
            Analytics.track('Source Added', { type: 'link', linkType: linkType, url: inputValue });
            onAddSource('link', { url: inputValue, type: linkType });
        } else if (view === 'text') {
            Analytics.track('Source Added', { type: 'text', length: inputValue.length });
            onAddSource('text', inputValue);
        }
        resetAndClose();
    };

    const renderHeader = () => (
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0]">
            <div className="flex items-center gap-2">
                {view !== 'default' && (
                    <button
                        onClick={() => setView('default')}
                        className="mr-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <svg className="w-5 h-5 text-[#2C2A26]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold">
                    I
                </div>
                <span className="font-medium text-[#2C2A26] text-sm">InsightsLM</span>
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={resetAndClose}
                    className="w-8 h-8 rounded-full hover:bg-[#F5F2EB] flex items-center justify-center text-[#2C2A26]/60 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );

    const renderDefaultView = () => (
        <>
            <h2 className="text-2xl font-serif text-[#2C2A26] mb-2">Add sources</h2>
            <p className="text-sm text-[#2C2A26]/60 mb-8 max-w-2xl leading-relaxed">
                Sources let InsightsLM base its responses on the information that matters most to you.
                <br />
                (Examples: marketing plans, course reading, research notes, meeting transcripts, sales documents, etc.)
            </p>

            {/* Upload Area */}
            <div
                onClick={handleFileClick}
                className="border-2 border-dashed border-[#D6D1C7] bg-[#F9F8F6] rounded-2xl h-48 flex flex-col items-center justify-center mb-8 cursor-pointer hover:bg-[#F5F2EB] hover:border-[#2C2A26]/40 transition-all group"
            >
                <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform text-blue-600">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                </div>
                <h3 className="text-[#2C2A26] font-medium mb-1">Upload sources</h3>
                <p className="text-xs text-[#2C2A26]/40">Drag & drop or <span className="text-blue-600 underline decoration-blue-600/30">choose file</span> to upload</p>
                <p className="text-[10px] text-[#2C2A26]/30 mt-4">Supported file types: PDF, .txt, Markdown, Audio (e.g. mp3)</p>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,.txt,.md,.mp3,.docx"
                />
            </div>

            {/* Source Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Google Drive Column */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#2C2A26]/40 uppercase tracking-wider mb-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                        File System
                    </div>
                    <button onClick={handleFileClick} className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#D6D1C7] bg-white hover:bg-[#F9F8F6] hover:border-[#2C2A26]/20 transition-all text-left group">
                        <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center text-blue-600">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" /></svg>
                        </div>
                        <span className="text-sm font-medium text-[#2C2A26] group-hover:text-black">Local Files</span>
                    </button>
                    <button onClick={handleFileClick} className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#D6D1C7] bg-white hover:bg-[#F9F8F6] hover:border-[#2C2A26]/20 transition-all text-left group">
                        <div className="w-8 h-8 rounded bg-orange-50 flex items-center justify-center text-orange-600">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg>
                        </div>
                        <span className="text-sm font-medium text-[#2C2A26] group-hover:text-black">Presentations</span>
                    </button>
                </div>

                {/* Link Column */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#2C2A26]/40 uppercase tracking-wider mb-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        Link
                    </div>
                    <button
                        onClick={() => { setView('link'); setLinkType('website'); }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#D6D1C7] bg-white hover:bg-[#F9F8F6] hover:border-[#2C2A26]/20 transition-all text-left group"
                    >
                        <div className="w-8 h-8 rounded bg-gray-50 flex items-center justify-center text-gray-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                        </div>
                        <span className="text-sm font-medium text-[#2C2A26] group-hover:text-black">Website</span>
                    </button>
                    <button
                        onClick={() => { setView('link'); setLinkType('youtube'); }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#D6D1C7] bg-white hover:bg-[#F9F8F6] hover:border-[#2C2A26]/20 transition-all text-left group"
                    >
                        <div className="w-8 h-8 rounded bg-red-50 flex items-center justify-center text-red-600">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" /></svg>
                        </div>
                        <span className="text-sm font-medium text-[#2C2A26] group-hover:text-black">YouTube</span>
                    </button>
                </div>

                {/* Paste Text Column */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#2C2A26]/40 uppercase tracking-wider mb-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Paste text
                    </div>
                    <button
                        onClick={() => setView('text')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#D6D1C7] bg-white hover:bg-[#F9F8F6] hover:border-[#2C2A26]/20 transition-all text-left group"
                    >
                        <div className="w-8 h-8 rounded bg-gray-50 flex items-center justify-center text-gray-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </div>
                        <span className="text-sm font-medium text-[#2C2A26] group-hover:text-black">Copied text</span>
                    </button>
                </div>
            </div>
            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-[#F0F0F0] flex items-center gap-4">
                <div className="flex items-center gap-2 text-[#2C2A26]/60">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="text-xs font-medium">Source limit</span>
                </div>
                <div className="flex-1 h-2 bg-[#D6D1C7]/30 rounded-full overflow-hidden">
                    <div className="h-full w-0 bg-[#2C2A26] rounded-full"></div>
                </div>
                <span className="text-xs text-[#2C2A26]/60 font-medium">0 / 50</span>
            </div>
        </>
    );

    const renderLinkView = () => (
        <div className="flex flex-col h-full min-h-[400px]">
            <h2 className="text-2xl font-serif text-[#2C2A26] mb-2">Add {linkType} link</h2>
            <p className="text-sm text-[#2C2A26]/60 mb-6">
                Paste a URL to import content from a {linkType}.
            </p>

            <input
                type="text"
                placeholder={linkType === 'website' ? "https://example.com" : "https://youtube.com/watch?v=..."}
                className="w-full bg-white border border-[#D6D1C7] rounded-xl px-4 py-3 text-[#2C2A26] focus:outline-none focus:border-[#2C2A26] mb-6"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
            />

            <div className="flex-1"></div>

            <div className="flex justify-end gap-3 mt-4">
                <button
                    onClick={() => setView('default')}
                    className="px-6 py-2 rounded-full text-sm font-medium text-[#2C2A26] hover:bg-[#F5F2EB] transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!inputValue.trim()}
                    className="px-6 py-2 rounded-full text-sm font-medium bg-[#2C2A26] text-[#F5F2EB] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Add source
                </button>
            </div>
        </div>
    );

    const renderTextView = () => (
        <div className="flex flex-col h-full min-h-[400px]">
            <h2 className="text-2xl font-serif text-[#2C2A26] mb-2">Paste text</h2>
            <p className="text-sm text-[#2C2A26]/60 mb-6">
                Copy and paste text directly to create a source.
            </p>

            <textarea
                placeholder="Paste your text here..."
                className="w-full flex-1 bg-white border border-[#D6D1C7] rounded-xl px-4 py-3 text-[#2C2A26] focus:outline-none focus:border-[#2C2A26] resize-none min-h-[200px]"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
            />

            <div className="flex justify-end gap-3 mt-6">
                <button
                    onClick={() => setView('default')}
                    className="px-6 py-2 rounded-full text-sm font-medium text-[#2C2A26] hover:bg-[#F5F2EB] transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!inputValue.trim()}
                    className="px-6 py-2 rounded-full text-sm font-medium bg-[#2C2A26] text-[#F5F2EB] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Add source
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-[#D6D1C7] overflow-hidden flex flex-col max-h-[90vh]">
                {renderHeader()}
                <div className="p-8 overflow-y-auto">
                    {view === 'default' && renderDefaultView()}
                    {view === 'link' && renderLinkView()}
                    {view === 'text' && renderTextView()}
                </div>
            </div>
        </div>
    );
};

export default AddSourceModal;

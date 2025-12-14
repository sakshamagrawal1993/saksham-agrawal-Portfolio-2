import React, { useState } from 'react';
import Analytics from '../../../services/analytics';

interface CreateNotebookModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (data: { title: string; description: string; icon: string; bg: string }) => void;
    loading?: boolean;
}

const EMOJI_OPTIONS = ['📓', '💡', '🧪', '🚀', '🧠', '🤖', '📊', '🎨', '📝', '🔥'];
const GRADIENT_OPTIONS = [
    'from-blue-500 to-purple-500',
    'from-green-500 to-emerald-500',
    'from-orange-500 to-red-500',
    'from-indigo-500 to-cyan-500',
    'from-pink-500 to-rose-500',
    'from-yellow-400 to-orange-500',
];

const CreateNotebookModal: React.FC<CreateNotebookModalProps> = ({ isOpen, onClose, onCreate, loading = false }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (!title.trim()) return;

        // Randomly generate icon and gradient
        const randomIcon = EMOJI_OPTIONS[Math.floor(Math.random() * EMOJI_OPTIONS.length)];
        const randomBg = GRADIENT_OPTIONS[Math.floor(Math.random() * GRADIENT_OPTIONS.length)];

        Analytics.track('Create Notebook Submit', { title });
        onCreate({ title, description, icon: randomIcon, bg: randomBg });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-[#D6D1C7] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0]">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold">
                            I
                        </div>
                        <span className="font-medium text-[#2C2A26] text-sm">InsightsLM</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full hover:bg-[#F5F2EB] flex items-center justify-center text-[#2C2A26]/60 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-8">
                    <h2 className="text-2xl font-serif text-[#2C2A26] mb-2">Create a new notebook</h2>
                    <p className="text-sm text-[#2C2A26]/60 mb-6">
                        Give your notebook a name and description to get started.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-[#2C2A26]/60 uppercase tracking-wider mb-2">
                                Notebook Title
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Q3 Market Research"
                                className="w-full bg-white border border-[#D6D1C7] rounded-xl px-4 py-3 text-[#2C2A26] focus:outline-none focus:border-[#2C2A26] font-medium"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#2C2A26]/60 uppercase tracking-wider mb-2">
                                Description (Optional)
                            </label>
                            <textarea
                                placeholder="What is this notebook about?"
                                className="w-full bg-white border border-[#D6D1C7] rounded-xl px-4 py-3 text-[#2C2A26] focus:outline-none focus:border-[#2C2A26] resize-none min-h-[100px]"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 pb-8 pt-4 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-full text-sm font-medium text-[#2C2A26] hover:bg-[#F5F2EB] transition-colors"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!title.trim() || loading}
                        className="px-6 py-2 rounded-full text-sm font-medium bg-[#2C2A26] text-[#F5F2EB] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading && (
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        Create Notebook
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateNotebookModal;

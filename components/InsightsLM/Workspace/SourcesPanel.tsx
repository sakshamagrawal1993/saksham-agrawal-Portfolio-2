import React, { useState } from 'react';
import Analytics from '../../../services/analytics';

interface SourcesPanelProps {
    sources: any[];
    onAddSource: () => void;
}

const SourcesPanel: React.FC<SourcesPanelProps> = ({ sources, onAddSource }) => {
    // Mock selection state
    const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());

    const toggleSelectAll = () => {
        if (selectedSources.size === sources.length) {
            setSelectedSources(new Set());
        } else {
            setSelectedSources(new Set(sources.map((_, i) => i)));
        }
    };

    const toggleSource = (idx: number) => {
        const newSet = new Set(selectedSources);
        if (newSet.has(idx)) newSet.delete(idx);
        else newSet.add(idx);
        setSelectedSources(newSet);
    };

    return (
        <div className="flex flex-col h-full bg-[#EBE5D9]/30 text-[#2C2A26] border-r border-[#D6D1C7] p-4 text-sm font-sans">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-medium text-[#2C2A26] text-lg">Sources</h2>
                <button className="text-[#2C2A26]/40 hover:text-[#2C2A26] transform rotate-90 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </div>

            <button
                onClick={onAddSource}
                className="w-full py-2.5 mb-4 bg-white border border-[#D6D1C7] rounded-full flex items-center justify-center gap-2 hover:bg-[#F5F2EB] transition-colors text-xs font-bold text-[#2C2A26] shadow-sm"
            >
                <span className="text-lg leading-none">+</span> Add sources
            </button>

            {/* Deep Research Banner */}
            <div className="bg-white border border-[#D6D1C7] rounded-lg p-3 mb-4 text-xs flex items-start gap-2 relative overflow-hidden group cursor-pointer hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-green-100 to-transparent rounded-bl-full pointer-events-none"></div>
                <div className="mt-0.5">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                    </svg>
                </div>
                <div className="text-[#2C2A26]/80">
                    <span className="text-[#2C2A26] font-bold">Try Deep Research</span> for an in-depth report and new sources!
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-6">
                <input
                    type="text"
                    placeholder="Search the web for new sources"
                    className="w-full bg-white border border-[#D6D1C7] rounded-full py-2.5 px-4 pl-9 text-xs focus:outline-none focus:border-[#2C2A26] placeholder-[#2C2A26]/40 text-[#2C2A26]"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            Analytics.track('Search', { search_query: e.currentTarget.value, results_count: 0 });
                        }
                    }}
                />
                <svg className="w-4 h-4 text-[#2C2A26]/40 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <div className="flex gap-2 mt-2">
                    <button className="flex items-center gap-1 bg-white rounded-full px-2 py-1 text-[10px] text-[#2C2A26]/60 hover:text-[#2C2A26] border border-[#D6D1C7] hover:border-[#2C2A26] transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                        Web
                        <svg className="w-2 h-2 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button className="flex items-center gap-1 bg-white rounded-full px-2 py-1 text-[10px] text-[#2C2A26]/60 hover:text-[#2C2A26] border border-[#D6D1C7] hover:border-[#2C2A26] transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Fast Research
                        <svg className="w-2 h-2 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                </div>
            </div>


            {sources.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                    <svg className="w-12 h-12 mb-2 text-[#2C2A26]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="max-w-[150px] text-xs font-bold uppercase tracking-wide">Saved sources will appear here</p>
                    <p className="max-w-[180px] text-[10px] mt-2 leading-relaxed">Click Add source above to add PDFs, websites, text, videos, or audio files.</p>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-xs text-[#2C2A26]/60 font-bold uppercase tracking-wider">Select all sources</span>
                        <div
                            onClick={toggleSelectAll}
                            className={`w-4 h-4 rounded border border-[#2C2A26]/40 cursor-pointer flex items-center justify-center ${selectedSources.size === sources.length ? 'bg-[#2C2A26] border-[#2C2A26]' : 'bg-transparent'}`}
                        >
                            {selectedSources.size === sources.length && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </div>
                    </div>
                    <div className="space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                        {sources.map((source, idx) => (
                            <div
                                key={idx}
                                className="group flex items-center gap-3 p-2 rounded hover:bg-white border border-transparent hover:border-[#D6D1C7] cursor-pointer"
                                onClick={() => toggleSource(idx)}
                            >
                                <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                                    {source.type === 'pdf' && <div className="w-full h-full rounded sm:rounded-sm bg-red-100 text-red-600 flex items-center justify-center text-[8px] font-bold">PDF</div>}
                                    {source.type === 'website' && <div className="w-full h-full rounded sm:rounded-sm bg-gray-100 text-gray-600 flex items-center justify-center"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg></div>}
                                    {source.type === 'youtube' && <div className="w-full h-full rounded sm:rounded-sm bg-red-100 text-red-600 flex items-center justify-center"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" /></svg></div>}
                                    {source.type === 'text' && <div className="w-full h-full rounded sm:rounded-sm bg-blue-100 text-blue-600 flex items-center justify-center"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>}
                                    {!['pdf', 'website', 'youtube', 'text'].includes(source.type) && <div className="w-full h-full rounded sm:rounded-sm bg-gray-100 text-gray-400 flex items-center justify-center font-bold text-[8px]">?</div>}
                                </div>
                                <span className="text-xs text-[#2C2A26] truncate flex-1 font-medium">{source.name || 'Untitled Source'}</span>
                                <div className={`w-4 h-4 rounded border border-[#2C2A26]/40 flex items-center justify-center flex-shrink-0 transition-colors ${selectedSources.has(idx) ? 'bg-[#2C2A26] border-[#2C2A26]' : 'group-hover:border-[#2C2A26]'}`}>
                                    {selectedSources.has(idx) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SourcesPanel;

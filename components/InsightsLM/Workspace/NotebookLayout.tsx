import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import SourcesPanel from './SourcesPanel';
import ChatPanel from './ChatPanel';
import StudioPanel from './StudioPanel';
import AddSourceModal from './AddSourceModal';
import Analytics from '../../../services/analytics';

interface NotebookLayoutProps {
    notebookId: string;
    notebookTitle: string;
    onBack: () => void;
    onLogout: () => void;
}

const NotebookLayout: React.FC<NotebookLayoutProps> = ({ notebookId, notebookTitle, onBack, onLogout }) => {
    const [sources, setSources] = useState<any[]>([]);
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [isAddSourceModalOpen, setIsAddSourceModalOpen] = useState(false);
    const [loadingSources, setLoadingSources] = useState(false);

    useEffect(() => {
        Analytics.track('Workspace View', { notebook: notebookTitle, id: notebookId });
        fetchSources();
    }, [notebookId]);

    const fetchSources = async () => {
        setLoadingSources(true);
        try {
            const { data, error } = await supabase
                .from('sources')
                .select('*')
                .eq('notebook_id', notebookId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) {
                // Map DB columns to UI shape if necessary, or use as is
                const mappedSources = data.map(s => ({
                    id: s.id,
                    name: s.title,
                    type: s.type,
                    // Add other fields as needed by SourcesPanel
                }));
                setSources(mappedSources);
            }
        } catch (error) {
            console.error('Error fetching sources:', error);
        } finally {
            setLoadingSources(false);
        }
    };

    const handleAddSource = () => {
        setIsAddSourceModalOpen(true);
    };

    const handleAddSourceData = async (type: 'file' | 'link' | 'text', data: any) => {
        // Prepare DB object
        let newSourcePayload: any = {
            notebook_id: notebookId,
            type: 'text', // default fallback
            title: 'Untitled Source',
        };

        if (type === 'file') {
            const file = data as File;
            console.log("Uploading file:", file.name);
            // TODO: Upload to storage bucket first to get path
            newSourcePayload = {
                ...newSourcePayload,
                type: 'pdf', // simplistic for now, should detect mime
                title: file.name,
                // storage_path: ... 
            };
        } else if (type === 'link') {
            const { url, type: linkType } = data;
            newSourcePayload = {
                ...newSourcePayload,
                type: linkType === 'youtube' ? 'youtube' : 'website',
                title: url,
                source_url: url
            };
        } else if (type === 'text') {
            newSourcePayload = {
                ...newSourcePayload,
                type: 'text',
                title: 'Pasted Text',
                extracted_text: data // Storing raw text directly
            };
        }

        try {
            const { data: insertedSource, error } = await supabase
                .from('sources')
                .insert([newSourcePayload])
                .select()
                .single();

            if (error) throw error;

            if (insertedSource) {
                setSources(prev => [{
                    id: insertedSource.id,
                    name: insertedSource.title,
                    type: insertedSource.type
                }, ...prev]);
                Analytics.track('Source Added', { type, notebookId });
            }
        } catch (error) {
            console.error('Error adding source:', error);
            alert('Failed to save source. See console.');
        }

        setIsAddSourceModalOpen(false);
    };

    const handleSendMessage = (msg: string) => {
        setMessages([...messages, { role: 'user', content: msg }]);
        // Mock response
        setTimeout(() => {
            setMessages(prev => [...prev, { role: 'assistant', content: "I've analyzed your source. Here is a summary..." }]);
        }, 1000);
    };


    return (
        <div className="flex flex-col h-screen bg-[#F5F2EB] text-[#2C2A26] overflow-hidden relative">
            {/* Header */}
            <header className="h-14 border-b border-[#D6D1C7] flex items-center justify-between px-4 bg-[#F5F2EB]">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} title="Back to Dashboard">
                        <div className="w-8 h-8 bg-[#2C2A26] rounded-md flex items-center justify-center text-[#F5F2EB] font-serif font-bold cursor-pointer">
                            I
                        </div>
                    </button>
                    <span className="font-sans text-sm text-[#2C2A26]/40">/</span>
                    <h1 className="font-sans font-medium text-lg text-[#2C2A26]">{notebookTitle || 'Untitled notebook'}</h1>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={handleAddSource} className="px-3 py-1.5 bg-[#2C2A26] text-[#F5F2EB] rounded-full text-xs font-bold hover:opacity-80 transition-opacity">
                        + Add Source
                    </button>
                    <div className="h-4 w-[1px] bg-[#D6D1C7] mx-1"></div>
                    <button className="text-[#2C2A26]/60 hover:text-[#2C2A26] text-xs font-medium px-2 py-1 rounded hover:bg-[#EBE5D9]">
                        Analytics
                    </button>
                    <button className="text-[#2C2A26]/60 hover:text-[#2C2A26] text-xs font-medium px-2 py-1 rounded hover:bg-[#EBE5D9]">
                        Share
                    </button>
                    <button className="text-[#2C2A26]/60 hover:text-[#2C2A26] text-xs font-medium px-2 py-1 rounded hover:bg-[#EBE5D9]">
                        Settings
                    </button>
                    <button
                        onClick={onLogout}
                        className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold ml-2 text-white hover:opacity-80 transition-opacity"
                        title="Logout"
                    >
                        S
                    </button>
                </div>
            </header>

            {/* Main 3-Column Grid */}
            <div className="flex-1 grid grid-cols-[280px_1fr_300px] overflow-hidden">

                {/* Left: Sources */}
                <SourcesPanel sources={sources} onAddSource={handleAddSource} />

                {/* Middle: Chat */}
                <ChatPanel
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    hasSources={sources.length > 0}
                    notebookTitle={notebookTitle}
                    sourceCount={sources.length}
                    onAddSource={handleAddSource}
                />

                {/* Right: Studio */}
                <StudioPanel onAction={(action) => console.log('Action:', action)} />
            </div>

            {/* Modals */}
            <AddSourceModal
                isOpen={isAddSourceModalOpen}
                onClose={() => setIsAddSourceModalOpen(false)}
                onAddSource={handleAddSourceData}
            />
        </div>
    );
};

export default NotebookLayout;

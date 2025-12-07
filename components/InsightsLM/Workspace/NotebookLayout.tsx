import React, { useEffect } from 'react';
import SourcesPanel from './SourcesPanel';
import ChatPanel from './ChatPanel';
import StudioPanel from './StudioPanel';
import AddSourceModal from './AddSourceModal';
import Analytics from '../../../services/analytics'; // Fixed relative path

interface NotebookLayoutProps {
    notebookTitle: string;
    onBack: () => void;
    onLogout: () => void;
}

const NotebookLayout: React.FC<NotebookLayoutProps> = ({ notebookTitle, onBack, onLogout }) => {
    // State for managing sources/messages for now
    // Ideally lifted up or managed via Context/Supabase
    const [sources, setSources] = React.useState<any[]>([]);

    useEffect(() => {
        Analytics.track('Workspace View', { notebook: notebookTitle });
    }, [notebookTitle]);
    const [messages, setMessages] = React.useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [isAddSourceModalOpen, setIsAddSourceModalOpen] = React.useState(false);

    const handleAddSource = () => {
        setIsAddSourceModalOpen(true);
    };

    const handleAddSourceData = (type: 'file' | 'link' | 'text', data: any) => {
        let newSource = { name: 'Untitled', type: 'unknown' };

        if (type === 'file') {
            const file = data as File;
            console.log("Uploading file:", file.name);
            newSource = { name: file.name, type: 'pdf' }; // Mock type for now
        } else if (type === 'link') {
            const { url, type: linkType } = data;
            console.log("Adding link:", url);
            newSource = { name: url, type: linkType === 'youtube' ? 'youtube' : 'website' };
        } else if (type === 'text') {
            console.log("Adding text content");
            newSource = { name: 'Pasted Text', type: 'text' };
        }

        setSources(prev => [...prev, newSource]);
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
                    <button className="px-3 py-1.5 bg-[#2C2A26] text-[#F5F2EB] rounded-full text-xs font-bold hover:opacity-80 transition-opacity">
                        + Create notebook
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

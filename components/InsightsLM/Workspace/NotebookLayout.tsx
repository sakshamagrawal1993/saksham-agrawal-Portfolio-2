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
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);


    useEffect(() => {
        Analytics.track('Workspace View', { notebook: notebookTitle, id: notebookId });
        fetchSources();
        fetchMessages();

        // Subscribe to real-time changes if needed, but for now just fetch on load and after actions
    }, [notebookId]);

    const fetchMessages = async () => {
        try {
            // Get session first
            const { data: session } = await supabase
                .from('chat_sessions')
                .select('id')
                .eq('notebook_id', notebookId)
                .single();

            if (session) {
                const { data: msgs, error } = await supabase
                    .from('chat_messages')
                    .select('*')
                    .eq('session_id', session.id)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                if (msgs) {
                    const formattedMsgs = msgs.map((m: any) => ({
                        role: m.role,
                        content: m.content,
                        type: m.type
                    }));

                    // Filter out summaries for the main chat list if they are displayed separately?
                    // User said: "User should be shown the earlier chat ... and any summaries ... in a chronological manner"
                    // And "UI of all chat messages will be the UI which is currently used"
                    // So we probably want them ALL in messages state.

                    // Identify the LAST summary to show in the Overview Panel if desired?
                    // Or unified stream. The user said chronological manner.
                    // But currently ChatPanel has a specific 'summary' prop for the overview.
                    // Let's create a combined stream.

                    // Actually, if there are multiple summaries, does the Overview show the latest?
                    // User said "show... any summaries which have been generated in a chronological manner"
                    // This implies they should be part of the message stream.

                    setMessages(formattedMsgs);
                }
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    };

    const fetchSources = async () => {

        try {
            const { data, error } = await supabase
                .from('sources')
                .select('*')
                .eq('notebook_id', notebookId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) {
                // Map DB columns to UI shape if necessary, or use as is
                const mappedSources = data.map((s: any) => ({
                    id: s.id,
                    name: s.title,
                    type: s.type,
                    storage_path: s.storage_path,
                    source_url: s.source_url,
                    status: s.status // Map status from DB
                }));
                setSources(mappedSources);
            }
        } catch (error) {
            console.error('Error fetching sources:', error);
        }
    };

    const handleAddSource = () => {
        setIsAddSourceModalOpen(true);
    };

    const handleOpenSource = async (source: any) => {
        if (source.type === 'website' || source.type === 'youtube') {
            window.open(source.source_url, '_blank');
        } else if (source.storage_path) {
            try {
                const { data, error } = await supabase
                    .storage
                    .from('InsightsLM')
                    .createSignedUrl(source.storage_path, 3600); // 1 hour expiry

                if (error) throw error;
                if (data?.signedUrl) {
                    window.open(data.signedUrl, '_blank');
                }
            } catch (error) {
                console.error('Error creating signed URL:', error);
                alert('Failed to open file.');
            }
        }
    };

    const handleDeleteSources = async (sourceIds: string[]) => {
        if (!sourceIds.length) return;

        const confirmDelete = window.confirm(`Are you sure you want to delete ${sourceIds.length} source(s)?`);
        if (!confirmDelete) return;

        try {
            // 1. Get storage paths for files to be deleted
            const sourcesToDelete = sources.filter(s => sourceIds.includes(s.id));
            const pathsToDelete = sourcesToDelete
                .filter(s => s.storage_path)
                .map(s => s.storage_path);

            // 2. Delete from Storage (Try both buckets to be safe/clean legacy)
            if (pathsToDelete.length > 0) {
                // Try InsightsLM (current)
                await supabase.storage.from('InsightsLM').remove(pathsToDelete);
                // Try source_documents (legacy) - ignore errors
                await supabase.storage.from('source_documents').remove(pathsToDelete);
            }

            // 3. Delete from DB
            const { error: dbError } = await supabase
                .from('sources')
                .delete()
                .in('id', sourceIds);

            if (dbError) throw dbError;

            // 4. Update UI
            setSources(prev => prev.filter(s => !sourceIds.includes(s.id)));
            Analytics.track('Sources Deleted', { count: sourceIds.length, notebookId });

        } catch (error: any) {
            console.error('Error deleting sources:', error);
            alert('Failed to delete sources: ' + (error.message || error.error_description || JSON.stringify(error)));
        }
    };


    const [isUploading, setIsUploading] = useState(false);

    const handleAddSourceData = async (type: 'file' | 'link' | 'text', data: any) => {
        if (isUploading) return;
        setIsUploading(true);

        try {
            // Prepare DB object
            let newSourcePayload: any = {
                notebook_id: notebookId,
                type: 'text', // default fallback
                title: 'Untitled Source',
            };

            if (type === 'file') {
                const file = data as File;
                console.log("Uploading file:", file.name);

                // Get current user
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    console.error("No user found");
                    alert("You must be logged in to upload files.");
                    setIsUploading(false);
                    return;
                }

                // Sanitize filename
                const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const filePath = `${user.id}/${notebookId}/${fileName}`;

                // Upload to Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from('InsightsLM')
                    .upload(filePath, file, {
                        upsert: true
                    });

                if (uploadError) {
                    console.error('Error uploading file:', uploadError);
                    alert('Failed to upload file: ' + uploadError.message);
                    setIsUploading(false);
                    return;
                }

                // Determine file type
                let fileType = 'text';
                if (file.type.includes('pdf')) fileType = 'pdf';
                else if (file.type.includes('audio')) fileType = 'audio_file'; // Changed from 'audio' to match DB enum
                else if (
                    file.type.includes('word') ||
                    file.name.endsWith('.docx') ||
                    file.name.endsWith('.doc')
                ) fileType = 'word';
                else if (
                    file.type.includes('excel') ||
                    file.type.includes('spreadsheet') ||
                    file.name.endsWith('.xlsx') ||
                    file.name.endsWith('.xls') ||
                    file.name.endsWith('.csv')
                ) fileType = 'excel';
                // Add other mime checks as needed

                newSourcePayload = {
                    ...newSourcePayload,
                    type: fileType,
                    title: file.name,
                    storage_path: filePath,
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
                    type: insertedSource.type,
                    storage_path: insertedSource.storage_path,
                    source_url: insertedSource.source_url,
                    status: 'pending' // Optimistic update
                }, ...prev]);
                Analytics.track('Source Added', { type, notebookId });

                // Start loading summary
                setIsLoadingSummary(true);

                // Trigger n8n processing via Edge Function (Synchronous wait)
                const { data: fnData, error: fnError } = await supabase.functions.invoke('process-source', {
                    body: {
                        source_id: insertedSource.id,
                        notebook_id: notebookId,
                        file_url: insertedSource.storage_path ?
                            await (async () => {
                                const { data } = await supabase.storage.from('InsightsLM').createSignedUrl(insertedSource.storage_path, 3600);
                                return data?.signedUrl;
                            })()
                            : insertedSource.source_url,
                        source_type: insertedSource.type,
                        file_name: insertedSource.title
                    }
                });

                // Stop loading regardless of outcome
                setIsLoadingSummary(false);

                if (fnError) {
                    console.error('Failed to trigger processing:', fnError);
                    // Update status to failed
                    setSources(prev => prev.map(s =>
                        s.id === insertedSource.id ? { ...s, status: 'failed' } : s
                    ));
                    // PERSIST FAILED STATUS
                    await supabase.from('sources').update({ status: 'failed', processing_error: fnError.message }).eq('id', insertedSource.id);
                    setIsUploading(false); // Release lock
                    return;
                }

                // Success! Handle returned data
                if (fnData) {
                    console.log("Received n8n response:", fnData);

                    // 1. Update Source Status (Green Tick)
                    setSources(prev => prev.map(s =>
                        s.id === insertedSource.id ? { ...s, status: 'completed' } : s
                    ));

                    // PERSIST SUCCESS STATUS
                    await supabase.from('sources').update({ status: 'completed' }).eq('id', insertedSource.id);

                    // 2. Refresh Chat History (Simulate real-time update)
                    await fetchMessages();
                }
            }

        } catch (error) {
            console.error('Error adding source:', error);
            alert('Failed to save source. See console.');
            setIsLoadingSummary(false);
        } finally {
            setIsUploading(false);
            setIsAddSourceModalOpen(false);
        }
    };

    const handleSendMessage = async (msg: string) => {
        if (!msg.trim()) return;

        // Optimistic UI update
        const newMessage = { role: 'user', content: msg, type: 'user_message' };
        setMessages(prev => [...prev, newMessage as any]); // Type assertion for now

        try {
            const { data, error } = await supabase.functions.invoke('chat-notebook', {
                body: {
                    message: msg,
                    notebook_id: notebookId
                }
            });

            if (error) throw error;

            if (data) {
                // The function returns { ...n8nData, content: agentResponse }
                // We can append the agent response
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.content,
                    type: 'agent_response'
                }]);
            }

        } catch (error) {
            console.error('Error sending message:', error);
            // Optionally remove the optimistic message or show error
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Sorry, I encountered an error connecting to the AI agent.",
                type: 'error'
            }]);
        }
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
                <SourcesPanel
                    sources={sources}
                    onAddSource={handleAddSource}
                    onOpenSource={handleOpenSource}
                    onDeleteSources={handleDeleteSources}
                />

                {/* Middle: Chat */}
                <ChatPanel
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    hasSources={sources.length > 0}
                    notebookTitle={notebookTitle}
                    sourceCount={sources.length}
                    onAddSource={handleAddSource}
                    isLoadingSummary={isLoadingSummary}
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

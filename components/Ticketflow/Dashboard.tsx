import React, { useState, useEffect } from 'react';
import TicketList from './TicketList';
import TicketDetail from './TicketDetail';
import Analytics from './Analytics';
import CreateTicketModal from './CreateTicketModal';
import { Ticket, TicketStatus } from './types';
import { supabase } from './supabaseClient';

interface DashboardProps {
    user: string;
    onLogout: () => void;
    onBack: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, onBack }) => {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchTickets = async () => {
        setLoading(true);
        const { error: ticketsError } = await supabase
            .from('tickets')
            .select('id') // We just check connectivity or get basics, but below we do full fetch
            .limit(1);

        if (ticketsError) {
            console.error('Error fetching tickets:', ticketsError);
            setLoading(false);
            return;
        }

        // Fetch remarks separately since we need to filter them manually or join
        // NOTE: Supabase join is cleaner, but let's do 2 queries to be safe with schema changes or strict RLS sometimes
        // Actually, join is better: .select('*, remarks(*)')
        const { data: ticketsWithRemarks, error: joinError } = await supabase
            .from('tickets')
            .select(`
            *,
            remarks (*)
        `)
            .order('created_at', { ascending: false });

        if (joinError) {
            console.error('Error fetching tickets with remarks:', joinError);
            setLoading(false);
            return;
        }

        const formattedTickets: Ticket[] = ticketsWithRemarks.map((t: any) => {
            const rawRemarks: any[] = t.remarks || [];

            // Filter comments vs actions using correct schema types
            const comments = rawRemarks
                .filter((r: any) => r.type === 'remark') // User specified 'remark'
                .map((r: any) => ({
                    id: r.id,
                    ticket_id: r.ticket_id,
                    author: r.author,
                    text: r.text,
                    timestamp: r.timestamp,
                    type: 'comment' as 'comment' // keep internal type as 'comment' for UI components
                })).sort((a: any, b: any) => a.timestamp - b.timestamp);

            const actions = rawRemarks
                .filter((r: any) => r.type === 'Status_change') // User specified 'Status_change'
                .map((r: any) => ({
                    id: r.id,
                    action: r.text,
                    actor: r.author,
                    timestamp: r.timestamp
                })).sort((a: any, b: any) => b.timestamp - a.timestamp);

            // Log first ticket to debug fields if needed
            // console.log('Raw Ticket:', t);

            return {
                id: t.id,
                title: t.title, // User verified: title provides ticket title
                description: t.description,
                customer_name: t.customer_name, // User verified: customer_name provides customer name
                status: t.status,
                createdAt: t.created_at,
                updatedAt: t.updated_at,
                remarks: comments,
                actions: actions
            };
        });

        setTickets(formattedTickets);
        setLoading(false);
    };

    useEffect(() => {
        fetchTickets();

        // Subscribe to realtime changes
        const subscription = supabase
            .channel('public:tickets_logs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fetchTickets)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'remarks' }, fetchTickets)
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    const selectedTicket = tickets.find(t => t.id === selectedTicketId);

    const handleCreateTicket = async (title: string, description: string) => {
        const newId = crypto.randomUUID();
        const now = Date.now();

        // 1. Create Ticket
        const { error: ticketError } = await supabase
            .from('tickets')
            .insert([{
                id: newId,
                title,
                description,
                status: 'Open',
                customer_name: 'Unknown', // Default or add input later
                created_at: now,
                updated_at: now
            }]);

        if (ticketError) {
            console.error('Error creating ticket:', ticketError);
            return;
        }

        // 2. Log Action (Creation) - User requested 'Status_change' for status changes, 
        // but creation is also an action. Let's use 'Status_change' with text "Created Ticket" 
        // or just 'Status_change' to match the pattern, although "Created Ticket" isn't strictly a status change.
        // However, to keep it simple and visible in the activity log which filters by Status_change:
        const { error: actionError } = await supabase
            .from('remarks')
            .insert([{
                id: crypto.randomUUID(),
                ticket_id: newId,
                author: user,
                text: 'Created Ticket',
                timestamp: now,
                type: 'Status_change'
            }]);

        if (actionError) console.error('Error logging creation:', actionError);

        await fetchTickets(); // Refresh
        setShowCreateModal(false);
        setSelectedTicketId(newId);
    };

    const handleUpdateStatus = async (ticketId: string, newStatus: TicketStatus) => {
        const now = Date.now();

        // 1. Update Ticket
        const { error } = await supabase
            .from('tickets')
            .update({ status: newStatus, updated_at: now })
            .eq('id', ticketId);

        if (error) {
            console.error('Error updating status:', error);
            return;
        }

        // 2. Log Action
        await supabase
            .from('remarks')
            .insert([{
                id: crypto.randomUUID(),
                ticket_id: ticketId,
                author: user,
                text: `Status changed to ${newStatus}`,
                timestamp: now,
                type: 'Status_change'
            }]);

        await fetchTickets();
    };

    const handleAddRemark = async (ticketId: string, remarkText: string) => {
        const now = Date.now();
        const { error } = await supabase
            .from('remarks')
            .insert([{
                id: crypto.randomUUID(),
                ticket_id: ticketId,
                author: user,
                text: remarkText,
                timestamp: now,
                type: 'remark'
            }]);

        if (error) {
            console.error('Error adding remark:', error);
            return;
        }

        // Update ticket updated_at
        await supabase.from('tickets').update({ updated_at: now }).eq('id', ticketId);

        await fetchTickets();
    };

    return (
        <div className="flex flex-col h-screen bg-[#F5F2EB] text-[#2C2A26]">
            {/* Top Navbar */}
            <div className="bg-[#F5F2EB] border-b border-[#D6D1C7] px-8 py-5 flex justify-between items-center z-10">
                <div className="flex items-center space-x-6">
                    <button onClick={onBack} className="text-[#2C2A26]/50 hover:text-[#2C2A26] font-serif italic transition-colors">← Back</button>
                    <h1 className="text-2xl font-serif text-[#2C2A26]">Ticketflow <span className="text-[#2C2A26]/30 text-lg font-sans">Dashboard</span></h1>
                </div>

                <div className="flex items-center space-x-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#2C2A26]/40">Operator</span>
                        <span className="text-sm font-medium text-[#2C2A26]">{user}</span>
                    </div>
                    <button
                        onClick={() => {
                            console.log('Opening Analytics...');
                            setShowAnalytics(true);
                        }}
                        className="px-5 py-2 border border-[#2C2A26] text-[#2C2A26] text-xs font-bold uppercase tracking-widest hover:bg-[#2C2A26] hover:text-[#F5F2EB] transition-all"
                    >
                        Analytics
                    </button>
                    <button
                        onClick={onLogout}
                        className="text-xs font-bold uppercase tracking-widest text-[#8E3B3B] hover:text-[#2C2A26] transition-colors"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar: List */}
                <div className="w-1/3 min-w-[320px] max-w-[400px] border-r border-[#D6D1C7] bg-[#EBE5D9]/30 flex flex-col">
                    <div className="p-6 border-b border-[#D6D1C7] flex justify-between items-center bg-[#F5F2EB]">
                        <h2 className="font-serif text-lg text-[#2C2A26]">Active Tickets</h2>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="text-xs font-bold uppercase tracking-widest text-[#2C2A26] border-b border-[#2C2A26] pb-0.5 hover:opacity-60 transition-opacity"
                        >
                            + Create
                        </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        {loading ? (
                            <div className="flex justify-center items-center h-full text-[#A8A29E] font-serif italic">Loading tickets...</div>
                        ) : (
                            <TicketList
                                tickets={tickets}
                                selectedTicketId={selectedTicketId}
                                onSelectTicket={(t) => setSelectedTicketId(t.id)}
                            />
                        )}
                    </div>
                </div>

                {/* Right Content: Detail */}
                <div className="flex-1 overflow-hidden bg-[#F5F2EB] relative">
                    {selectedTicket ? (
                        <TicketDetail
                            ticket={selectedTicket}
                            onUpdateStatus={handleUpdateStatus}
                            onAddRemark={handleAddRemark}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-[#2C2A26]/30">
                            <div className="mb-4 text-4xl font-serif opacity-20">Ticketflow</div>
                            <p className="font-serif italic">Select a ticket to view details</p>
                        </div>
                    )}
                </div>
            </div>

            {showAnalytics && <Analytics tickets={tickets} onClose={() => setShowAnalytics(false)} />}

            {showCreateModal && (
                <CreateTicketModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleCreateTicket}
                />
            )}
        </div>
    );
};

export default Dashboard;

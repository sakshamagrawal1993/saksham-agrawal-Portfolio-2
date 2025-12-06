import React, { useState } from 'react';
import { Ticket, TicketStatus } from './types';

interface TicketDetailProps {
    ticket: Ticket;
    onUpdateStatus: (ticketId: string, status: TicketStatus) => void;
    onAddRemark: (ticketId: string, remark: string) => void;
}

const TicketDetail: React.FC<TicketDetailProps> = ({ ticket, onUpdateStatus, onAddRemark }) => {
    const [newRemark, setNewRemark] = useState('');

    const handleRemarkSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newRemark.trim()) {
            onAddRemark(ticket.id, newRemark);
            setNewRemark('');
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#F5F2EB] overflow-hidden">
            {/* Header */}
            <div className="p-8 border-b border-[#D6D1C7] flex justify-between items-start bg-[#EBE5D9]/20">
                <div>
                    <h2 className="text-3xl font-serif text-[#2C2A26] mb-3">{ticket.title}</h2>
                    {ticket.customer_name && (
                        <div className="text-sm font-bold uppercase tracking-widest text-[#2C2A26]/70 mb-2">
                            Customer: {ticket.customer_name}
                        </div>
                    )}
                    <div className="flex items-center space-x-4 text-xs font-bold uppercase tracking-widest text-[#2C2A26]/50">
                        <span>ID: {ticket.id}</span>
                        <span>•</span>
                        <span>{new Date(ticket.createdAt).toLocaleString()}</span>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-[#2C2A26]/70">Status:</span>
                    <select
                        value={ticket.status}
                        onChange={(e) => onUpdateStatus(ticket.id, e.target.value as TicketStatus)}
                        className="bg-transparent border-b border-[#2C2A26] text-[#2C2A26] font-serif focus:outline-none py-1 pr-4 cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                    </select>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                {/* Description */}
                <div className="mb-12">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#2C2A26]/40 mb-4">Description</h3>
                    <p className="text-lg font-serif leading-relaxed text-[#2C2A26] border-l-2 border-[#2C2A26]/20 pl-6">
                        {ticket.description}
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    {/* Remarks */}
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-[#2C2A26]/40 mb-6">Remarks & Comments</h3>
                        <div className="space-y-6 mb-8">
                            {ticket.remarks.length === 0 ? (
                                <p className="text-[#2C2A26]/30 font-serif italic">No remarks yet.</p>
                            ) : (
                                ticket.remarks.map(remark => (
                                    <div key={remark.id} className="bg-white p-6 border border-[#D6D1C7]/50 shadow-sm relative group hover:border-[#2C2A26]/30 transition-colors">
                                        <div className="flex justify-between items-baseline mb-3">
                                            <span className="font-bold text-xs uppercase tracking-widest text-[#2C2A26]">{remark.author}</span>
                                            <span className="text-[10px] uppercase tracking-widest text-[#A8A29E]">{new Date(remark.timestamp).toLocaleString()}</span>
                                        </div>
                                        <p className="text-[#2C2A26]/80 font-serif leading-relaxed">{remark.text}</p>
                                    </div>
                                ))
                            )}
                        </div>

                        <form onSubmit={handleRemarkSubmit} className="relative">
                            <textarea
                                className="w-full bg-[#EBE5D9]/30 border border-[#D6D1C7] p-4 text-[#2C2A26] placeholder-[#2C2A26]/30 focus:outline-none focus:border-[#2C2A26] transition-colors resize-none font-serif"
                                rows={3}
                                placeholder="Add a remark..."
                                value={newRemark}
                                onChange={(e) => setNewRemark(e.target.value)}
                            />
                            <button
                                type="submit"
                                disabled={!newRemark.trim()}
                                className="absolute bottom-3 right-3 text-xs font-bold uppercase tracking-widest text-[#2C2A26] disabled:opacity-30 hover:opacity-70 transition-opacity"
                            >
                                Post
                            </button>
                        </form>
                    </div>

                    {/* Audit Log / Actions */}
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-[#2C2A26]/40 mb-6">Activity Log</h3>
                        <div className="border-l border-[#D6D1C7] ml-2 space-y-8 pl-8 relative">
                            {ticket.actions.map(action => (
                                <div key={action.id} className="relative">
                                    <div className="absolute -left-[37px] top-1.5 w-2 h-2 bg-[#2C2A26] rounded-full"></div>
                                    <p className="text-[#2C2A26] font-medium mb-1">{action.action}</p>
                                    <div className="flex text-[10px] uppercase tracking-widest text-[#A8A29E] gap-2">
                                        <span>{action.actor}</span>
                                        <span>•</span>
                                        <span>{new Date(action.timestamp).toLocaleString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TicketDetail;

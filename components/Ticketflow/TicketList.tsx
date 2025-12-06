import React from 'react';
import { Ticket } from './types';

interface TicketListProps {
    tickets: Ticket[];
    selectedTicketId: string | null;
    onSelectTicket: (ticket: Ticket) => void;
}

const TicketList: React.FC<TicketListProps> = ({ tickets, selectedTicketId, onSelectTicket }) => {
    return (
        <div className="bg-transparent h-full overflow-y-auto no-scrollbar">
            {/* Header removed as it's duplicate of Sidebar header */}
            <ul className="divide-y divide-[#D6D1C7]/50">
                {tickets.map(ticket => (
                    <li
                        key={ticket.id}
                        onClick={() => onSelectTicket(ticket)}
                        className={`p-5 cursor-pointer transition-all duration-300 group border-b border-[#D6D1C7]/30 ${selectedTicketId === ticket.id
                            ? 'bg-[#F5F2EB]'
                            : 'hover:bg-[#F5F2EB]/50'
                            }`}
                    >
                        {/* Row 1: Status and Date */}
                        <div className="flex justify-between items-center mb-2">
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-[2px] ${ticket.status === 'Open' ? 'bg-blue-100 text-blue-800' :
                                ticket.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                                    ticket.status === 'Resolved' ? 'bg-green-100 text-green-800' :
                                        'bg-gray-100 text-gray-800'
                                }`}>
                                {ticket.status}
                            </span>
                            <span className="text-[10px] font-bold text-[#A8A29E]">
                                {new Date(ticket.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                        </div>

                        {/* Row 2: Title */}
                        <h3 className={`font-serif text-[15px] font-bold leading-tight mb-1 ${selectedTicketId === ticket.id ? 'text-[#2C2A26]' : 'text-[#2C2A26]/90'
                            }`}>
                            {ticket.title}
                        </h3>

                        {/* Row 3: Description */}
                        <p className="text-xs text-[#2C2A26]/60 font-serif leading-relaxed line-clamp-2 mb-3">
                            {ticket.description}
                        </p>

                        {/* Row 4: Customer and ID */}
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-[#2C2A26]/80">
                                {ticket.customer_name || 'Unknown'}
                            </span>
                            <span className="text-[10px] text-[#A8A29E] uppercase tracking-widest">
                                ID: {ticket.id.substring(0, 6)}...
                            </span>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TicketList;

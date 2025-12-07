import React, { useState } from 'react';

interface CreateTicketModalProps {
    onClose: () => void;
    onCreate: (title: string, description: string, customerName: string) => void;
}

const CreateTicketModal: React.FC<CreateTicketModalProps> = ({ onClose, onCreate }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [customerName, setCustomerName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (title && description && customerName) {
            onCreate(title, description, customerName);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#2C2A26]/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-[#F5F2EB] w-full max-w-md shadow-2xl">
                <div className="p-8 border-b border-[#D6D1C7] bg-[#EBE5D9]/30">
                    <h2 className="text-2xl font-serif text-[#2C2A26]">New Ticket</h2>
                </div>
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-2">
                        <label className="block text-[#2C2A26] text-xs font-bold uppercase tracking-widest">Subject</label>
                        <input
                            type="text"
                            className="w-full bg-white border border-[#D6D1C7] p-3 text-[#2C2A26] placeholder-[#2C2A26]/30 focus:outline-none focus:border-[#2C2A26] transition-colors font-serif"
                            placeholder="Brief summary..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[#2C2A26] text-xs font-bold uppercase tracking-widest">Customer Name</label>
                        <input
                            type="text"
                            className="w-full bg-white border border-[#D6D1C7] p-3 text-[#2C2A26] placeholder-[#2C2A26]/30 focus:outline-none focus:border-[#2C2A26] transition-colors font-serif"
                            placeholder="Customer's full name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[#2C2A26] text-xs font-bold uppercase tracking-widest">Description</label>
                        <textarea
                            className="w-full bg-white border border-[#D6D1C7] p-3 text-[#2C2A26] placeholder-[#2C2A26]/30 focus:outline-none focus:border-[#2C2A26] transition-colors resize-none font-serif"
                            rows={4}
                            placeholder="Detailed explanation..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                        />
                    </div>
                    <div className="flex justify-end space-x-4 pt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 text-[#2C2A26] text-xs font-bold uppercase tracking-widest hover:bg-[#EBE5D9]/50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-[#2C2A26] text-[#F5F2EB] text-xs font-bold uppercase tracking-widest hover:bg-[#45423C] transition-colors"
                        >
                            Create
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateTicketModal;

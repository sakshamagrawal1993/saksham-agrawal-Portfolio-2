import React, { useState } from 'react';
import { useHealthTwinStore } from '../../store/healthTwin';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { StepsChart, HeartRateChart } from './Charts';
import { MessageSquare, LineChart } from 'lucide-react';

export const CenterPanel: React.FC = () => {
    const { activeTab, setActiveTab, chatHistory } = useHealthTwinStore();
    const [chatInput, setChatInput] = useState('');

    const handleSendMessage = () => {
        // Basic wiring for now
        if (!chatInput.trim()) return;
        console.log("Sending chat message:", chatInput);
        setChatInput('');
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-2 border-b border-[#EBE7DE] flex justify-center sticky top-0 bg-white z-10">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'chat' | 'graphs')} className="w-[300px]">
                    <TabsList className="grid w-full grid-cols-2 bg-[#F5F2EB]/50 p-1">
                        <TabsTrigger value="graphs" className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#A84A00]">
                            <LineChart size={16} className="mr-2" /> Data
                        </TabsTrigger>
                        <TabsTrigger value="chat" className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#A84A00]">
                            <MessageSquare size={16} className="mr-2" /> Chat
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex-1 overflow-hidden">
                {activeTab === 'graphs' ? (
                    <div className="p-6 overflow-y-auto h-full space-y-8">
                        <div className="bg-white border border-[#EBE7DE] shadow-sm rounded-2xl h-[350px] p-6">
                            <HeartRateChart />
                        </div>

                        <div className="bg-white border border-[#EBE7DE] shadow-sm rounded-2xl h-[350px] p-6 mb-8">
                            <StepsChart />
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col h-full pt-4">
                        <div className="flex-1 overflow-y-auto px-6 space-y-4">
                            {chatHistory.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-[#A8A29E] text-center px-8">
                                    <p>Ask me anything about your health data, lab reports, or wellness recommendations.</p>
                                </div>
                            ) : (
                                chatHistory.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] p-3 rounded-2xl ${msg.role === 'user' ? 'bg-[#A84A00] text-white rounded-br-none' : 'bg-[#F5F2EB] text-[#2C2A26] rounded-bl-none border border-[#EBE7DE]'
                                            }`}>
                                            <p className="text-sm">{msg.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Chat Input */}
                        <div className="p-4 bg-white border-t border-[#EBE7DE]">
                            <div className="relative flex items-center bg-[#F5F2EB] rounded-2xl border border-[#EBE7DE] focus-within:ring-1 focus-within:ring-[#A84A00] focus-within:border-[#A84A00] transition-colors p-1">
                                <input
                                    type="text"
                                    placeholder="Ask your Digital Twin..."
                                    className="flex-1 bg-transparent px-4 py-2 outline-none text-sm"
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!chatInput.trim()}
                                    className="bg-[#A84A00] hover:bg-[#8A3D00] disabled:bg-[#D6D1C7] text-white p-2 rounded-xl transition-colors m-1"
                                >
                                    <MessageSquare size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

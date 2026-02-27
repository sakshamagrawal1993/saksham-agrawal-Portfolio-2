import React, { useState } from 'react';
import { useHealthTwinStore } from '../../store/healthTwin';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
    ActivityChart, VitalsChart, ExerciseChart, SleepChart,
    NutritionChart, RecoveryChart, SymptomsChart, ReproductiveChart,
    EditDataModal
} from './Charts';
import { HealthParameter } from '../../store/healthTwin';
import { MessageSquare, LineChart, Activity, Heart, Dumbbell, Moon, Utensils, Brain, AlertCircle, Baby, LayoutGrid } from 'lucide-react';

const CATEGORIES = [
    { id: 'all', label: 'All', icon: LayoutGrid },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'vitals', label: 'Vitals', icon: Heart },
    { id: 'exercise', label: 'Exercise', icon: Dumbbell },
    { id: 'sleep', label: 'Sleep', icon: Moon },
    { id: 'nutrition', label: 'Nutrition', icon: Utensils },
    { id: 'recovery', label: 'Recovery', icon: Brain },
    { id: 'symptoms', label: 'Symptoms', icon: AlertCircle },
    { id: 'reproductive', label: 'Reproductive', icon: Baby },
] as const;

const CHART_COMPONENTS = [
    { id: 'activity', Component: ActivityChart, label: 'Activity' },
    { id: 'vitals', Component: VitalsChart, label: 'Vitals' },
    { id: 'exercise', Component: ExerciseChart, label: 'Exercise' },
    { id: 'sleep', Component: SleepChart, label: 'Sleep' },
    { id: 'nutrition', Component: NutritionChart, label: 'Nutrition' },
    { id: 'recovery', Component: RecoveryChart, label: 'Recovery' },
    { id: 'symptoms', Component: SymptomsChart, label: 'Symptoms' },
    { id: 'reproductive', Component: ReproductiveChart, label: 'Reproductive' },
];

export const CenterPanel: React.FC = () => {
    const { activeTab, setActiveTab, chatHistory, wearableParameters } = useHealthTwinStore();
    const [chatInput, setChatInput] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [editParams, setEditParams] = useState<HealthParameter[] | null>(null);

    const handleSendMessage = () => {
        if (!chatInput.trim()) return;
        console.log("Sending chat message:", chatInput);
        setChatInput('');
    };

    const handleEditClick = (params: HealthParameter[]) => {
        setEditParams(params);
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
                    <div className="flex flex-col h-full">
                        {/* Category Picker */}
                        <div className="px-4 py-3 border-b border-[#EBE7DE] overflow-x-auto flex-shrink-0">
                            <div className="flex gap-1.5 min-w-max">
                                {CATEGORIES.map(cat => {
                                    const Icon = cat.icon;
                                    const isActive = activeCategory === cat.id;
                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => setActiveCategory(cat.id)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${isActive
                                                    ? 'bg-[#A84A00] text-white shadow-sm'
                                                    : 'bg-[#F5F2EB] text-[#5D5A53] hover:bg-[#EBE7DE]'
                                                }`}
                                        >
                                            <Icon size={13} />
                                            {cat.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Chart Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {wearableParameters.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-[#A8A29E] text-center px-8">
                                    <div>
                                        <LineChart size={40} className="mx-auto mb-4 opacity-30" />
                                        <p className="font-serif">No wearable data yet.</p>
                                        <p className="text-sm mt-1">Add wearable data from the Sources panel to see visualizations.</p>
                                    </div>
                                </div>
                            ) : activeCategory === 'all' ? (
                                // ALL VIEW: render every category in sequence
                                <div className="space-y-10">
                                    {CHART_COMPONENTS.map(({ id, Component, label }) => {
                                        const hasCatData = wearableParameters.some(p => p.category === id);
                                        if (!hasCatData) return null;
                                        return (
                                            <div key={id}>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <span className="w-2 h-6 rounded-full bg-[#A84A00]" />
                                                    <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#5D5A53]">{label}</h2>
                                                </div>
                                                <Component data={wearableParameters} onEditClick={handleEditClick} />
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                (() => {
                                    const match = CHART_COMPONENTS.find(c => c.id === activeCategory);
                                    if (!match) return null;
                                    const Comp = match.Component;
                                    return <Comp data={wearableParameters} onEditClick={handleEditClick} />;
                                })()
                            )}
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

            {/* Edit Modal */}
            {editParams && <EditDataModal params={editParams} onClose={() => setEditParams(null)} />}
        </div>
    );
};

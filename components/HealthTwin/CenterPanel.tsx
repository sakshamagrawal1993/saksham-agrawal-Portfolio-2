import React, { useState } from 'react';
import { useHealthTwinStore } from '../../store/healthTwin';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
    ActivityChart, VitalsChart, ExerciseChart, SleepChart,
    NutritionChart, RecoveryChart, SymptomsChart, ReproductiveChart,
    LabReportsChart, EditDataModal
} from './Charts';
import { HealthParameter } from '../../store/healthTwin';
import { MessageSquare, LineChart, Activity, Heart, Dumbbell, Moon, Utensils, Brain, AlertCircle, Baby, LayoutGrid, MapPin, Wind, CloudSun, Droplet } from 'lucide-react';

const CATEGORIES = [
    { id: 'all', label: 'All', icon: LayoutGrid },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'vitals', label: 'Vitals', icon: Heart },
    { id: 'atmosphere', label: 'Atmosphere', icon: CloudSun },
    { id: 'exercise', label: 'Exercise', icon: Dumbbell },
    { id: 'sleep', label: 'Sleep', icon: Moon },
    { id: 'nutrition', label: 'Nutrition', icon: Utensils },
    { id: 'recovery', label: 'Recovery', icon: Brain },
    { id: 'symptoms', label: 'Symptoms', icon: AlertCircle },
    { id: 'reproductive', label: 'Reproductive', icon: Baby },
    { id: 'lab', label: 'Lab Reports', icon: Droplet },
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
    { id: 'lab', Component: LabReportsChart, label: 'Lab Reports' },
];

const AtmosphereWidget = ({ personalDetails }: { personalDetails: any }) => (
    <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-6 rounded-full bg-[#A84A00]" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#5D5A53]">Atmosphere</h2>
        </div>

        <div className="bg-white border border-[#EBE7DE] rounded-xl p-5 shadow-sm">
            {/* Location & Toggle */}
            <div className="flex justify-between items-start mb-6">
                <div className="flex gap-3 text-[#5D5A53]">
                    <MapPin size={24} className="text-[#ef4444]" />
                    <div>
                        <p className="font-bold text-[#2C2A26] text-lg leading-tight">{personalDetails?.location || 'San Francisco, CA'}</p>
                        <p className="text-xs font-mono text-[#A8A29E] uppercase tracking-wider mt-1">LAT: 37.77 • LON: -122.41</p>
                    </div>
                </div>
                <div className="flex text-xs font-bold">
                    <button className="bg-[#EBE7DE] text-[#3b82f6] px-4 py-2 rounded-l-lg hover:bg-[#D6D1C7] transition-colors shadow-inner">AIR</button>
                    <button className="bg-white border border-[#EBE7DE] border-l-0 text-[#A8A29E] px-4 py-2 rounded-r-lg hover:bg-[#F5F2EB] transition-colors">LOC</button>
                </div>
            </div>

            {/* Temp & AQI */}
            <div className="flex items-end justify-between mb-6 border-b border-[#EBE7DE] pb-6">
                <div>
                    <span className="text-6xl font-serif text-[#2C2A26] leading-none">78°</span>
                    <p className="text-xs font-bold text-[#A8A29E] uppercase tracking-widest mt-2">
                        Partly Cloudy • H: 65%
                    </p>
                </div>
                <div className="bg-[#10b981]/10 text-[#10b981] font-bold px-3 py-1.5 rounded-lg text-sm mb-1">
                    AQI 42
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center py-4 px-2 rounded-xl border border-[#EBE7DE] bg-[#FAF9F6]">
                    <p className="text-[11px] font-bold text-[#A8A29E] uppercase tracking-widest mb-1.5">PM2.5</p>
                    <p className="text-lg font-bold text-[#2C2A26]">12 <span className="text-[11px] text-[#A8A29E] font-normal">µg</span></p>
                </div>
                <div className="text-center py-4 px-2 rounded-xl border border-amber-200 bg-amber-50/50">
                    <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-1.5">Pollen</p>
                    <p className="text-lg font-bold text-amber-500">High</p>
                </div>
                <div className="text-center py-4 px-2 rounded-xl border border-[#EBE7DE] bg-[#FAF9F6]">
                    <p className="text-[11px] font-bold text-[#A8A29E] uppercase tracking-widest mb-1.5">UV Idx</p>
                    <p className="text-lg font-bold text-[#2C2A26]">6</p>
                </div>
            </div>

            {/* Suggestion alert */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                <Wind size={18} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-sm text-[#5D5A53] leading-relaxed">
                    <span className="font-bold text-blue-600">Suggestion: </span>
                    High pollen count detected. Consider indoor training or wearing sunglasses to reduce eye irritation during Zone 2 walks.
                </p>
            </div>
        </div>
    </div>
);

export const CenterPanel: React.FC = () => {
    const { activeTab, setActiveTab, chatHistory, wearableParameters, labParameters, personalDetails } = useHealthTwinStore();
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
                            {/* IF ATMOSPHERE CATEGORY IS ACTIVE STANDALONE */}
                            {activeCategory === 'atmosphere' && (
                                <div className="mb-10">
                                    <AtmosphereWidget personalDetails={personalDetails} />
                                </div>
                            )}

                            {/* Charts Content Container */}
                            {activeCategory !== 'atmosphere' && (activeCategory === 'lab' ? labParameters : wearableParameters).length === 0 ? (
                                <div className={`${activeCategory === 'all' ? 'h-full' : 'h-full'} flex items-center justify-center text-[#A8A29E] text-center px-8`}>
                                    <div>
                                        <LineChart size={40} className="mx-auto mb-4 opacity-30" />
                                        <p className="font-serif">No {activeCategory === 'lab' ? 'lab' : 'wearable'} data yet.</p>
                                        <p className="text-sm mt-1">Add data from the Sources panel to see visualizations.</p>
                                    </div>
                                </div>
                            ) : activeCategory === 'all' ? (
                                <div className="space-y-10">
                                    {CATEGORIES.filter(c => c.id !== 'all').map((cat) => {
                                        // Interleave Atmosphere before Exercise (which comes after Activity and Vitals based on CATEGORIES array)
                                        if (cat.id === 'atmosphere') {
                                            return (
                                                <div key="atmosphere">
                                                    <AtmosphereWidget personalDetails={personalDetails} />
                                                </div>
                                            );
                                        }

                                        const chartInfo = CHART_COMPONENTS.find(c => c.id === cat.id);
                                        if (!chartInfo) return null;

                                        const isLab = cat.id === 'lab';
                                        const hasCatData = isLab ? labParameters.length > 0 : wearableParameters.some(p => p.category === cat.id);
                                        if (!hasCatData) return null;

                                        const Component = chartInfo.Component;
                                        return (
                                            <div key={cat.id}>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <span className="w-2 h-6 rounded-full bg-[#A84A00]" />
                                                    <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#5D5A53]">{chartInfo.label}</h2>
                                                </div>
                                                <Component data={isLab ? labParameters : wearableParameters} onEditClick={handleEditClick} />
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : activeCategory !== 'atmosphere' ? (
                                (() => {
                                    const match = CHART_COMPONENTS.find(c => c.id === activeCategory);
                                    if (!match) return null;
                                    const Comp = match.Component;
                                    const dataToPass = activeCategory === 'lab' ? labParameters : wearableParameters;
                                    return <Comp data={dataToPass} onEditClick={handleEditClick} />;
                                })()
                            ) : null}
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

import React from 'react';
import { useHealthTwinStore } from '../../store/healthTwin';
import { Twin3D } from './Twin3D';
import { WellnessPrograms } from './WellnessPrograms';

export const RightPanel: React.FC = () => {
    const { scores } = useHealthTwinStore();

    return (
        <div className="flex flex-col h-full bg-[#FAF9F6] text-[#2C2A26]">
            {/* 3D Model Area */}
            <div className="h-[40vh] min-h-[300px] border-b border-[#EBE7DE] bg-gradient-to-b from-white to-[#F5F2EB] relative flex flex-col pt-4">
                <div className="flex items-center justify-between px-6 z-10">
                    <h3 className="font-serif text-lg">System Status</h3>
                    <span className="text-sm font-bold text-[#A84A00]">OPTIMAL</span>
                </div>

                <div className="flex-1 w-full h-full relative cursor-pointer">
                    <Twin3D />
                </div>
            </div>

            {/* Scores and Wellness Programs Scroll Area */}
            <div className="flex-1 overflow-y-auto w-full">
                {/* Key Health Pillars */}
                <div className="p-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E] mb-4">Core Systems</h3>

                    <div className="grid grid-cols-2 gap-3 mb-8">
                        {scores.length > 0 ? (
                            scores.map(scoreItem => (
                                <div
                                    key={scoreItem.category}
                                    className={`bg-white p-3 rounded-xl border border-[#EBE7DE] shadow-sm flex flex-col justify-between ${scoreItem.category === 'Overall Health' ? 'col-span-2 bg-[#F5F2EB]/50 border-[#A84A00]/20' : ''
                                        }`}
                                >
                                    <span className="text-xs text-[#5D5A53] font-medium">{scoreItem.category}</span>
                                    <div className="flex items-end justify-between mt-2">
                                        <span className={`font-serif ${scoreItem.category === 'Overall Health' ? 'text-3xl text-[#A84A00]' : 'text-lg'}`}>
                                            {scoreItem.score}
                                        </span>
                                        {scoreItem.category !== 'Overall Health' && (
                                            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-bold">+2</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            ['Overall Health', 'Energy', 'Recovery', 'Focus', 'Defense', 'Cardio', 'Vitals', 'Environment'].map(cat => (
                                <div
                                    key={cat}
                                    className={`bg-white p-3 rounded-xl border border-[#EBE7DE] shadow-sm flex flex-col justify-between opacity-50 ${cat === 'Overall Health' ? 'col-span-2 bg-[#F5F2EB]/50 border-[#A84A00]/20' : ''
                                        }`}
                                >
                                    <span className="text-xs text-[#5D5A53] font-medium">{cat}</span>
                                    <div className="flex items-end justify-between mt-2">
                                        <span className={`font-serif ${cat === 'Overall Health' ? 'text-3xl text-[#A84A00]' : 'text-lg'}`}>--</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Wellness Programs */}
                    <div className="mt-6">
                        <WellnessPrograms />
                    </div>
                </div>
            </div>
        </div>
    );
};

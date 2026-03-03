import React from 'react';
import { usePlaygroundStore } from '../../../store/playgroundStore';
import { ProgramCard } from '../WellnessPrograms';
import { Zap, CheckCircle2, Sparkles, Loader2, RefreshCw } from 'lucide-react';

export const PlaygroundWellnessPanel: React.FC = () => {
    const { changedParams, wellnessPrograms, simulationSummary, isGeneratingWellness, generateWellnessPlan } = usePlaygroundStore();

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#FAF9F6]">
            <div className="p-4 border-b border-[#EBE7DE] shrink-0 bg-white flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-serif text-[#A84A00]">Parallel Wellness Engine</h2>
                    <p className="text-[10px] text-[#A8A29E] font-medium tracking-wide uppercase mt-1">
                        Simulation-specific interventions
                    </p>
                </div>
                {changedParams.size > 0 && (
                    <button
                        onClick={generateWellnessPlan}
                        disabled={isGeneratingWellness}
                        className="bg-[#A84A00] hover:bg-[#8B3D00] disabled:bg-[#A84A00]/50 text-white p-2 rounded-lg shadow-sm transition-all flex items-center gap-2 group"
                        title="Generate personalized plans"
                    >
                        {isGeneratingWellness ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-wider">Generate</span>
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {changedParams.size === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <div className="w-12 h-12 rounded-full bg-[#EBE7DE] flex items-center justify-center mb-4">
                            <Zap className="w-6 h-6 text-[#A8A29E]" />
                        </div>
                        <h3 className="text-sm font-semibold text-[#2C2A26]">No Simulations Detected</h3>
                        <p className="text-xs text-[#5D5A53] mt-2 leading-relaxed">
                            Adjust parameters on the left and click "Save & Recalculate" to generate simulated wellness plans.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Summary Card */}
                        <div className="bg-[#A84A00] p-4 rounded-2xl shadow-lg relative overflow-hidden group mb-2">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                <Sparkles className="w-20 h-20 text-white" />
                            </div>
                            <div className="relative z-10">
                                <span className="text-[10px] text-white/70 font-bold uppercase tracking-widest">Digital Twin simulation</span>
                                <h3 className="text-white font-serif text-lg mt-1">
                                    Health Analysis
                                </h3>
                                <p className="text-white/80 text-xs mt-2 leading-relaxed">
                                    {simulationSummary || 'These interventions are dynamically mapped to your "What-If" scenario to optimize health trajectories.'}
                                </p>
                            </div>
                        </div>

                        {/* Plans List */}
                        <div className="space-y-4">
                            {wellnessPrograms.map((program, idx) => (
                                <div key={idx} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${idx * 150}ms` }}>
                                    <ProgramCard program={program} />
                                </div>
                            ))}
                        </div>

                        {/* Action CTA */}
                        {wellnessPrograms.length > 0 && (
                            <button className="w-full mt-4 bg-white border border-[#EBE7DE] p-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
                                <div className="flex flex-col items-start text-left">
                                    <span className="text-[10px] font-bold text-[#A84A00] uppercase">Scenario Management</span>
                                    <span className="text-xs font-semibold text-[#2C2A26] mt-0.5">Save this Simulation Profile</span>
                                </div>
                                <CheckCircle2 className="w-5 h-5 text-[#A8A29E] group-hover:text-[#A84A00] transition-colors" />
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

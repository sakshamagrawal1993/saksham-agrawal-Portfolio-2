import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useHealthTwinStore } from '../../../store/healthTwin';
import { defaultPlaygroundParams, usePlaygroundStore } from '../../../store/playgroundStore';
import { Loader2, ArrowLeft, RefreshCw, Zap } from 'lucide-react';
import { PlaygroundInputPanel } from './PlaygroundInputPanel';
import { PlaygroundScorePanel } from './PlaygroundScorePanel';
import { PlaygroundWellnessPanel } from './PlaygroundWellnessPanel';
import { mapRealDataToPlaygroundBaseline } from './playgroundBaselineMapper';

export const PlaygroundLayout: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Main Store (Source of truth for baseline)
    const {
        activeTwinId,
        parameterDefinitions,
        parameterRanges,
        personalDetails,
        scores: baselineScores,
        labParameters,
        wearableParameters
    } = useHealthTwinStore();

    // Playground Store (Simulation state)
    const {
        initializeBaseline,
        resetToBaseline,
        recalculateScores,
        parameters,
        changedParams
    } = usePlaygroundStore();

    const [loading, setLoading] = useState(true);

    const isInitialized = React.useRef(false);

    // 1. Initial Sync: Load baseline data from the main store into the playground store
    useEffect(() => {
        if (!id || activeTwinId !== id) {
            navigate(`/health-twin/${id || ''}`);
            return;
        }

        if (isInitialized.current) return;

        const syncBaseline = () => {
            const baseline = mapRealDataToPlaygroundBaseline({
                defaults: defaultPlaygroundParams,
                labParameters,
                wearableParameters,
                parameterDefinitions,
                personalDetails,
            });

            initializeBaseline(baseline, baselineScores);
            isInitialized.current = true;
            setLoading(false);
        };

        syncBaseline();
    }, [id, activeTwinId, navigate, labParameters, wearableParameters, parameterDefinitions, personalDetails, baselineScores, initializeBaseline]);

    // 2. Continuous Recalculation: Trigger scores on parameter change
    useEffect(() => {
        if (!loading) {
            recalculateScores(parameterDefinitions, parameterRanges);
        }
    }, [parameters, parameterDefinitions, parameterRanges, recalculateScores, loading]);

    if (loading) {
        return (
            <div className="h-screen w-full bg-[#FAF9F6] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#A84A00]" />
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-[#FAF9F6] text-[#2C2A26] flex flex-col font-sans overflow-hidden">
            {/* Top Navigation Bar */}
            <header className="h-14 border-b border-[#EBE7DE] flex items-center justify-between px-6 shrink-0 bg-white">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/health-twin/${id}`)}
                        className="p-2 hover:bg-[#FAF9F6] rounded-full transition-colors text-[#5D5A53]"
                        title="Back to Dashboard"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="h-6 w-[1px] bg-[#EBE7DE]" />
                    <Zap className="w-5 h-5 text-[#A84A00] fill-[#A84A00]" />
                    <h1 className="text-xl font-serif text-[#A84A00]">Digital Twin Playground</h1>
                    <span className="text-xs bg-[#F5F1E8] text-[#A84A00] px-2 py-0.5 rounded-full font-bold tracking-wider uppercase">
                        Simulation Mode
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={resetToBaseline}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#5D5A53] hover:text-[#A84A00] transition-colors"
                        disabled={changedParams.size === 0}
                    >
                        <RefreshCw className={`w-4 h-4 ${changedParams.size > 0 ? 'animate-spin-once' : 'opacity-50'}`} />
                        Reset to Real Data
                    </button>
                </div>
            </header>

            {/* 3-Column Playground Area */}
            <main className="flex-1 overflow-hidden">
                <div className="grid grid-cols-[320px_minmax(350px,450px)_1fr] h-full">
                    {/* Left Column: Parameter Control */}
                    <section className="h-full border-r border-[#EBE7DE] bg-[#FAF9F6] flex flex-col shadow-[inset_-4px_0_12px_rgba(0,0,0,0.02)] overflow-hidden">
                        <PlaygroundInputPanel />
                    </section>

                    {/* Center Column: Avatar & Simulation */}
                    <section className="h-full bg-white flex flex-col shadow-sm overflow-hidden min-w-0">
                        <PlaygroundScorePanel />
                    </section>

                    {/* Right Column: Dynamic Recommendations */}
                    <section className="h-full border-l border-[#EBE7DE] bg-[#FAF9F6] flex flex-col shadow-[inset_4px_0_12px_rgba(0,0,0,0.02)] overflow-hidden">
                        <PlaygroundWellnessPanel />
                    </section>
                </div>
            </main>
        </div>
    );
};

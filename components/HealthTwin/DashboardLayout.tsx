import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useHealthTwinStore } from '../../store/healthTwin';
import { loadHealthTwinData } from '../../lib/healthTwin/loadTwinData';
import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';
import { Loader2, Zap } from 'lucide-react';

export const HealthTwinDashboard: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { twins, activeTwinId } = useHealthTwinStore();

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const cancelledRef = { cancelled: false };
        const initDashboard = async () => {
            setLoading(true);
            if (!id) {
                navigate('/health-twin');
                return;
            }

            const store = useHealthTwinStore.getState();
            if (store.activeTwinId && store.activeTwinId !== id) {
                // Switching twins: clear the previous twin's profile, data,
                // and chat session so it never leaks onto the new twin's view.
                store.resetForTwinChange();
            }

            const result = await loadHealthTwinData(id, cancelledRef);
            if (cancelledRef.cancelled) return;

            if (result === 'unauthenticated') {
                navigate('/login?redirect=/health-twin');
                return;
            }
            if (result === 'not_found') {
                navigate('/health-twin');
                return;
            }

            setLoading(false);
        };

        initDashboard().catch((err) => {
            console.error("Failed to initialize Health Twin dashboard:", err);
            if (!cancelledRef.cancelled) setLoading(false);
        });
        return () => {
            cancelledRef.cancelled = true;
        };
    }, [id, navigate]);

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
                    <a href="/" className="text-sm font-semibold tracking-wider uppercase hover:text-[#A84A00] transition-colors">
                        Portfolio
                    </a>
                    <span className="text-[#A8A29E]">/</span>
                    <h1 className="text-xl font-serif text-[#A84A00]">Health Twin</h1>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-sm text-[#5D5A53]">Active Twin:</span>
                    <select
                        className="bg-transparent text-sm outline-none font-medium cursor-pointer max-w-[200px] truncate mr-4"
                        value={activeTwinId || ''}
                        onChange={(e) => navigate(`/health-twin/${e.target.value}`)}
                    >
                        <option value="" disabled>Select Twin Profile...</option>
                        {twins.map(twin => (
                            <option key={twin.id} value={twin.id}>{twin.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => navigate(`/health-twin/${id}/playground`)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#F5F1E8] text-[#A84A00] text-xs font-bold rounded-lg hover:bg-[#EBE7DE] transition-colors tracking-wider uppercase border border-[#EBE7DE]"
                    >
                        <Zap className="w-3.5 h-3.5 fill-[#A84A00]" />
                        Open Playground
                    </button>
                </div>
            </header>

            {/* 3-Column Main Dashboard Area */}
            <main className="flex-1 overflow-hidden flex">
                {/* Left Column: Data Sources */}
                <section className="w-[300px] border-r border-[#EBE7DE] bg-[#FAF9F6] flex flex-col shrink-0">
                    <LeftPanel />
                </section>

                {/* Center Column: Chat & Visualizations */}
                <section className="flex-1 bg-white flex flex-col min-w-0">
                    <CenterPanel />
                </section>

                {/* Right Column: Digital Twin & Recommendations */}
                <section className="w-[350px] border-l border-[#EBE7DE] bg-[#FAF9F6] flex flex-col shrink-0">
                    <RightPanel />
                </section>
            </main>
        </div>
    );
};

export default HealthTwinDashboard;

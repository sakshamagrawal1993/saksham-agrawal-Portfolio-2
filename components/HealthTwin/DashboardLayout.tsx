import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useHealthTwinStore } from '../../store/healthTwin';
import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';
import { Loader2 } from 'lucide-react';

export const HealthTwinDashboard: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const {
        twins,
        activeTwinId,
        setTwins,
        setActiveTwin,
        setPersonalDetails,
        setSummary,
        setLabParameters,
        setWearableParameters,
        setScores,
        setRecommendations,
        setSources,
        setDailyAggregates
    } = useHealthTwinStore();

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initDashboard = async () => {
            if (!id) {
                navigate('/health-twin');
                return;
            }

            // Check if user is logged in
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login?redirect=/health-twin');
                return;
            }

            // Verify the twin exists and belongs to the user
            const { data, error } = await supabase
                .from('health_twins')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !data) {
                console.error("Failed to load twin profile:", error);
                navigate('/health-twin');
                return;
            }

            // Make sure the twin is in our state list
            if (!twins.find(t => t.id === data.id)) {
                setTwins([data, ...twins]);
            }

            setActiveTwin(data.id);

            // Fetch the rest of the 8-table data concurrently
            try {
                const [
                    personalData,
                    summaryData,
                    labData,
                    wearableData,
                    scoresData,
                    recData,
                    sourcesData,
                    definitionsData,
                    rangesData,
                    aggregatesData
                ] = await Promise.all([
                    supabase.from('health_personal_details').select('*').eq('twin_id', data.id).maybeSingle(),
                    supabase.from('health_summary').select('*').eq('twin_id', data.id).maybeSingle(),
                    supabase.from('health_lab_parameters').select('*').eq('twin_id', data.id).order('recorded_at', { ascending: false }),
                    supabase.from('health_wearable_parameters').select('*').eq('twin_id', data.id).order('recorded_at', { ascending: false }),
                    supabase.from('health_scores').select('*').eq('twin_id', data.id),
                    supabase.from('health_recommendations').select('*').eq('twin_id', data.id).order('created_at', { ascending: false }),
                    supabase.from('health_sources').select('*').eq('twin_id', data.id).order('created_at', { ascending: false }),
                    supabase.from('health_parameter_definitions').select('*'),
                    supabase.from('health_parameter_ranges').select('*'),
                    supabase.from('health_daily_aggregates').select('*').eq('twin_id', data.id).order('date', { ascending: false })
                ]);

                setPersonalDetails(personalData.data || null);
                setSummary(summaryData.data || null);
                setLabParameters(labData.data || []);
                setWearableParameters(wearableData.data || []);
                setScores(scoresData.data || []);
                setRecommendations(recData.data || []);
                setSources(sourcesData.data || []);
                setDailyAggregates(aggregatesData.data || []);

                // Store definitions and ranges
                useHealthTwinStore.getState().setParameterDefinitions(definitionsData.data || []);
                useHealthTwinStore.getState().setParameterRanges(rangesData.data || []);

                // Calculate fresh 0-100 scores
                useHealthTwinStore.getState().calculateLiveScores();
            } catch (err) {
                console.error("Error loading twin sub-data:", err);
            }

            setLoading(false);
        };

        initDashboard();
    }, [id, navigate, setActiveTwin, twins, setTwins, setPersonalDetails, setSummary, setLabParameters, setWearableParameters, setScores, setRecommendations, setSources, setDailyAggregates]);

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
                        className="bg-transparent text-sm outline-none font-medium cursor-pointer max-w-[200px] truncate"
                        value={activeTwinId || ''}
                        onChange={(e) => navigate(`/health-twin/${e.target.value}`)}
                    >
                        <option value="" disabled>Select Twin Profile...</option>
                        {twins.map(twin => (
                            <option key={twin.id} value={twin.id}>{twin.name}</option>
                        ))}
                    </select>
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

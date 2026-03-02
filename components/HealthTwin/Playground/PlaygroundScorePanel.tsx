import { usePlaygroundStore } from '../../../store/playgroundStore';
import { Twin3D } from '../Twin3D';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const PlaygroundScorePanel: React.FC = () => {
    const { scores, baselineScores, parameters } = usePlaygroundStore();

    // Find Overall Score
    const overallScore = scores.find(s => s.category === 'Overall Health')?.score ?? 0;
    const baselineOverall = baselineScores.find(s => s.category === 'Overall Health')?.score ?? 0;
    const overallDelta = overallScore - baselineOverall;

    // Filter out overall for the grid
    const axisScores = scores.filter(s => s.category !== 'Overall Health');

    const getDeltaInfo = (category: string, currentScore: number) => {
        const baseline = baselineScores.find(s => s.category === category)?.score ?? currentScore;
        const delta = currentScore - baseline;
        return {
            delta,
            color: delta > 0 ? 'text-emerald-600 bg-emerald-50' : (delta < 0 ? 'text-rose-600 bg-rose-50' : 'text-[#A8A29E] bg-[#F5F1E8]'),
            Icon: delta > 0 ? TrendingUp : (delta < 0 ? TrendingDown : Minus)
        };
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
            {/* Top Score Summary */}
            <div className="p-8 border-b border-[#EBE7DE] bg-gradient-to-b from-[#FAF9F6] to-white shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E]">Simulated Health State</h2>
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm border ${overallScore >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        (overallScore >= 60 ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-rose-50 text-rose-700 border-rose-100')
                        }`}>
                        {overallScore >= 80 ? 'Optimal' : (overallScore >= 60 ? 'Fair' : 'Critical')}
                    </div>
                </div>

                <div className="flex items-baseline gap-4">
                    <span className="text-6xl font-serif text-[#A84A00] tracking-tighter">
                        {overallScore}
                    </span>
                    <div className="flex flex-col">
                        <span className="text-xs font-medium text-[#5D5A53]">Overall Score</span>
                        {overallDelta !== 0 && (
                            <div className={`flex items-center gap-1 text-sm font-bold mt-0.5 ${overallDelta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {overallDelta > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                {overallDelta > 0 ? '+' : ''}{overallDelta} vs Real Baseline
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Middle: 3D Visualization */}
            <div className="flex-1 min-h-[300px] relative bg-white group overflow-hidden">
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none bg-[radial-gradient(#EBE7DE_1px,transparent_1px)] [background-size:20px_20px]" />
                <div className="w-full h-full relative z-10">
                    <Twin3D gender={parameters.gender} />
                </div>
            </div>

            {/* Bottom Grid: All Axis Details */}
            <div className="p-6 bg-[#FAF9F6] border-t border-[#EBE7DE] shrink-0">
                <div className="grid grid-cols-3 gap-3">
                    {axisScores.map(scoreItem => {
                        const { delta, color, Icon } = getDeltaInfo(scoreItem.category, scoreItem.score);
                        return (
                            <div key={scoreItem.category} className="bg-white p-3 rounded-xl border border-[#EBE7DE] shadow-sm flex flex-col justify-between">
                                <div className="flex items-start justify-between">
                                    <span className="text-[10px] text-[#5D5A53] font-semibold leading-tight pr-2">
                                        {scoreItem.category}
                                    </span>
                                    <Icon className={`w-3 h-3 ${delta > 0 ? 'text-emerald-500' : (delta < 0 ? 'text-rose-500' : 'text-[#A8A29E]')}`} />
                                </div>
                                <div className="flex items-end justify-between mt-2">
                                    <span className="text-xl font-serif text-[#2C2A26]">{scoreItem.score}</span>
                                    {delta !== 0 && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${color}`}>
                                            {delta > 0 ? '+' : ''}{delta}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

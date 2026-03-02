import { Info } from 'lucide-react';

interface ParameterSliderProps {
    label: string;
    value: number;
    onChange: (val: number) => void;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    description?: string;
    optimalMin?: number;
    optimalMax?: number;
    isBoolean?: boolean;
}

export const ParameterSlider: React.FC<ParameterSliderProps> = ({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    unit = '',
    description,
    optimalMin,
    optimalMax,
    isBoolean = false
}) => {
    // Determine rail color based on optimal range
    const getRangeColor = (val: number) => {
        if (optimalMin !== undefined && optimalMax !== undefined) {
            if (val >= optimalMin && val <= optimalMax) return 'bg-[#16A34A]'; // Green
            return 'bg-[#CA8A04]'; // Amber
        }
        return 'bg-[#A84A00]';
    };

    if (isBoolean) {
        return (
            <div className="flex items-center justify-between p-2 hover:bg-[#F5F1E8] rounded-lg transition-colors group">
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-[#2C2A26]">{label}</span>
                        {description && (
                            <div className="group/info relative">
                                <Info className="w-3.5 h-3.5 text-[#A8A29E] cursor-help" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-[#2C2A26] text-white text-[10px] rounded shadow-lg opacity-0 pointer-events-none group-hover/info:opacity-100 transition-opacity z-50">
                                    {description}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => onChange(value === 1 ? 0 : 1)}
                    className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${value === 1 ? 'bg-[#A84A00]' : 'bg-[#EBE7DE]'
                        }`}
                >
                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${value === 1 ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 p-2 hover:bg-[#F5F1E8] rounded-lg transition-colors group">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-[#2C2A26]">{label}</span>
                    {description && (
                        <div className="group/info relative">
                            <Info className="w-3.5 h-3.5 text-[#A8A29E] cursor-help" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-[#2C2A26] text-white text-[10px] rounded shadow-lg opacity-0 pointer-events-none group-hover/info:opacity-100 transition-opacity z-50">
                                {description}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="w-16 h-6 px-1.5 text-xs text-right bg-white border border-[#EBE7DE] rounded focus:outline-none focus:border-[#A84A00]"
                    />
                    <span className="text-[10px] text-[#A8A29E] font-medium w-6 uppercase">{unit}</span>
                </div>
            </div>

            <div className="relative h-6 flex items-center px-1">
                {/* Visual Optimal Range Indicator */}
                {optimalMin !== undefined && optimalMax !== undefined && (
                    <div
                        className="absolute h-1 bg-[#16A34A]/20 rounded-full top-1/2 -translate-y-1/2"
                        style={{
                            left: `${((optimalMin - min) / (max - min)) * 100}%`,
                            width: `${((optimalMax - optimalMin) / (max - min)) * 100}%`
                        }}
                    />
                )}

                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className={`w-full h-1 rounded-full appearance-none cursor-pointer accent-[#A84A00] ${getRangeColor(value)}`}
                />
            </div>

            {/* Range Labels */}
            <div className="flex justify-between px-0.5">
                <span className="text-[10px] text-[#A8A29E]">{min}</span>
                <span className="text-[10px] text-[#A8A29E]">{max}</span>
            </div>
        </div>
    );
};

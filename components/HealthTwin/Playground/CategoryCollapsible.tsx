import React, { useState } from 'react';
import { ChevronDown, ChevronRight, LucideIcon } from 'lucide-react';

interface CategoryCollapsibleProps {
    title: string;
    icon: LucideIcon;
    children: React.ReactNode;
    defaultExpanded?: boolean;
    count?: number;
}

export const CategoryCollapsible: React.FC<CategoryCollapsibleProps> = ({
    title,
    icon: Icon,
    children,
    defaultExpanded = false,
    count
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="border-b border-[#EBE7DE] last:border-0">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full h-12 flex items-center justify-between px-4 hover:bg-[#F5F1E8] transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white rounded-md shadow-sm border border-[#EBE7DE]">
                        <Icon className="w-4 h-4 text-[#A84A00]" />
                    </div>
                    <span className="text-sm font-semibold text-[#2C2A26]">{title}</span>
                    {count !== undefined && (
                        <span className="text-[10px] bg-[#EBE7DE] text-[#5D5A53] px-1.5 py-0.5 rounded-full font-bold">
                            {count}
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[#A8A29E]" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-[#A8A29E]" />
                )}
            </button>

            {isExpanded && (
                <div className="px-2 pb-4 pt-1 flex flex-col gap-1">
                    {children}
                </div>
            )}
        </div>
    );
};

import React from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { DYNAMIC_VIDEOS } from '../../../lib/dynamicContentLibrary';

interface DynamicVideoRendererProps {
    payload: string; // The video ID
}

export const DynamicVideoRenderer: React.FC<DynamicVideoRendererProps> = ({ payload }) => {
    const videoDef = DYNAMIC_VIDEOS[payload];

    if (!videoDef) {
        return (
            <div className="p-3 bg-[#F5F0EB] text-[#2C2A26] rounded-xl text-xs italic opacity-70">
                Video unavailable.
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2 w-[260px] md:w-[320px] rounded-2xl overflow-hidden border border-[#E8E4DE] bg-white shadow-sm"
        >
            <div className="relative aspect-video bg-black/5 group cursor-pointer">
                <iframe
                    src={videoDef.url}
                    className="w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={videoDef.title}
                ></iframe>
            </div>
            <div className="p-3">
                <div className="flex items-center gap-1.5 mb-1 text-[#6B8F71] text-xs font-semibold uppercase tracking-wide">
                    <Play size={12} fill="currentColor" />
                    {videoDef.durationMinutes} Min Session
                </div>
                <h4 className="text-sm font-semibold text-[#2C2A26] line-clamp-1">{videoDef.title}</h4>
                <p className="text-xs text-[#2C2A26]/70 mt-0.5 line-clamp-2">{videoDef.description}</p>
            </div>
        </motion.div>
    );
};

import React from 'react';

interface BrandIconProps {
    className?: string;
    isDark?: boolean; // True if the surrounding text is dark (so logo stays Black). False if text is light (Logo needs to be White).
}

export const BrandIcon: React.FC<BrandIconProps> = ({ className = "w-8 h-8", isDark = true }) => {
    return (
        <div className={`relative ${className} flex items-center justify-center overflow-hidden`}>
            <img
                src="/assets/brand-s.png"
                alt="S Logo"
                className={`w-full h-full object-contain transition-all duration-300 ${isDark
                        ? 'mix-blend-multiply' // Keep Black, Transparent White
                        : 'invert mix-blend-screen' // Invert to White, Transparent Black
                    }`}
            />
        </div>
    );
};

"use client";

import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

interface TypingAnimationProps {
    text: string;
    duration?: number;
    className?: string;
    delay?: number;
    as?: React.ElementType;
}

export function TypingAnimation({
    text,
    duration = 150,
    className,
    delay = 0,
    as: Component = "h1",
}: TypingAnimationProps) {
    const [displayedText, setDisplayedText] = useState<string>("");
    const [i, setI] = useState<number>(0);
    const [started, setStarted] = useState(false);

    useEffect(() => {
        const startTimeout = setTimeout(() => {
            setStarted(true);
        }, delay);
        return () => clearTimeout(startTimeout);
    }, [delay]);

    useEffect(() => {
        if (!started) return;

        const typingEffect = setInterval(() => {
            if (i < text.length) {
                setDisplayedText(text.substring(0, i + 1));
                setI(i + 1);
            } else {
                clearInterval(typingEffect);
            }
        }, duration);

        return () => {
            clearInterval(typingEffect);
        };
    }, [duration, i, started, text]);

    return (
        <Component
            className={cn(
                "font-display text-4xl font-bold leading-[5rem] tracking-[-0.02em] drop-shadow-sm",
                className,
            )}
        >
            {displayedText}
        </Component>
    );
}

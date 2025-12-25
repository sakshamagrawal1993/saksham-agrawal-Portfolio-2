"use client"

import * as React from "react"
import { motion, useMotionValue, useTransform } from "framer-motion"
import { Eye, EyeOff, Wifi } from "lucide-react"
import { cn } from "../../lib/utils"

const PERSPECTIVE = 1000
const CARD_ANIMATION_DURATION = 0.6
const INITIAL_DELAY = 0.2

interface CreditCardProps extends React.HTMLAttributes<HTMLDivElement> {
    cardNumber?: string
    cardHolder?: string
    expiryDate?: string
    cvv?: string
    variant?: "gradient" | "dark" | "glass"
}

export default function CreditCard({
    cardNumber = "4532 1234 5678 9010",
    cardHolder = "SAKSHAM AGRAWAL",
    expiryDate = "12/28",
    cvv = "123",
    variant = "gradient",
}: CreditCardProps) {
    const [isVisible, setIsVisible] = React.useState(false)
    const [isFlipped, setIsFlipped] = React.useState(false)
    const [isClicked, setIsClicked] = React.useState(false)

    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const rotateX = useTransform(y, [-100, 100], [10, -10])
    const rotateY = useTransform(x, [-100, 100], [-10, 10])

    const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        x.set(event.clientX - centerX)
        y.set(event.clientY - centerY)
    }

    const handleMouseLeave = () => {
        x.set(0)
        y.set(0)
    }

    const getMaskedNumber = (number: string) => {
        const cleaned = number.replace(/\s/g, '')
        const lastFour = cleaned.slice(-4)
        return `•••• •••• •••• ${lastFour}`
    }

    const variantStyles = {
        gradient: "bg-gradient-to-br from-[#9c27b0] via-[#673ab7] to-[#3f51b5]", // BharatPe Unity colors approx
        dark: "bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900",
        glass: "bg-white/15 dark:bg-white/10 backdrop-blur-xl border border-white/20",
    }

    return (
        <div className="flex items-center justify-center py-20 w-full bg-[#f5f2eb]">
            {/* Removed full screen constraints to fit in portfolio detail */}

            <div className="relative">
                <motion.div
                    className="relative w-96 h-56"
                    style={{ perspective: PERSPECTIVE }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: CARD_ANIMATION_DURATION }}
                >
                    <motion.div
                        className="relative w-full h-full cursor-pointer"
                        style={{
                            transformStyle: "preserve-3d",
                            rotateX,
                            rotateY: isFlipped ? 180 : rotateY,
                        }}
                        animate={{
                            scale: isClicked ? 0.95 : 1,
                        }}
                        transition={{ duration: 0.6, type: "spring", stiffness: 100, damping: 20 }}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => {
                            setIsClicked(true)
                            setTimeout(() => setIsClicked(false), 200)
                            setTimeout(() => setIsFlipped(!isFlipped), 100)
                        }}
                    >
                        {/* Front of card */}
                        <motion.div
                            className={cn(
                                "absolute inset-0 rounded-2xl p-8 shadow-2xl",
                                variantStyles[variant],
                                "backface-hidden"
                            )}
                            style={{
                                backfaceVisibility: "hidden",
                                WebkitBackfaceVisibility: "hidden"
                            }}
                        >
                            {/* Card shimmer effect */}
                            <div className="absolute inset-0 rounded-2xl overflow-hidden">
                                <motion.div
                                    className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0"
                                    animate={{
                                        x: ["-100%", "100%"],
                                    }}
                                    transition={{
                                        duration: 3,
                                        repeat: Infinity,
                                        repeatDelay: 3,
                                        ease: "linear",
                                    }}
                                />
                            </div>

                            {/* Card content */}
                            <div className="relative h-full flex flex-col justify-between text-white">
                                {/* Top section */}
                                <div className="flex justify-between items-start">
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: INITIAL_DELAY }}
                                        className="flex items-center gap-4"
                                    >
                                        <div className="w-12 h-9 rounded bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-inner" /> {/* Chip */}
                                        <Wifi className="w-6 h-6 rotate-90" />
                                    </motion.div>

                                    <motion.div className="font-bold italic text-lg tracking-widest">
                                        BharatPe
                                    </motion.div>

                                    <motion.button
                                        className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{
                                            delay: 0.4,
                                            type: "spring",
                                            stiffness: 200,
                                            damping: 15
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setIsVisible(!isVisible)
                                        }}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                    >
                                        {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </motion.button>
                                </div>

                                {/* Card number */}
                                <motion.div
                                    className="text-2xl font-mono tracking-wider"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                >
                                    {isVisible ? cardNumber : getMaskedNumber(cardNumber)}
                                </motion.div>

                                {/* Bottom section */}
                                <div className="flex justify-between items-end">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.4 }}
                                    >
                                        <div className="text-xs opacity-70 mb-1">CARD HOLDER</div>
                                        <div className="font-medium text-sm tracking-wide uppercase">{cardHolder}</div>
                                    </motion.div>

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5 }}
                                    >
                                        <div className="text-xs opacity-70 mb-1">EXPIRES</div>
                                        <div className="font-medium text-sm">{isVisible ? expiryDate : "••/••"}</div>
                                    </motion.div>

                                    <motion.div
                                        className="text-3xl font-bold italic"
                                        initial={{ opacity: 0, scale: 0 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{
                                            delay: 0.6,
                                            type: "spring",
                                            stiffness: 200
                                        }}
                                    >
                                        VISA
                                    </motion.div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Back of card */}
                        <motion.div
                            className={cn(
                                "absolute inset-0 rounded-2xl shadow-2xl",
                                variantStyles[variant],
                                "backface-hidden"
                            )}
                            style={{
                                backfaceVisibility: "hidden",
                                WebkitBackfaceVisibility: "hidden",
                                transform: "rotateY(180deg)"
                            }}
                        >
                            {/* Magnetic strip */}
                            <div className="absolute top-8 left-0 right-0 h-12 bg-black/80" />

                            {/* Signature panel */}
                            <div className="absolute top-24 left-6 right-6 bg-white/90 h-10 rounded flex items-center justify-end px-3">
                                <motion.div
                                    className="text-black font-mono font-bold"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    {isVisible ? cvv : "•••"}
                                </motion.div>
                            </div>

                            {/* Card info */}
                            <div className="absolute bottom-8 left-8 right-8 text-white text-xs space-y-2 opacity-70">
                                <p>This card is property of Unity Bank / BharatPe.</p>
                                <p>Customer Service: 1-800-BHARATPE</p>
                                <p className="text-[10px]">
                                    Use of this card is governed by the Cardholder Agreement.
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>

                    {/* Click ripple effect */}
                    {isClicked && (
                        <motion.div
                            className="absolute inset-0 rounded-2xl"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1.1, opacity: 0 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="h-full w-full rounded-2xl border-2 border-white/50 dark:border-white/30" />
                        </motion.div>
                    )}
                </motion.div>

                {/* Instructions */}
                <motion.div
                    className="text-center text-[#2C2A26]/60 text-xs font-bold uppercase tracking-widest mt-8"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1 }}
                >
                    <p>Click to flip • 3D effect</p>
                </motion.div>
            </div>
        </div>
    )
}

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GameState {
    status: 'idle' | 'playing' | 'gameover';
    score: number;
    lives: number;
    highScore: number;
    speed: number;
    distance: number;

    // Player State
    playerLane: number; // -1, 0, 1
    setPlayerLane: (lane: number) => void;
    isJumping: boolean;
    setIsJumping: (jumping: boolean) => void;

    // Actions
    startGame: () => void;
    endGame: () => void;
    resetGame: () => void;
    addScore: (amount: number) => void;
    loseLife: () => void;
    gainLife: () => void;
    incrementDistance: (amount: number) => void;
    increaseSpeed: (amount: number) => void;
}

export const useRunnerStore = create<GameState>()(
    persist(
        (set, get) => ({
            status: 'idle',
            score: 0,
            lives: 3,
            highScore: 0,
            speed: 10, // Base speed
            distance: 0,
            playerLane: 0,
            isJumping: false,

            startGame: () => set({ status: 'playing', score: 0, lives: 3, distance: 0, speed: 10, playerLane: 0, isJumping: false }),

            setPlayerLane: (lane) => set({ playerLane: lane }),
            setIsJumping: (jumping) => set({ isJumping: jumping }),

            endGame: () => {
                const { score, highScore } = get();
                set({
                    status: 'gameover',
                    highScore: Math.max(score, highScore)
                });
            },

            resetGame: () => set({ status: 'idle', score: 0, lives: 3, distance: 0, speed: 10 }),

            addScore: (amount) => set((state) => {
                const newScore = state.score + amount;
                // Difficulty Scaling: Speed increases by 1 for every 100 points
                // Base speed is 10.
                const newSpeed = 10 + (newScore * 0.01);
                return {
                    score: newScore,
                    speed: newSpeed
                };
            }),

            loseLife: () => {
                const { lives } = get();
                if (lives > 1) {
                    set((state) => ({ lives: state.lives - 1 }));
                } else {
                    get().endGame();
                }
            },

            gainLife: () => set((state) => ({ lives: state.lives + 1 })),

            incrementDistance: (amount) => set((state) => ({ distance: state.distance + amount })),

            increaseSpeed: (amount) => set((state) => ({ speed: state.speed + amount })),
        }),
        {
            name: 'runner-storage',
            partialize: (state) => ({ highScore: state.highScore }), // Only persist high score
        }
    )
);

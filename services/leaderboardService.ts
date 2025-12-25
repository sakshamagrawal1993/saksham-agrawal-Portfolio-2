import { supabase as supabaseGame } from '../lib/supabaseClient';

export interface LeaderboardEntry {
    id: string;
    player_name: string;
    score: number;
    created_at: string;
}

export const LeaderboardService = {
    /**
     * Fetch top 10 scores
     */
    getTopScores: async (): Promise<LeaderboardEntry[]> => {
        const { data, error } = await supabaseGame
            .from('game_leaderboard')
            .select('*')
            .order('score', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error fetching leaderboard:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Fetch absolute best score
     */
    getGlobalBest: async (): Promise<number | null> => {
        const { data, error } = await supabaseGame
            .from('game_leaderboard')
            .select('score')
            .order('score', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code !== 'PGRST116') { // No rows found
                console.error('Error fetching global best:', error);
            }
            return null;
        }
        return data?.score || null;
    },

    /**
     * Check if a score qualifies for top 10
     */
    isTopScore: async (score: number): Promise<boolean> => {
        const topScores = await LeaderboardService.getTopScores();
        if (topScores.length < 10) return true;

        // If we have 10 scores, check if new score is higher than the lowest one (10th place)
        const lowestTopScore = topScores[topScores.length - 1].score;
        return score > lowestTopScore;
    },

    /**
     * Submit a new score
     */
    submitScore: async (name: string, score: number) => {
        const { error } = await supabaseGame
            .from('game_leaderboard')
            .insert([{ player_name: name, score }]);

        if (error) {
            console.error('Error submitting score:', error);
            throw error;
        }
    }
};

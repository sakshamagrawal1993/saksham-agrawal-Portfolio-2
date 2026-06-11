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
     * Begin a server-tracked game round. Returns a round_id that must be passed
     * back to submitScore. The server uses the round's start time to validate
     * that the submitted score is plausible for the elapsed play time, which
     * blocks forged scores inserted directly via the API.
     */
    startRound: async (): Promise<string | null> => {
        const { data, error } = await supabaseGame.functions.invoke('submit-score', {
            body: { action: 'start' },
        });
        if (error) {
            console.error('Error starting round:', error);
            return null;
        }
        return (data as { round_id?: string })?.round_id ?? null;
    },

    /**
     * Submit a new score through the validated Edge Function. Direct inserts
     * into game_leaderboard are no longer permitted for anonymous clients.
     */
    submitScore: async (name: string, score: number, roundId: string | null) => {
        if (!roundId) {
            throw new Error('No active game round. Please play a full game before submitting.');
        }
        const { data, error } = await supabaseGame.functions.invoke('submit-score', {
            body: { action: 'submit', round_id: roundId, player_name: name, score },
        });
        if (error) {
            // supabase-js wraps non-2xx responses; surface the server message if present.
            const serverMsg = (error as { context?: { body?: string } })?.context?.body;
            console.error('Error submitting score:', error, serverMsg);
            throw new Error(serverMsg || error.message || 'Failed to submit score');
        }
        if (data && (data as { ok?: boolean }).ok === false) {
            throw new Error((data as { error?: string }).error || 'Failed to submit score');
        }
    }
};

import { supabase } from '../supabaseClient';
import { useHealthTwinStore } from '../../store/healthTwin';

export type TwinLoadResult = 'ok' | 'unauthenticated' | 'not_found';

async function triggerWellnessGeneration(twinId: string, cancelledRef: { cancelled: boolean }) {
    const store = useHealthTwinStore.getState();
    store.setIsLoadingWellness(true);
    store.setWellnessError(null);
    try {
        const { data, error } = await supabase.functions.invoke('generate-wellness', {
            body: { twin_id: twinId },
        });
        if (cancelledRef.cancelled) return;
        if (error) throw error;
        store.setWellnessPrograms(data?.programs || []);
    } catch (genErr) {
        console.error('Failed to auto-generate wellness programs:', genErr);
        if (!cancelledRef.cancelled) {
            store.setWellnessError('Could not generate wellness programs. Please try again.');
        }
    } finally {
        if (!cancelledRef.cancelled) store.setIsLoadingWellness(false);
    }
}

/**
 * Loads the active twin and its full 8-table dataset directly into the
 * Health Twin store. Shared by the dashboard (route load) and the
 * playground (direct/reload entry) so both can initialize from real data
 * without redirecting through each other.
 */
export async function loadHealthTwinData(
    twinId: string,
    cancelledRef: { cancelled: boolean } = { cancelled: false }
): Promise<TwinLoadResult> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'unauthenticated';

    const { data: twin, error: twinError } = await supabase
        .from('health_twins')
        .select('*')
        .eq('id', twinId)
        .single();

    if (twinError || !twin) {
        console.error('Failed to load twin profile:', twinError);
        return 'not_found';
    }

    if (cancelledRef.cancelled) return 'ok';

    const store = useHealthTwinStore.getState();

    const { data: ownedTwins } = await supabase
        .from('health_twins')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
    store.setTwins(ownedTwins?.length ? ownedTwins : [twin]);
    store.setActiveTwin(twin.id);

    try {
        const [
            personalData,
            summaryData,
            labData,
            wearableData,
            scoresData,
            recData,
            sourcesData,
            definitionsData,
            rangesData,
            aggregatesData,
            wellnessData,
        ] = await Promise.all([
            supabase.from('health_personal_details').select('*').eq('twin_id', twin.id).maybeSingle(),
            supabase.from('health_summary').select('*').eq('twin_id', twin.id).maybeSingle(),
            supabase.from('health_lab_parameters').select('*').eq('twin_id', twin.id).order('recorded_at', { ascending: false }),
            supabase.from('health_wearable_parameters').select('*').eq('twin_id', twin.id).order('recorded_at', { ascending: false }),
            supabase.from('health_scores').select('*').eq('twin_id', twin.id),
            supabase.from('health_recommendations').select('*').eq('twin_id', twin.id).order('created_at', { ascending: false }),
            supabase.from('health_sources').select('*').eq('twin_id', twin.id).order('created_at', { ascending: false }),
            supabase.from('health_parameter_definitions').select('*'),
            supabase.from('health_parameter_ranges').select('*'),
            supabase.from('health_daily_aggregates').select('*').eq('twin_id', twin.id).order('date', { ascending: false }),
            supabase.from('health_wellness_programs').select('*').eq('twin_id', twin.id)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false }),
        ]);

        if (cancelledRef.cancelled) return 'ok';

        store.setPersonalDetails(personalData.data || null);
        store.setSummary(summaryData.data || null);
        store.setLabParameters(labData.data || []);
        store.setWearableParameters(wearableData.data || []);
        store.setScores(scoresData.data || []);
        store.setRecommendations(recData.data || []);
        store.setSources(sourcesData.data || []);
        store.setDailyAggregates(aggregatesData.data || []);
        store.setParameterDefinitions(definitionsData.data || []);
        store.setParameterRanges(rangesData.data || []);

        if (wellnessData.error) {
            console.error('Wellness cache query error:', wellnessData.error.message);
        }

        if (wellnessData.data && wellnessData.data.length > 0) {
            store.setWellnessPrograms(wellnessData.data);
        } else if (!wellnessData.error) {
            store.setWellnessPrograms([]);
            void triggerWellnessGeneration(twin.id, cancelledRef);
        }

        store.calculateLiveScores();
    } catch (err) {
        console.error('Error loading twin sub-data:', err);
    }

    return 'ok';
}

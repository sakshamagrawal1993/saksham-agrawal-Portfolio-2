import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useMindCoachStore, TabId } from '../../store/mindCoachStore';
import { BottomNav } from './BottomNav';
import { PhoneFrame } from './shared/PhoneFrame';
import { HomeScreen } from './Screens/HomeScreen';
import { SessionsScreen } from './Screens/SessionsScreen';
import { JourneyScreen } from './Screens/JourneyScreen';
import { ToolkitScreen } from './Screens/ToolkitScreen';
import { ProfileScreen } from './Screens/ProfileScreen';

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'home':
      return <HomeScreen />;
    case 'sessions':
      return <SessionsScreen />;
    case 'journey':
      return <JourneyScreen />;
    case 'toolkit':
      return <ToolkitScreen />;
    case 'profile':
      return <ProfileScreen />;
    default:
      return null;
  }
}

const MindCoachApp: React.FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const activeTab = useMindCoachStore((s) => s.activeTab);
  const setProfile = useMindCoachStore((s) => s.setProfile);
  const setJourney = useMindCoachStore((s) => s.setJourney);
  const setSessions = useMindCoachStore((s) => s.setSessions);
  const setMemories = useMindCoachStore((s) => s.setMemories);
  const setMoodEntries = useMindCoachStore((s) => s.setMoodEntries);
  const setExercises = useMindCoachStore((s) => s.setExercises);
  const reset = useMindCoachStore((s) => s.reset);

  useEffect(() => {
    if (!profileId) return;

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [profileRes, journeyRes, sessionsRes, memoriesRes, moodRes, exercisesRes] =
          await Promise.all([
            supabase
              .from('mind_coach_profiles')
              .select('*')
              .eq('id', profileId)
              .single(),
            supabase
              .from('mind_coach_journeys')
              .select('*')
              .eq('profile_id', profileId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('mind_coach_sessions')
              .select('*')
              .eq('profile_id', profileId)
              .order('started_at', { ascending: false }),
            supabase
              .from('mind_coach_memories')
              .select('*')
              .eq('profile_id', profileId)
              .order('created_at', { ascending: false }),
            supabase
              .from('mind_coach_mood_entries')
              .select('*')
              .eq('profile_id', profileId)
              .order('created_at', { ascending: false }),
            supabase
              .from('mind_coach_exercises')
              .select('*')
              .order('title'),
          ]);

        if (cancelled) return;

        if (profileRes.error) throw profileRes.error;
        if (!profileRes.data) throw new Error('Profile not found');

        setProfile(profileRes.data);
        setJourney(journeyRes.data ?? null);
        setSessions(sessionsRes.data ?? []);
        setMemories(memoriesRes.data ?? []);
        setMoodEntries(moodRes.data ?? []);
        setExercises(exercisesRes.data ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
      reset();
    };
  }, [profileId, setProfile, setJourney, setSessions, setMemories, setMoodEntries, setExercises, reset]);

  if (!user) {
    return <Navigate to="/mind-coach/login" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#E8E0D8] via-[#D6CFC6] to-[#C9C0B6] flex items-center justify-center p-4">
        <PhoneFrame>
          <div className="flex items-center justify-center h-full bg-[#FAFAF7]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#6B8F71] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[#2C2A26]/50 font-medium">Loading your space…</p>
            </div>
          </div>
        </PhoneFrame>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#E8E0D8] via-[#D6CFC6] to-[#C9C0B6] flex items-center justify-center p-4">
        <PhoneFrame>
          <div className="flex items-center justify-center h-full bg-[#FAFAF7] px-6">
            <div className="text-center space-y-3">
              <p className="text-[#2C2A26] font-medium">Something went wrong</p>
              <p className="text-sm text-[#2C2A26]/50">{error}</p>
            </div>
          </div>
        </PhoneFrame>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E8E0D8] via-[#D6CFC6] to-[#C9C0B6] flex items-center justify-center p-4">
      <PhoneFrame>
        <div className="flex flex-col h-full bg-[#FAFAF7]">
          <div className="flex-1 overflow-y-auto">
            <TabContent tab={activeTab} />
          </div>
          <BottomNav />
        </div>
      </PhoneFrame>
    </div>
  );
};

export default MindCoachApp;

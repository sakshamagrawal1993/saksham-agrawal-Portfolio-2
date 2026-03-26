import React, { useEffect, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useMindCoachStore, TabId } from '../../store/mindCoachStore';
import { BottomNav } from './BottomNav';
import { PhoneFrame } from './shared/PhoneFrame';
import { HomeScreen } from './Screens/HomeScreen';
import { SessionsScreen } from './Screens/SessionsScreen';
import { AssessmentsScreen } from './Screens/AssessmentsScreen';
import { JournalScreen } from './Screens/JournalScreen';
import { DiaryScreen } from './Screens/DiaryScreen';
import { OnboardingFlow } from './Onboarding/OnboardingFlow';

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'home':
      return <HomeScreen />;
    case 'sessions':
      return <SessionsScreen />;
    case 'assessments':
      return <AssessmentsScreen />;
    case 'journal':
      return <JournalScreen />;
    case 'diary':
      return <DiaryScreen />;
    default:
      return null;
  }
}

const MindCoachApp: React.FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const { user } = useAuth();

  const activeTab = useMindCoachStore((s) => s.activeTab);
  const setProfile = useMindCoachStore((s) => s.setProfile);
  const setJourney = useMindCoachStore((s) => s.setJourney);
  const setSessions = useMindCoachStore((s) => s.setSessions);
  const setMemories = useMindCoachStore((s) => s.setMemories);
  const setMoodEntries = useMindCoachStore((s) => s.setMoodEntries);
  const setJournalEntries = useMindCoachStore((s) => s.setJournalEntries);
  const setExercises = useMindCoachStore((s) => s.setExercises);
  const setActiveTasks = useMindCoachStore((s) => s.setActiveTasks);
  const reset = useMindCoachStore((s) => s.reset);

  useEffect(() => {
    if (!profileId) return;

    // Check if this is the special 'new' route for onboarding
    if (profileId === 'new') {
      setNeedsOnboarding(true);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [profileRes, journeyRes, sessionsRes, memoriesRes, moodRes, journalRes, exercisesRes, tasksRes] =
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
              .from('mind_coach_journal_entries')
              .select('*')
              .eq('profile_id', profileId)
              .order('created_at', { ascending: false }),
            supabase
              .from('mind_coach_exercises')
              .select('*')
              .order('title'),
            supabase
              .from('mind_coach_user_tasks')
              .select('*')
              .eq('profile_id', profileId)
              .eq('status', 'active')
              .order('created_at', { ascending: false }),
          ]);

        if (cancelled) return;

        if (profileRes.error) throw profileRes.error;
        if (!profileRes.data) throw new Error('Profile not found');

        setProfile(profileRes.data);
        setJourney(journeyRes.data ?? null);
        setSessions(sessionsRes.data ?? []);
        setMemories(memoriesRes.data ?? []);
        setMoodEntries(moodRes.data ?? []);
        setJournalEntries((journalRes.data ?? []).map((d: any) => ({
          id: d.id,
          profile_id: d.profile_id,
          title: d.title,
          content: d.content,
          mood: d.mood_tag,
          prompt: null,
          created_at: d.created_at,
        })));
        setExercises(exercisesRes.data ?? []);
        setActiveTasks(tasksRes.data ?? []);
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
  }, [profileId, setProfile, setJourney, setSessions, setMemories, setMoodEntries, setExercises, setActiveTasks, reset]);

  if (!user) {
    return <Navigate to="/mind-coach/login" replace />;
  }

  // Onboarding flow
  if (needsOnboarding) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#E8E0D8] via-[#D6CFC6] to-[#C9C0B6] flex items-center justify-center p-4">
        <PhoneFrame>
          <OnboardingFlow
            onComplete={(newProfileId) => {
              navigate(`/mind-coach/${newProfileId}`, { replace: true });
            }}
          />
        </PhoneFrame>
      </div>
    );
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
          {/* Hide BottomNav when in an active chat session */}
          {activeTab !== 'sessions' && <BottomNav />}
          {activeTab === 'sessions' && <BottomNav />}
        </div>
      </PhoneFrame>
    </div>
  );
};

export default MindCoachApp;

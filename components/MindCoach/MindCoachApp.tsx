import React, { useEffect, useRef, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useMindCoachStore, TabId } from '../../store/mindCoachStore';
import { BottomNav } from './BottomNav';
import { PhoneFrame } from './shared/PhoneFrame';
import { HomeScreen } from './Screens/HomeScreen';
import { SessionsScreen } from './Screens/SessionsScreen';
import { JourneyScreen } from './Screens/JourneyScreen';
import { AssessmentsScreen } from './Screens/AssessmentsScreen';
import { JournalScreen } from './Screens/JournalScreen';
import { DiaryScreen } from './Screens/DiaryScreen';
import { ExercisesScreen } from './Screens/ExercisesScreen';
import { ToolkitScreen } from './Screens/ToolkitScreen';
import { OnboardingFlow } from './Onboarding/OnboardingFlow';

function TabContent({ tab }: { tab: TabId }) {
  const setActiveTab = useMindCoachStore((s) => s.setActiveTab);

  switch (tab) {
    case 'home':
      return <HomeScreen />;
    case 'sessions':
      return <SessionsScreen />;
    case 'journey':
      return <JourneyScreen />;
    case 'assessments':
      return <AssessmentsScreen />;
    case 'journal':
      return <JournalScreen />;
    case 'diary':
      return <DiaryScreen />;
    case 'exercises':
      return <ExercisesScreen />;
    case 'toolkit':
      return (
        <div className="flex flex-col h-full min-h-0">
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[#E8E4DE] bg-white/80">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="text-xs text-[#6B8F71] font-medium hover:text-[#5a7a5f]"
            >
              ← Home
            </button>
            <span className="text-xs font-semibold text-[#2C2A26]/50 uppercase tracking-wide">Toolkit</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ToolkitScreen />
          </div>
        </div>
      );
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
  const prevProfileIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!profileId) return;

    // Check if this is the special 'new' route for onboarding
    if (profileId === 'new') {
      // Check if user already has a profile before showing onboarding
      supabase
        .from('mind_coach_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setNeedsOnboarding(false);
            navigate(`/mind-coach/${data.id}`, { replace: true });
          } else {
            setNeedsOnboarding(true);
            setLoading(false);
          }
        });
      return;
    }

    // Check if it's an invalid UUID (likely a manual tab navigation like /mind-coach/journey)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId)) {
      supabase
        .from('mind_coach_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const validTabs = ['home', 'sessions', 'journey', 'assessments', 'journal', 'diary', 'exercises', 'toolkit'];
            if (validTabs.includes(profileId)) {
              useMindCoachStore.getState().setActiveTab(profileId as TabId);
            }
            navigate(`/mind-coach/${data.id}`, { replace: true });
          } else {
            navigate('/mind-coach', { replace: true });
          }
        });
      return;
    }

    const switchingProfile =
      prevProfileIdRef.current !== undefined && prevProfileIdRef.current !== profileId;
    prevProfileIdRef.current = profileId;
    if (switchingProfile) reset();

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [profileRes, journeyRes, sessionsRes, memoriesRes, moodRes, journalRes, exercisesRes, tasksRes, pathwayProposalRes] =
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
            supabase
              .from('mind_coach_pathway_proposals')
              .select('proposed_pathway,confidence,created_at')
              .eq('profile_id', profileId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

        if (cancelled) return;

        if (profileRes.error) throw profileRes.error;
        if (!profileRes.data) throw new Error('Profile not found');

        setProfile(profileRes.data);
        const latestProposal =
          pathwayProposalRes.data && typeof pathwayProposalRes.data === 'object'
            ? pathwayProposalRes.data
            : null;
        const shouldAttachLatestProposal =
          !!journeyRes.data &&
          (journeyRes.data.pathway === 'engagement_rapport_and_assessment' || !journeyRes.data.pathway) &&
          !!latestProposal?.proposed_pathway &&
          latestProposal.proposed_pathway !== 'engagement_rapport_and_assessment';
        const journeyWithProposal =
          shouldAttachLatestProposal
            ? {
                ...journeyRes.data,
                discovery_state: {
                  suggested_pathway: latestProposal.proposed_pathway,
                  confidence:
                    typeof latestProposal.confidence === 'number'
                      ? latestProposal.confidence
                      : journeyRes.data?.discovery_state?.confidence ?? 0,
                },
              }
            : journeyRes.data;

        setJourney(journeyWithProposal ?? null);
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
    };
  }, [profileId, setProfile, setJourney, setSessions, setMemories, setMoodEntries, setExercises, setActiveTasks, reset]);

  if (!user) {
    return <Navigate to="/mind-coach/login" replace />;
  }

  // Onboarding flow
  if (needsOnboarding) {
    return (
      <div className="h-[100dvh] min-h-[100dvh] bg-[#FAFAF7]">
        <PhoneFrame>
          <OnboardingFlow
            onComplete={(newProfileId) => {
              setNeedsOnboarding(false);
              useMindCoachStore.getState().setActiveTab('sessions');
              navigate(`/mind-coach/${newProfileId}`, { replace: true });
            }}
          />
        </PhoneFrame>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-[100dvh] min-h-[100dvh] bg-[#FAFAF7]">
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
      <div className="h-[100dvh] min-h-[100dvh] bg-[#FAFAF7]">
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
    <div className="h-[100dvh] min-h-[100dvh] bg-[#FAFAF7]">
      <PhoneFrame>
        <div className="flex flex-col h-full min-h-0 bg-[#FAFAF7]">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TabContent tab={activeTab} />
          </div>
          <BottomNav />
        </div>
      </PhoneFrame>
    </div>
  );
};

export default MindCoachApp;

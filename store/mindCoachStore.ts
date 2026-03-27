import { create } from 'zustand';

// ── Types ──────────────────────────────────────────────────────────────────

export type TherapistPersona = 'maya' | 'alex' | 'sage';

export type Pathway =
  | 'crisis_intervention_and_suicide_prevention'
  | 'grief_and_loss_processing'
  | 'depression_and_behavioral_activation'
  | 'anxiety_and_stress_management'
  | 'emotion_regulation_and_distress_tolerance'
  | 'trauma_processing_and_ptsd'
  | 'relationship_conflict_and_interpersonal'
  | 'self_worth_and_self_esteem'
  | 'boundary_setting_and_assertiveness'
  | 'overthinking_rumination_and_cognitive_restructuring'
  | 'sleep_and_insomnia'
  | 'panic_and_physical_anxiety_symptoms'
  | 'family_conflict_and_dynamics'
  | 'abuse_and_safety'
  | 'life_transition_and_adjustment'
  | 'identity_and_self_concept'
  | 'social_anxiety_and_isolation'
  | 'anger_management'
  | 'health_anxiety_and_somatic_symptoms'
  | 'engagement_rapport_and_assessment';

export type SessionState = 'intake' | 'active' | 'wrapping_up' | 'completed';

export type MemoryType =
  | 'trigger'
  | 'pattern'
  | 'breakthrough'
  | 'coping_strategy'
  | 'life_context'
  | 'preference';

export type TaskType =
  | 'journaling'
  | 'grounding'
  | 'behavioral_activation'
  | 'cognitive_restructuring'
  | 'sleep_hygiene'
  | 'mindfulness'
  | 'communication'
  | 'boundary_setting'
  | 'exposure'
  | 'self_compassion'
  | 'general';

export type TabId = 'home' | 'sessions' | 'assessments' | 'journal' | 'diary' | 'exercises';

import { DynamicContentType } from '../lib/dynamicContentLibrary';

export interface MindCoachProfile {
  id: string;
  user_id: string;
  name: string;
  age: number | null;
  gender: string | null;
  concerns: string[];
  therapist_persona: TherapistPersona;
  created_at: string;
}

export interface JourneyPhase {
  phase_number: number;
  title: string;
  goal: string;
  sessions: JourneySessionTopic[];
}

export interface JourneySessionTopic {
  session_number: number;
  topic: string;
  description: string;
}

export interface MindCoachJourney {
  id: string;
  profile_id: string;
  title: string;
  description: string | null;
  concerns_snapshot: string[];
  phases: JourneyPhase[];
  current_phase: number;
  current_phase_index: number;
  sessions_completed: number;
  active: boolean;
  /** Clinical pathway for this journey (DB column `pathway` on `mind_coach_journeys`). */
  pathway?: Pathway | null;
  discovery_state?: { suggested_pathway: Pathway; confidence: number; };
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CaseNotes {
  dynamic_theme: string;
  pathway_used: Pathway;
  emotional_state: string;
  key_insight: string;
  action_item: string;
  techniques_practiced: string[];
  parked_items: string[];
  drift_events: string[];
}

export interface MindCoachSession {
  id: string;
  profile_id: string;
  journey_id: string | null;
  phase_number: number;
  session_number: number;
  dynamic_theme: string | null;
  pathway: Pathway | null;
  pathway_confidence?: number;
  session_state: SessionState;
  message_count: number;
  summary: string | null;
  summary_data: Record<string, unknown> | null;
  case_notes: CaseNotes | null;
  started_at: string;
  ended_at: string | null;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  guardrail_status: 'passed' | 'corrected' | 'blocked' | null;
  created_at: string;
  dynamic_content?: {
    type: DynamicContentType;
    payload: any;
  };
}

export interface MindCoachMemory {
  id: string;
  profile_id: string;
  memory_text: string;
  memory_type: MemoryType;
  source_session_id: string | null;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  profile_id: string;
  title: string | null;
  content: string;
  mood: string | null;
  prompt: string | null;
  created_at: string;
}

export interface MoodEntry {
  id: string;
  profile_id: string;
  score: number;
  notes: string | null;
  created_at: string;
}

export interface Exercise {
  id: string;
  title: string;
  type: 'breathing' | 'grounding' | 'meditation';
  category: string;
  duration_seconds: number;
  description: string | null;
  steps: { instruction: string; duration: number }[];
  created_at: string;
}

export interface UserTask {
  id: string;
  profile_id: string;
  session_id: string;
  task_type: TaskType;
  dynamic_title: string;
  dynamic_description: string;
  task_name: string;
  task_description: string;
  task_frequency: 'daily' | 'weekly' | 'once';
  task_start_date: string;
  task_end_date: string;
  status: 'active' | 'completed' | 'skipped';
  created_at: string;
}

// Feature unlock gates per phase
export const UNLOCK_MAP: Record<number, string[]> = {
  1: ['chat'],
  2: ['chat', 'journal', 'assessments'],
  3: ['chat', 'journal', 'assessments', 'exercises'],
  4: ['chat', 'journal', 'assessments', 'exercises', 'meditation'],
};

/** Smallest journey phase number (1–4) where a feature key appears in `UNLOCK_MAP`. */
export function firstPhaseWhereFeatureUnlocks(feature: string): number {
  for (let p = 1; p <= 4; p++) {
    if ((UNLOCK_MAP[p] ?? []).includes(feature)) return p;
  }
  return 4;
}

// ── State ──────────────────────────────────────────────────────────────────

interface MindCoachState {
  // Profile
  profile: MindCoachProfile | null;
  setProfile: (p: MindCoachProfile | null) => void;

  // Journey
  journey: MindCoachJourney | null;
  setJourney: (j: MindCoachJourney | null) => void;

  // Sessions
  sessions: MindCoachSession[];
  activeSession: MindCoachSession | null;
  setSessions: (s: MindCoachSession[]) => void;
  setActiveSession: (s: MindCoachSession | null) => void;
  updateActiveSession: (partial: Partial<MindCoachSession>) => void;

  // Chat messages (current session only)
  messages: ChatMessage[];
  setMessages: (m: ChatMessage[]) => void;
  addMessage: (m: ChatMessage) => void;
  removeMessageById: (id: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isCrisisDetected: boolean;
  setCrisisDetected: (detected: boolean) => void;

  // Memory
  memories: MindCoachMemory[];
  recentCaseNotes: CaseNotes[];
  setMemories: (m: MindCoachMemory[]) => void;
  setRecentCaseNotes: (cn: CaseNotes[]) => void;

  // Journal
  journalEntries: JournalEntry[];
  setJournalEntries: (e: JournalEntry[]) => void;

  // Mood
  moodEntries: MoodEntry[];
  setMoodEntries: (e: MoodEntry[]) => void;

  // Exercises
  exercises: Exercise[];
  setExercises: (e: Exercise[]) => void;

  // Tasks
  activeTasks: UserTask[];
  setActiveTasks: (t: UserTask[]) => void;

  // Session close
  isSessionClose: boolean;
  setIsSessionClose: (close: boolean) => void;

  // UI
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Active Exercise Overlay
  activeExercise: Exercise | null;
  setActiveExercise: (e: Exercise | null) => void;
  activeExerciseMessageId: string | null;
  setActiveExerciseMessageId: (id: string | null) => void;

  // Computed
  completedSessionCount: () => number;
  currentPhaseSessionCount: () => number;
  unlockedFeatures: () => string[];

  // Reset
  reset: () => void;
}

const initialState = {
  profile: null,
  journey: null,
  sessions: [],
  activeSession: null,
  messages: [],
  isLoading: false,
  isCrisisDetected: false,
  isSessionClose: false,
  memories: [],
  recentCaseNotes: [],
  journalEntries: [],
  moodEntries: [],
  exercises: [],
  activeTasks: [],
  activeTab: 'home' as TabId,
  activeExercise: null,
  activeExerciseMessageId: null,
};

export const useMindCoachStore = create<MindCoachState>((set, get) => ({
  ...initialState,

  setProfile: (profile) => set({ profile }),
  setJourney: (journey) => set({ journey }),

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (activeSession) => set({ activeSession }),
  updateActiveSession: (partial) =>
    set((state) => ({
      activeSession: state.activeSession
        ? { ...state.activeSession, ...partial }
        : null,
    })),

  setMessages: (messages) => set({ messages }),
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  removeMessageById: (id) =>
    set((state) => ({ messages: state.messages.filter((m) => m.id !== id) })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setCrisisDetected: (isCrisisDetected) => set({ isCrisisDetected }),

  setMemories: (memories) => set({ memories }),
  setRecentCaseNotes: (recentCaseNotes) => set({ recentCaseNotes }),

  setJournalEntries: (journalEntries) => set({ journalEntries }),
  setMoodEntries: (moodEntries) => set({ moodEntries }),
  setExercises: (exercises) => set({ exercises }),
  setActiveTasks: (activeTasks) => set({ activeTasks }),
  setIsSessionClose: (isSessionClose) => set({ isSessionClose }),

  setActiveTab: (activeTab) => set({ activeTab }),

  setActiveExercise: (activeExercise) => set({ activeExercise }),
  setActiveExerciseMessageId: (activeExerciseMessageId) => set({ activeExerciseMessageId }),

  completedSessionCount: () =>
    get().sessions.filter((s) => s.session_state === 'completed').length,

  currentPhaseSessionCount: () => {
    const { sessions, journey } = get();
    if (!journey) return 0;
    return sessions.filter(
      (s) =>
        s.session_state === 'completed' &&
        s.phase_number === journey.current_phase
    ).length;
  },

  unlockedFeatures: () => {
    const { journey } = get();
    const phase = journey?.current_phase ?? 1;
    const completedPhase = Math.max(1, phase);
    return UNLOCK_MAP[Math.min(completedPhase, 4)] ?? UNLOCK_MAP[1];
  },

  reset: () => set(initialState),
}));

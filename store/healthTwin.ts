import { create } from 'zustand';

// 1. Health Twins
export interface HealthTwin {
  id: string; // The twin_id
  user_id: string;
  name: string;
  description?: string;
  featured?: boolean;
}

// 2. Health Scores
export interface HealthScore {
  category: string;
  score: number;
}

// 3. Health Summary
export interface HealthSummary {
  summary_text: string;
  updated_at: string;
}

// 4. Health Sources
export interface HealthSource {
  id: string;
  source_type: string;
  source_name: string;
  file_url: string;
  status: string;
  created_at: string;
}

// 5. Health Recommendations
export interface HealthRecommendation {
  id: string;
  activity_name: string;
  description: string;
  category: string;
  status: string;
}

// 6.1 Health Personal Details
export interface HealthPersonalDetails {
  id: string;
  name: string;
  age: number;
  gender: string;
  blood_type: string;
  height_cm: number;
  weight_kg: number;
  co_morbidities: string[];
  location: string;
}

// 6.2 & 6.3 Health Parameters
export interface HealthParameter {
  id: string;
  parameter_name: string;
  parameter_value: number;
  unit: string;
  recorded_at: string;
  ended_at?: string; // For range-based measurements (steps, sleep, etc.)
}

// Chat interface
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface HealthTwinState {
  // Profiles
  twins: HealthTwin[];
  activeTwinId: string | null;
  setTwins: (twins: HealthTwin[]) => void;
  setActiveTwin: (id: string) => void;

  // 8-Table Active Data
  personalDetails: HealthPersonalDetails | null;
  summary: HealthSummary | null;
  scores: HealthScore[];
  recommendations: HealthRecommendation[];
  sources: HealthSource[];
  labParameters: HealthParameter[];
  wearableParameters: HealthParameter[];
  
  setPersonalDetails: (data: HealthPersonalDetails | null) => void;
  setSummary: (data: HealthSummary | null) => void;
  setScores: (data: HealthScore[]) => void;
  setRecommendations: (data: HealthRecommendation[]) => void;
  setSources: (data: HealthSource[]) => void;
  setLabParameters: (data: HealthParameter[]) => void;
  setWearableParameters: (data: HealthParameter[]) => void;

  // UI State
  activeTab: 'chat' | 'graphs';
  setActiveTab: (tab: 'chat' | 'graphs') => void;

  // Chat
  chatHistory: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;
}

export const useHealthTwinStore = create<HealthTwinState>((set) => ({
  twins: [],
  activeTwinId: null,
  setTwins: (twins) => set({ twins }),
  setActiveTwin: (activeTwinId) => set({ activeTwinId }),

  personalDetails: null,
  summary: null,
  scores: [],
  recommendations: [],
  sources: [],
  labParameters: [],
  wearableParameters: [],

  setPersonalDetails: (personalDetails) => set({ personalDetails }),
  setSummary: (summary) => set({ summary }),
  setScores: (scores) => set({ scores }),
  setRecommendations: (recommendations) => set({ recommendations }),
  setSources: (sources) => set({ sources }),
  setLabParameters: (labParameters) => set({ labParameters }),
  setWearableParameters: (wearableParameters) => set({ wearableParameters }),

  activeTab: 'graphs',
  setActiveTab: (activeTab) => set({ activeTab }),

  chatHistory: [],
  addChatMessage: (msg) => set((state) => ({ chatHistory: [...state.chatHistory, msg] })),
  clearChat: () => set({ chatHistory: [] }),
}));

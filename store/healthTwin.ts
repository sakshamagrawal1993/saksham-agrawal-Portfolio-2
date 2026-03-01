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

// 5b. Wellness Programs
export interface DataConnection {
  metric: string;
  value: string;
  insight: string;
}

export interface WeeklyPlanItem {
  day: string;
  activity: string;
  target_hr?: string;
  goal?: string;
}

export interface WellnessProgram {
  id: string;
  title: string;
  icon: string;
  priority: 'high' | 'medium' | 'low';
  duration: string;
  reason: string;
  data_connections: DataConnection[];
  weekly_plan: WeeklyPlanItem[];
  expected_outcomes: string[];
  generated_at: string;
  expires_at: string;
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
  parameter_text?: string; // For non-numeric values (e.g. Exercise Type = "Running")
  unit: string;
  recorded_at: string;
  ended_at?: string; // For range-based measurements (steps, sleep, etc.)
  group_id?: string; // Links related parameters (e.g. BP systolic + diastolic)
  category?: string; // UI grouping: activity, vitals, exercise, sleep, nutrition, recovery, reproductive, symptoms
}

// 7. Parameter Definitions & Ranges
export interface HealthParameterDefinition {
  id: string;
  name: string;
  category: string;
  unit: string;
  axis_impact_weights: Record<string, number>;
}

export interface HealthParameterRange {
  id: string;
  parameter_id: string;
  gender: string;
  min_age: number;
  max_age: number;
  critical_min: number | null;
  normal_min: number | null;
  optimal_min: number | null;
  optimal_max: number | null;
  normal_max: number | null;
  critical_max: number | null;
}

// 8. Daily Aggregates
export interface HealthDailyAggregate {
  id: string;
  twin_id: string;
  date: string;
  parameter_name: string;
  aggregate_value: number;
  unit: string;
}

// 9. Intelligent Chat & Memory
export type WidgetType = 'chart' | 'image' | 'triage_action';
export type ChartType = 'line' | 'multi_line' | 'bar' | 'stacked_bar' | 'area' | 'donut' | 'scatter' | 'radar' | 'gauge' | 'heatmap';

export interface ChatWidget {
  type: WidgetType;
  chart_type?: ChartType;
  title?: string;
  data?: Array<Record<string, any>>;
  x_axis_label?: string;
  y_axis_label?: string;
  // Image specific
  url?: string;
  alt_text?: string;
  // Triage action specific
  action_text?: string;
  button_label?: string;
  action_url?: string;
  // Gauge specific
  value?: number;
  min?: number;
  max?: number;
  target?: number;
  [key: string]: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  widgets?: ChatWidget[];
}

export interface HealthChatSession {
  id: string;
  twin_id: string;
  started_at: string;
  active: boolean;
}

export interface HealthTwinMemory {
  id: string;
  twin_id: string;
  memory_text: string;
  source_message_id?: string;
  created_at: string;
}

// 10. Store State Interface
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
  parameterDefinitions: HealthParameterDefinition[];
  parameterRanges: HealthParameterRange[];
  dailyAggregates: HealthDailyAggregate[];
  
  setPersonalDetails: (data: HealthPersonalDetails | null) => void;
  setSummary: (data: HealthSummary | null) => void;
  setScores: (data: HealthScore[]) => void;
  setRecommendations: (data: HealthRecommendation[]) => void;
  setSources: (data: HealthSource[]) => void;
  setLabParameters: (data: HealthParameter[]) => void;
  setWearableParameters: (data: HealthParameter[]) => void;
  setParameterDefinitions: (data: HealthParameterDefinition[]) => void;
  setParameterRanges: (data: HealthParameterRange[]) => void;
  setDailyAggregates: (data: HealthDailyAggregate[]) => void;

  // UI State
  activeTab: 'chat' | 'graphs';
  setActiveTab: (tab: 'chat' | 'graphs') => void;

  // Chat & Memory
  activeChatSessionId: string | null;
  chatHistory: ChatMessage[];
  twinMemories: HealthTwinMemory[];
  
  setActiveChatSessionId: (id: string | null) => void;
  setChatHistory: (messages: ChatMessage[]) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setTwinMemories: (memories: HealthTwinMemory[]) => void;
  clearChat: () => void;

  // Wellness Programs
  wellnessPrograms: WellnessProgram[];
  isLoadingWellness: boolean;
  setWellnessPrograms: (programs: WellnessProgram[]) => void;
  setIsLoadingWellness: (loading: boolean) => void;

  // Actions
  calculateLiveScores: () => void;
}

// 8. Daily Aggregates
export interface HealthDailyAggregate {
  id: string;
  twin_id: string;
  date: string;
  parameter_name: string;
  aggregate_value: number;
  unit: string;
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
  parameterDefinitions: HealthParameterDefinition[];
  parameterRanges: HealthParameterRange[];
  dailyAggregates: HealthDailyAggregate[];
  
  setPersonalDetails: (data: HealthPersonalDetails | null) => void;
  setSummary: (data: HealthSummary | null) => void;
  setScores: (data: HealthScore[]) => void;
  setRecommendations: (data: HealthRecommendation[]) => void;
  setSources: (data: HealthSource[]) => void;
  setLabParameters: (data: HealthParameter[]) => void;
  setWearableParameters: (data: HealthParameter[]) => void;
  setParameterDefinitions: (data: HealthParameterDefinition[]) => void;
  setParameterRanges: (data: HealthParameterRange[]) => void;
  setDailyAggregates: (data: HealthDailyAggregate[]) => void;

  // UI State
  activeTab: 'chat' | 'graphs';
  setActiveTab: (tab: 'chat' | 'graphs') => void;

  // Chat
  chatHistory: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;

  // Wellness Programs
  wellnessPrograms: WellnessProgram[];
  isLoadingWellness: boolean;
  setWellnessPrograms: (programs: WellnessProgram[]) => void;
  setIsLoadingWellness: (loading: boolean) => void;

  // Actions
  calculateLiveScores: () => void;
}

import { calculateAxesScores } from '../utils/scoreCalculator';

export const useHealthTwinStore = create<HealthTwinState>((set, get) => ({
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
  parameterDefinitions: [],
  parameterRanges: [],

  setPersonalDetails: (personalDetails) => set({ personalDetails }),
  setSummary: (summary) => set({ summary }),
  setScores: (scores) => set({ scores }),
  setRecommendations: (recommendations) => set({ recommendations }),
  setSources: (sources) => set({ sources }),
  setLabParameters: (labParameters) => set({ labParameters }),
  setWearableParameters: (wearableParameters) => set({ wearableParameters }),
  setParameterDefinitions: (parameterDefinitions) => set({ parameterDefinitions }),
  setParameterRanges: (parameterRanges) => set({ parameterRanges }),

  dailyAggregates: [],
  setDailyAggregates: (dailyAggregates) => set({ dailyAggregates }),

  activeTab: 'graphs',
  setActiveTab: (activeTab) => set({ activeTab }),

  activeChatSessionId: null,
  setActiveChatSessionId: (activeChatSessionId) => set({ activeChatSessionId }),

  chatHistory: [],
  setChatHistory: (chatHistory) => set({ chatHistory }),
  addChatMessage: (msg) => set((state) => ({ chatHistory: [...state.chatHistory, msg] })),
  clearChat: () => set({ chatHistory: [] }),

  twinMemories: [],
  setTwinMemories: (twinMemories) => set({ twinMemories }),

  wellnessPrograms: [],
  isLoadingWellness: false,
  setWellnessPrograms: (wellnessPrograms) => set({ wellnessPrograms }),
  setIsLoadingWellness: (isLoadingWellness) => set({ isLoadingWellness }),

  calculateLiveScores: () => {
    const { labParameters, wearableParameters, parameterDefinitions, parameterRanges, personalDetails } = get();
    if (parameterDefinitions.length === 0 || parameterRanges.length === 0) return;

    const allParams = [...labParameters, ...wearableParameters];
    const computedScores = calculateAxesScores(
      allParams,
      parameterDefinitions,
      parameterRanges,
      personalDetails
    );

    set({ scores: computedScores });
  }
}));

export type DynamicContentType = 'video' | 'game' | 'assessment';

export interface DynamicVideo {
  id: string;
  title: string;
  description: string;
  url: string; // YouTube/Vimeo embed URL
  durationMinutes: number;
}

export interface DynamicGame {
  id: string;
  title: string;
  description: string;
  type: 'box_breathing' | 'senses_54321' | 'body_scan';
}

export interface AssessmentQuestion {
  id: string;
  text: string;
  options: { label: string; value: number }[];
}

export interface DynamicAssessment {
  id: string; // e.g., 'GAD-7', 'PHQ-9', 'PSS-4'
  title: string;
  description: string;
  questions: AssessmentQuestion[];
}

// 1. VIDEOS LIBRARY
export const DYNAMIC_VIDEOS: Record<string, DynamicVideo> = {
  'meditation_sleep': {
    id: 'meditation_sleep',
    title: 'Deep Sleep & Relaxation Meditation',
    description: 'A guided journey to help your mind unwind for restful sleep.',
    url: 'https://www.youtube.com/embed/aEqlQvczMNk', // Example high-quality sleep meditation
    durationMinutes: 10,
  },
  'panic_grounding': {
    id: 'panic_grounding',
    title: 'Rapid Panic Attack Relief',
    description: 'Follow this guided breathing to lower your heart rate immediately.',
    url: 'https://www.youtube.com/embed/tEmt1Znux58', // Example grounding meditation
    durationMinutes: 5,
  },
  'somatic_tension': {
    id: 'somatic_tension',
    title: 'Somatic Body Release',
    description: 'Release physical tension stored in the body caused by stress.',
    url: 'https://www.youtube.com/embed/1nZIGjm7m2g', // Example somatic release
    durationMinutes: 8,
  }
};

// 2. GAMES / EXERCISES LIBRARY
export const DYNAMIC_GAMES: Record<string, DynamicGame> = {
  'box_breathing': {
    id: 'box_breathing',
    title: 'Box Breathing Exercise',
    description: 'Breathe in, hold, exhale, hold. A powerful technique used by neuroscientists to calm the nervous system.',
    type: 'box_breathing',
  },
  'senses_54321': {
    id: 'senses_54321',
    title: '5-4-3-2-1 Grounding',
    description: 'An interactive mindfulness exercise to pull your focus out of panic and into your immediate environment.',
    type: 'senses_54321',
  }
};

// 3. CLINICAL ASSESSMENTS LIBRARY
const DEFAULT_FREQUENCY_OPTIONS = [
  { label: 'Not at all', value: 0 },
  { label: 'Several days', value: 1 },
  { label: 'More than half the days', value: 2 },
  { label: 'Nearly every day', value: 3 },
];

export const DYNAMIC_ASSESSMENTS: Record<string, DynamicAssessment> = {
  'GAD-7': {
    id: 'GAD-7',
    title: 'GAD-7 Anxiety Assessment',
    description: 'This clinical tool helps us understand the severity of your anxiety over the last 2 weeks.',
    questions: [
      { id: 'q1', text: 'Feeling nervous, anxious or on edge', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q2', text: 'Not being able to stop or control worrying', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q3', text: 'Worrying too much about different things', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q4', text: 'Trouble relaxing', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q5', text: 'Being so restless that it is hard to sit still', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q6', text: 'Becoming easily annoyed or irritable', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q7', text: 'Feeling afraid as if something awful might happen', options: DEFAULT_FREQUENCY_OPTIONS },
    ]
  },
  'PHQ-9': {
    id: 'PHQ-9',
    title: 'PHQ-9 Depression Screener',
    description: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
    questions: [
      { id: 'q1', text: 'Little interest or pleasure in doing things', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q2', text: 'Feeling down, depressed, or hopeless', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q3', text: 'Trouble falling or staying asleep, or sleeping too much', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q4', text: 'Feeling tired or having little energy', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q5', text: 'Poor appetite or overeating', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q6', text: 'Feeling bad about yourself — or that you are a failure', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q7', text: 'Trouble concentrating on things, such as reading the newspaper or watching television', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q8', text: 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual', options: DEFAULT_FREQUENCY_OPTIONS },
      { id: 'q9', text: 'Thoughts that you would be better off dead or of hurting yourself in some way', options: DEFAULT_FREQUENCY_OPTIONS },
    ]
  },
  'PSS-4': {
    id: 'PSS-4',
    title: 'Perceived Stress Scale (PSS-4)',
    description: 'In the last month, how often have you felt the following?',
    questions: [
      { 
        id: 'q1', 
        text: 'How often have you felt that you were unable to control the important things in your life?', 
        options: [
          { label: 'Never', value: 0 }, { label: 'Almost Never', value: 1 }, { label: 'Sometimes', value: 2 }, { label: 'Fairly Often', value: 3 }, { label: 'Very Often', value: 4 }
        ] 
      },
      { 
        id: 'q2', 
        text: 'How often have you felt confident about your ability to handle your personal problems?', 
        options: [
          { label: 'Never', value: 4 }, { label: 'Almost Never', value: 3 }, { label: 'Sometimes', value: 2 }, { label: 'Fairly Often', value: 1 }, { label: 'Very Often', value: 0 } // Reverse scored
        ] 
      },
      { 
        id: 'q3', 
        text: 'How often have you felt that things were going your way?', 
        options: [
          { label: 'Never', value: 4 }, { label: 'Almost Never', value: 3 }, { label: 'Sometimes', value: 2 }, { label: 'Fairly Often', value: 1 }, { label: 'Very Often', value: 0 } // Reverse scored
        ] 
      },
      { 
        id: 'q4', 
        text: 'How often have you felt difficulties were piling up so high that you could not overcome them?', 
        options: [
          { label: 'Never', value: 0 }, { label: 'Almost Never', value: 1 }, { label: 'Sometimes', value: 2 }, { label: 'Fairly Often', value: 3 }, { label: 'Very Often', value: 4 }
        ] 
      },
    ]
  }
};

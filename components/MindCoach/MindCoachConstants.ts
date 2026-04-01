import { TherapistPersona } from '../../store/mindCoachStore';

/** Total chat messages (user + assistant) in session before we emphasize the therapy pathway proposal in UI. Aligns with n8n discovery pacing (e.g. v6 workflow: ≥20 turns and every 5 messages). */
export const THERAPY_PROPOSAL_MIN_MESSAGE_COUNT = 20;

/** Pathway confidence at or above this is treated as “ready” for plan formulation (matches discovery UI labels). */
export const THERAPY_PROPOSAL_CONFIDENCE_READY = 80;

/**
 * Pathway session: "End session" enables when model progress ≥ this, or when n8n sets is_session_close.
 * Aligns with message-count heuristic cap (85) so both paths can unlock together.
 */
export const SESSION_GOAL_MET_PROGRESS_THRESHOLD = 85;

/** Engagement: End session also enables when plan-reveal meter reaches this (pathway surfacing). */
export const ENGAGEMENT_END_SESSION_PLAN_REVEAL_MIN = 88;

/** Hero image for the therapy proposal bottom drawer (Supabase public storage). */
export const MIND_COACH_PROPOSAL_DRAWER_IMAGE =
  'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/Generated_image.jpg';

/** Placeholder summary when session-end / summarizer workflow is unavailable. */
export const MIND_COACH_DUMMY_SESSION_SUMMARY: Record<string, unknown> = {
  title: 'Session wrap-up',
  opening_reflection:
    'Thank you for being here today. This is a gentle placeholder summary until your automated session wrap-up is connected. You might still jot down what felt meaningful from our conversation.',
  takeaway_task: 'Take one minute to note one word for how you feel right now.',
  suggested_pathway: null,
};

interface TherapistConfig {
  name: string;
  color: string;
  avatarUrl: string;
  description: string;
  style: string;
  emoji: string;
}

export const THERAPIST_CONFIG: Record<TherapistPersona, TherapistConfig> = {
  maya: {
    name: 'Maya',
    color: '#B4A7D6',
    avatarUrl: 'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/guide-avatars/maya.png',
    description: 'Gentle, validating, and deeply personal. Maya sits with you in your feelings before offering guidance.',
    style: 'Warm & Empathetic',
    emoji: '🌿',
  },
  alex: {
    name: 'Alex',
    color: '#D4A574',
    avatarUrl: 'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/guide-avatars/alex.png',
    description: 'Practical, analytical, and results-driven. Alex helps you build concrete tools and structured habits.',
    style: 'Direct & Solution-focused',
    emoji: '✨',
  },
  sage: {
    name: 'Sage',
    color: '#6B8F71',
    avatarUrl: 'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/guide-avatars/sage.png',
    description: 'Calm, patient, and philosophical. Sage helps you gain perspective and find peace in the present moment.',
    style: 'Calm & Mindful',
    emoji: '🌊',
  },
};

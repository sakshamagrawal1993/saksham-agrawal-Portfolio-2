import { TherapistPersona } from '../../store/mindCoachStore';

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

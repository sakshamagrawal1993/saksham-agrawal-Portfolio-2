#!/usr/bin/env node

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const n8nRepo = '/Users/sakshamagrawal/Documents/Projects/n8n-workflows';
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function readN8n(relativePath) {
  return readFileSync(resolve(n8nRepo, relativePath), 'utf8');
}

const checks = [
  {
    id: 'MC-001',
    description: 'Mind Coach routes enforce authenticated entry',
    files: ['components/MindCoach/MindCoachLanding.tsx', 'App.tsx'],
    patterns: ['Navigate to="/mind-coach/login"', 'path="/mind-coach/login"'],
  },
  {
    id: 'MC-002',
    description: 'Landing shows disclaimer and 988 before spinner',
    files: ['components/MindCoach/MindCoachLanding.tsx'],
    patterns: ['not therapy', 'tel:988'],
  },
  {
    id: 'MC-003',
    description: 'New users route to onboarding',
    files: ['components/MindCoach/MindCoachLanding.tsx', 'components/MindCoach/MindCoachApp.tsx'],
    patterns: ['/mind-coach/new', "profileId === 'new'"],
  },
  {
    id: 'MC-010',
    description: 'Onboarding creates profile journey and session',
    files: ['components/MindCoach/Onboarding/OnboardingFlow.tsx'],
    patterns: [".from('mind_coach_profiles')", ".from('mind_coach_journeys')", ".from('mind_coach_sessions')"],
  },
  {
    id: 'MC-011',
    description: 'Onboarding save failure shows retry',
    files: ['components/MindCoach/Onboarding/OnboardingFlow.tsx'],
    patterns: ['Try again', 'saveError'],
  },
  {
    id: 'MC-020',
    description: 'Bottom navigation tabs exist',
    files: ['components/MindCoach/BottomNav.tsx'],
    patterns: ["'home'", "'sessions'", "'exercises'", "'assessments'", "'journal'", "'diary'"],
  },
  {
    id: 'MC-021',
    description: 'Toolkit hub reachable from app shell',
    files: ['components/MindCoach/MindCoachApp.tsx', 'components/MindCoach/Screens/HomeScreen.tsx'],
    patterns: ["case 'toolkit'", 'ToolkitScreen', 'setActiveTab'],
  },
  {
    id: 'MC-022',
    description: 'Store reset only on profile switch',
    files: ['components/MindCoach/MindCoachApp.tsx'],
    patterns: ['prevProfileIdRef', 'switchingProfile'],
  },
  {
    id: 'MC-030',
    description: 'Mood check-in persists',
    files: ['components/MindCoach/Screens/HomeScreen.tsx'],
    patterns: ["mind_coach_mood_entries"],
  },
  {
    id: 'MC-040',
    description: 'Sessions screen loads and creates sessions',
    files: ['components/MindCoach/Screens/SessionsScreen.tsx', 'components/MindCoach/shared/sessionLifecycle.ts'],
    patterns: ['openOrCreateInProgressSession', 'mind_coach_messages'],
  },
  {
    id: 'MC-042',
    description: 'Chat surfaces user-visible errors',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ['setChatError', 'Retry'],
  },
  {
    id: 'MC-043',
    description: 'Greeting idempotency guard',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ['greetingAttemptedForSession'],
  },
  {
    id: 'MC-044',
    description: 'Discovery state persists to journey',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ['discovery_state', '.update({ discovery_state })'],
  },
  {
    id: 'MC-045',
    description: 'Chat loading subtitle',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ['Writing a reply'],
  },
  {
    id: 'MC-041',
    description: 'User and assistant messages persist with role and metadata',
    files: ['components/MindCoach/Chat/TherapistChat.tsx', 'supabase/functions/mind-coach-chat/index.ts'],
    patterns: ["role: 'user'", "role: 'assistant'", 'dynamic_content'],
  },
  {
    id: 'MC-050',
    description: 'Session end produces summary UI with fallback',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ['fallbackSessionSummary', 'setShowSummary'],
  },
  {
    id: 'MC-051',
    description: 'Session-end invokes edge function with transcript context',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ["functions.invoke('mind-coach-session-end'", 'transcript'],
  },
  {
    id: 'MC-052',
    description: 'Journey refetch after summary close',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ['mind_coach_journeys', 'setJourney'],
  },
  {
    id: 'MC-053',
    description: 'End session blocked when zero messages',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ['messages.length === 0', 'canEndSession'],
  },
  {
    id: 'MC-060',
    description: 'Pathway proposal acceptance updates journey and inserts sessions',
    files: ['components/MindCoach/PlanProposalModal.tsx'],
    patterns: ["from('mind_coach_journeys')", 'active: false', "from('mind_coach_journey_sessions')"],
  },
  {
    id: 'MC-061',
    description: 'Phase progress stepper renders for non-engagement pathways',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ['PhaseProgressStepper', 'isEngagementDiscovery'],
  },
  {
    id: 'MC-062',
    description: 'Journey screen queries session progress by journey ID',
    files: ['components/MindCoach/Screens/JourneyScreen.tsx'],
    patterns: ["from('mind_coach_journey_sessions')", 'journey.id'],
  },
  {
    id: 'MC-091',
    description: 'Multi-user isolation: journey policies scope by authenticated user via profile',
    files: ['supabase/migrations/20260306020000_mind_coach_auth.sql'],
    patterns: ['auth_select_mc_journeys', 'profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())'],
  },
  {
    id: 'MC-063',
    description: 'Phase unlock map enforced',
    files: ['store/mindCoachStore.ts', 'components/MindCoach/shared/FeaturePreviewLockOverlay.tsx'],
    patterns: ['UNLOCK_MAP', 'FeaturePreviewLockOverlay'],
  },
  {
    id: 'MC-071',
    description: 'Diary lists sessions without summary_data',
    files: ['components/MindCoach/Screens/DiaryScreen.tsx'],
    patterns: ['summary_data', 'completed'],
  },
  {
    id: 'MC-072',
    description: 'Crisis overlay loads helplines from database',
    files: ['components/MindCoach/Chat/TherapistChat.tsx'],
    patterns: ['mind_coach_crisis_helplines', 'showCrisisSupport', 'Crisis Support'],
  },
  {
    id: 'MC-080',
    description: 'Edge chat persists dynamic_content',
    files: ['supabase/functions/mind-coach-chat/index.ts'],
    patterns: ['dynamic_content'],
  },
  {
    id: 'MC-081',
    description: 'Session-end edge calls n8n webhook',
    files: ['supabase/functions/mind-coach-session-end/index.ts'],
    patterns: ['MC_N8N_SESSION_END_WEBHOOK_URL', 'mind-coach-session-end'],
  },
  {
    id: 'MC-090',
    description: 'Mind Coach RLS policies exist',
    files: ['supabase/migrations/20260306020000_mind_coach_auth.sql'],
    patterns: ['auth_select_mc_profiles', 'user_id = auth.uid()'],
  },
  {
    id: 'MC-095',
    description: 'Production build command exists',
    files: ['package.json'],
    patterns: ['"build": "vite build"'],
  },
  {
    id: 'MC-096',
    description: 'Mind Coach QA scripts exist',
    files: ['package.json'],
    patterns: ['test:mind-coach:contract', 'test:mind-coach:browser'],
  },
  {
    id: 'MC-097',
    description: 'Mind Coach loop publication guard documented',
    files: ['AGENTS-MIND-COACH.md'],
    patterns: ['git push', 'gh pr create', 'GitHub publication remains prohibited'],
  },
  {
    id: 'MC-082',
    description: 'Chat n8n workflow has mind-coach-chat webhook',
    files: [],
    n8nFiles: ['definitions/mind-coach-therapist-chat-and-discovery-v6-robust__EBo9At6eCh0S7vkM.json'],
    patterns: ['mind-coach-chat'],
  },
  {
    id: 'MC-083',
    description: 'Session-end orchestrator has mind-coach-session-end webhook',
    files: [],
    n8nFiles: ['definitions/mind-coach-session-end-orchestrator-v6-execute-workflow__1xntJU9IDNQ3tWle.json'],
    patterns: ['mind-coach-session-end'],
  },
];

const results = checks.map((check) => {
  const missingFiles = (check.files || []).filter((file) => !existsSync(resolve(root, file)));
  const missingN8n = (check.n8nFiles || []).filter((file) => !existsSync(resolve(n8nRepo, file)));
  const combined = [
    ...(missingFiles.length === 0 ? (check.files || []).map((file) => read(file)) : []),
    ...(missingN8n.length === 0 ? (check.n8nFiles || []).map((file) => readN8n(file)) : []),
  ].join('\n');
  const missingPatterns = check.patterns.filter((pattern) => !combined.includes(pattern));
  return {
    id: check.id,
    description: check.description,
    status: missingFiles.length === 0 && missingN8n.length === 0 && missingPatterns.length === 0 ? 'PASS' : 'FAIL',
    evidence: [...(check.files || []), ...(check.n8nFiles || [])],
    missingFiles,
    missingN8n,
    missingPatterns,
    evidenceType: 'source-contract',
  };
});

const report = {
  product: 'mind-coach',
  generatedAt: new Date().toISOString(),
  testType: 'source-contract',
  summary: {
    passed: results.filter((result) => result.status === 'PASS').length,
    failed: results.filter((result) => result.status === 'FAIL').length,
    total: results.length,
  },
  caveat: 'Source-contract checks prove wiring exists, not that the user flow works. Browser, API, persistence, and RLS evidence are still required.',
  results,
};

const output = argValue('--output', '');
if (output) {
  const outputPath = resolve(root, output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
}

for (const result of results) {
  console.log(`[${result.status}] ${result.id} ${result.description}`);
  if (result.missingFiles.length) console.log(`  Missing files: ${result.missingFiles.join(', ')}`);
  if (result.missingN8n?.length) console.log(`  Missing n8n files: ${result.missingN8n.join(', ')}`);
  if (result.missingPatterns.length) console.log(`  Missing patterns: ${result.missingPatterns.join(', ')}`);
}

console.log(`Contract summary: ${report.summary.passed}/${report.summary.total} passed`);
process.exit(report.summary.failed === 0 ? 0 : 1);

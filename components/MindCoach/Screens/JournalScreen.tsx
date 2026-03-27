import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  useMindCoachStore,
  type JournalEntry,
  UNLOCK_MAP,
  firstPhaseWhereFeatureUnlocks,
} from '../../../store/mindCoachStore';
import { JournalList } from '../Journal/JournalList';
import { JournalEditor } from '../Journal/JournalEditor';
import { FeatureLockedPlaceholder } from '../shared/FeatureLockedPlaceholder';

export const JournalScreen: React.FC = () => {
  const phase = useMindCoachStore((s) => s.journey?.current_phase ?? 1);
  const unlocked =
    UNLOCK_MAP[Math.min(Math.max(phase, 1), 4)] ?? UNLOCK_MAP[1];
  const journalUnlocked = unlocked.includes('journal');

  const [mode, setMode] = useState<'list' | 'new' | 'edit'>('list');
  const [editingEntry, setEditingEntry] = useState<JournalEntry | undefined>(undefined);

  if (!journalUnlocked) {
    return (
      <FeatureLockedPlaceholder
        title="Journal"
        description="Private reflections unlock in phase 2. Complete your coach sessions in the current phase to open journaling."
        unlockPhase={firstPhaseWhereFeatureUnlocks('journal')}
      />
    );
  }

  if (mode === 'new' || mode === 'edit') {
    return (
      <JournalEditor
        entry={editingEntry}
        onBack={() => {
          setMode('list');
          setEditingEntry(undefined);
        }}
      />
    );
  }

  return (
    <div className="p-5 space-y-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#2C2A26]">Journal</h2>
          <p className="text-xs text-[#2C2A26]/40 mt-0.5">Reflect and process your thoughts</p>
        </div>
        <button
          onClick={() => { setEditingEntry(undefined); setMode('new'); }}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6B8F71] text-white text-sm font-medium rounded-xl hover:bg-[#5A7D60] transition-colors"
        >
          <Plus size={14} />
          New Entry
        </button>
      </div>
      <JournalList
        onNewEntry={() => { setEditingEntry(undefined); setMode('new'); }}
        onEditEntry={(entry) => { setEditingEntry(entry); setMode('edit'); }}
      />
    </div>
  );
};

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
import { FeaturePreviewLockOverlay } from '../shared/FeaturePreviewLockOverlay';

export const JournalScreen: React.FC = () => {
  const phase = useMindCoachStore((s) => s.journey?.current_phase ?? 1);
  const unlocked =
    UNLOCK_MAP[Math.min(Math.max(phase, 1), 4)] ?? UNLOCK_MAP[1];
  const journalUnlocked = unlocked.includes('journal');

  const [mode, setMode] = useState<'list' | 'new' | 'edit'>('list');
  const [editingEntry, setEditingEntry] = useState<JournalEntry | undefined>(undefined);

  if (!journalUnlocked) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-[#FAFAF7]">
        <FeaturePreviewLockOverlay
          unlockPhase={firstPhaseWhereFeatureUnlocks('journal')}
          featureLabel="Journal"
          hint="Private reflections unlock in phase 2. This is a preview of your journal—keep going with your sessions to write entries."
        >
          <div className="p-5 space-y-5 min-h-[50vh]">
            <div className="flex items-center justify-between pointer-events-none opacity-95">
              <div>
                <h2 className="text-xl font-semibold text-[#2C2A26]">Journal</h2>
                <p className="text-xs text-[#2C2A26]/40 mt-0.5">Reflect and process your thoughts</p>
              </div>
              <span className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6B8F71]/35 text-white text-sm font-medium rounded-xl">
                New Entry
              </span>
            </div>
            <JournalList onNewEntry={() => {}} onEditEntry={() => {}} />
          </div>
        </FeaturePreviewLockOverlay>
      </div>
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
    <div className="p-5 space-y-5 h-full">
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

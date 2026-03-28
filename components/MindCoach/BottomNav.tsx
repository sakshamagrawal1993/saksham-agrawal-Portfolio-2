import React, { useState, useCallback } from 'react';
import { Home, MessageCircle, MoreHorizontal, BookOpen, BookHeart, Wind, ClipboardList, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMindCoachStore, UNLOCK_MAP, type TabId, type MindCoachSession, type ChatMessage as ChatMessageType } from '../../store/mindCoachStore';
import { openOrCreateInProgressSession } from './shared/sessionLifecycle';

const PRIMARY_TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'sessions', label: 'Talk', icon: MessageCircle },
];

const MORE_ITEMS: { id: TabId; label: string; icon: React.ElementType; feature: string }[] = [
  { id: 'journal', label: 'Journal', icon: BookOpen, feature: 'journal' },
  { id: 'diary', label: 'Diary', icon: BookHeart, feature: 'chat' },
  { id: 'exercises', label: 'Exercises', icon: Wind, feature: 'exercises' },
  { id: 'assessments', label: 'Assessments', icon: ClipboardList, feature: 'assessments' },
];

export const BottomNav: React.FC = () => {
  const activeTab = useMindCoachStore((s) => s.activeTab);
  const setActiveTab = useMindCoachStore((s) => s.setActiveTab);
  const profile = useMindCoachStore((s) => s.profile);
  const journey = useMindCoachStore((s) => s.journey);
  const sessions = useMindCoachStore((s) => s.sessions);
  const activeSession = useMindCoachStore((s) => s.activeSession);
  const setActiveSession = useMindCoachStore((s) => s.setActiveSession);
  const setSessions = useMindCoachStore((s) => s.setSessions);
  const setMessages = useMindCoachStore((s) => s.setMessages);
  const currentPhase = useMindCoachStore((s) => s.currentPhaseNumber());
  const phase = useMindCoachStore((s) => s.journey?.current_phase ?? 1);
  const [showMore, setShowMore] = useState(false);
  const [openingTalk, setOpeningTalk] = useState(false);

  const unlockedFeatures = UNLOCK_MAP[Math.min(Math.max(phase, 1), 4)] ?? UNLOCK_MAP[1];
  const isMoreActive = MORE_ITEMS.some((item) => item.id === activeTab);

  const handleOpenTalk = useCallback(async () => {
    if (!profile || openingTalk) return;
    setOpeningTalk(true);
    try {
      if (activeSession) {
        setActiveTab('sessions');
        setShowMore(false);
        return;
      }
      const { session, initialMessages, reusedExisting } = await openOrCreateInProgressSession({
        profile,
        journey,
        currentPhase,
        sessions,
      });
      setActiveSession(session as MindCoachSession);
      setSessions(
        reusedExisting
          ? [session as MindCoachSession, ...sessions.filter((s) => s.id !== session.id)]
          : [session as MindCoachSession, ...sessions],
      );
      setMessages(initialMessages as ChatMessageType[]);
      setActiveTab('sessions');
      setShowMore(false);
    } catch (err) {
      console.error('Failed to open talk session:', err);
    } finally {
      setOpeningTalk(false);
    }
  }, [
    profile,
    openingTalk,
    sessions,
    currentPhase,
    journey,
    activeSession,
    setActiveSession,
    setSessions,
    setMessages,
    setActiveTab,
  ]);

  return (
    <>
      <nav className="flex items-center justify-around border-t border-[#E8E4DE] bg-white/80 backdrop-blur-md px-4 py-2 shrink-0">
        {PRIMARY_TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => {
                if (id === 'sessions') {
                  void handleOpenTalk();
                  return;
                }
                setActiveTab(id);
                setShowMore(false);
              }}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors ${
                isActive
                  ? 'text-[#6B8F71]'
                  : 'text-[#2C2A26]/40 hover:text-[#2C2A26]/60'
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setShowMore((s) => !s)}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors ${
            isMoreActive || showMore
              ? 'text-[#6B8F71]'
              : 'text-[#2C2A26]/40 hover:text-[#2C2A26]/60'
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={isMoreActive || showMore ? 2.2 : 1.6} />
          <span className="text-[11px] font-medium">More</span>
        </button>
      </nav>

      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-[#2C2A26]/15"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl border-t border-[#E8E4DE] px-5 pb-8 pt-3"
            >
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-semibold text-[#2C2A26]">More</p>
                <button
                  onClick={() => setShowMore(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[#2C2A26]/40 hover:text-[#2C2A26] hover:bg-[#F5F0EB] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {MORE_ITEMS.map(({ id, label, icon: Icon, feature }) => {
                  const isUnlocked = unlockedFeatures.includes(feature);
                  const isActive = activeTab === id;
                  return (
                    <button
                      key={id}
                      disabled={!isUnlocked}
                      onClick={() => {
                        setActiveTab(id);
                        setShowMore(false);
                      }}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors text-left ${
                        isActive
                          ? 'bg-[#6B8F71]/5 border-[#6B8F71]/20 text-[#6B8F71]'
                          : isUnlocked
                            ? 'bg-white border-[#E8E4DE] text-[#2C2A26] hover:bg-[#F5F0EB]'
                            : 'bg-[#F5F0EB]/50 border-[#E8E4DE]/50 text-[#2C2A26]/25 cursor-not-allowed'
                      }`}
                    >
                      <Icon size={18} strokeWidth={1.6} />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

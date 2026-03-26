import React from 'react';
import { Home, ClipboardList, BookOpen, BookHeart, Wind, MessageCircle } from 'lucide-react';
import { useMindCoachStore, TabId } from '../../store/mindCoachStore';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'sessions', label: 'Talk', icon: MessageCircle },
  { id: 'exercises', label: 'Exercises', icon: Wind },
  { id: 'assessments', label: 'Assessments', icon: ClipboardList },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'diary', label: 'Diary', icon: BookHeart },
];

export const BottomNav: React.FC = () => {
  const activeTab = useMindCoachStore((s) => s.activeTab);
  const setActiveTab = useMindCoachStore((s) => s.setActiveTab);

  return (
    <nav className="flex items-center justify-around border-t border-[#E8E4DE] bg-white/80 backdrop-blur-md px-2 py-2 shrink-0">
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
              isActive
                ? 'text-[#6B8F71]'
                : 'text-[#2C2A26]/40 hover:text-[#2C2A26]/60'
            }`}
          >
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
};

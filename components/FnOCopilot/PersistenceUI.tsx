import React, { useState } from 'react';
import { useFnOCopilotStore } from '../../store/fnoCopilotStore';
import { Eye, Bell, BookOpen, Plus } from 'lucide-react';

export const WatchlistPanel: React.FC = () => {
  const { watchlists, addWatchlist } = useFnOCopilotStore();
  const [newSymbol, setNewSymbol] = useState('');

  const handleAdd = () => {
    if (newSymbol) {
      addWatchlist({ id: crypto.randomUUID(), name: 'Main', symbols: [newSymbol] });
      setNewSymbol('');
    }
  };

  return (
    <div className="p-4 bg-[var(--fno-surface)] rounded-md border border-[var(--fno-border)]">
      <h3 className="flex items-center gap-2 font-medium mb-3">
        <Eye size={16} /> Watchlist
      </h3>
      <div className="space-y-2 mb-3">
        {watchlists.length === 0 ? (
          <div className="text-sm text-gray-500">No items in watchlist.</div>
        ) : (
          watchlists.map(w => (
            <div key={w.id} className="text-sm p-2 bg-[var(--fno-background)] rounded">
              {w.symbols.join(', ')}
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input 
          type="text" 
          value={newSymbol} 
          onChange={e => setNewSymbol(e.target.value)} 
          placeholder="Add symbol..."
          className="flex-1 text-sm bg-transparent border border-[var(--fno-border)] rounded px-2 py-1 outline-none"
        />
        <button onClick={handleAdd} className="p-1 bg-blue-600 rounded text-white"><Plus size={16}/></button>
      </div>
    </div>
  );
};

export const AlertsPanel: React.FC = () => {
  const { alerts, addAlert } = useFnOCopilotStore();
  const [symbol, setSymbol] = useState('');
  const [target, setTarget] = useState('');

  const handleAdd = () => {
    if (symbol && target) {
      addAlert({
        id: crypto.randomUUID(),
        instrument_symbol: symbol,
        alert_type: 'PRICE_ABOVE',
        target_value: parseFloat(target),
        is_active: true
      });
      setSymbol(''); setTarget('');
    }
  };

  return (
    <div className="p-4 bg-[var(--fno-surface)] rounded-md border border-[var(--fno-border)] mt-4">
      <h3 className="flex items-center gap-2 font-medium mb-3">
        <Bell size={16} /> Active Alerts
      </h3>
      <div className="space-y-2 mb-3">
        {alerts.length === 0 ? (
          <div className="text-sm text-gray-500">No active alerts.</div>
        ) : (
          alerts.map(a => (
            <div key={a.id} className="text-sm p-2 bg-[var(--fno-background)] rounded flex justify-between">
              <span>{a.instrument_symbol}</span>
              <span className="text-blue-400">&gt; {a.target_value}</span>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input 
          type="text" 
          value={symbol} 
          onChange={e => setSymbol(e.target.value)} 
          placeholder="Symbol"
          className="w-1/2 text-sm bg-transparent border border-[var(--fno-border)] rounded px-2 py-1 outline-none"
        />
        <input 
          type="number" 
          value={target} 
          onChange={e => setTarget(e.target.value)} 
          placeholder="Price"
          className="w-1/2 text-sm bg-transparent border border-[var(--fno-border)] rounded px-2 py-1 outline-none"
        />
        <button onClick={handleAdd} className="p-1 bg-blue-600 rounded text-white"><Plus size={16}/></button>
      </div>
    </div>
  );
};

export const TradeJournalPanel: React.FC = () => {
  const { journals } = useFnOCopilotStore();

  return (
    <div className="p-4 bg-[var(--fno-surface)] rounded-md border border-[var(--fno-border)] mt-4">
      <h3 className="flex items-center gap-2 font-medium mb-3">
        <BookOpen size={16} /> Trade Journal
      </h3>
      <div className="space-y-2">
        {journals.length === 0 ? (
          <div className="text-sm text-gray-500">No journal entries yet. Complete a paper trade to log an entry.</div>
        ) : (
          journals.map(j => (
            <div key={j.id} className="text-sm p-2 bg-[var(--fno-background)] rounded border border-[var(--fno-border)]">
              <div className="font-medium text-gray-300">Thesis:</div>
              <div className="mb-2">{j.thesis}</div>
              <div className="font-medium text-gray-300">Learnings:</div>
              <div>{j.learnings || 'N/A'}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

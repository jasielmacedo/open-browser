import React, { useState, useEffect } from 'react';
import { useBrowserStore } from '../../store/browser';
import { browserDataService } from '../../services/browserData';
import type { HistoryEntry } from '../../../shared/types';

export const HistorySidebar: React.FC = () => {
  const { showHistory, setShowHistory, setCurrentUrl } = useBrowserStore();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Load history when sidebar opens
  useEffect(() => {
    if (showHistory) {
      loadHistory();
    }
  }, [showHistory]);

  // Search when query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      setIsSearching(true);
      browserDataService.searchHistory(searchQuery, 100)
        .then(setHistory)
        .catch(err => console.error('Failed to search history:', err))
        .finally(() => setIsSearching(false));
    } else if (showHistory) {
      loadHistory();
    }
  }, [searchQuery, showHistory]);

  const loadHistory = () => {
    setIsSearching(true);
    browserDataService.getHistory(100)
      .then(setHistory)
      .catch(err => console.error('Failed to load history:', err))
      .finally(() => setIsSearching(false));
  };

  const handleNavigate = (url: string) => {
    setCurrentUrl(url);
    setShowHistory(false);
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await browserDataService.deleteHistory(id);
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Failed to delete history item:', err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all history?')) return;
    try {
      await browserDataService.clearHistory();
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  const handleClearOld = async () => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    try {
      await browserDataService.clearHistory(thirtyDaysAgo);
      loadHistory();
    } catch (err) {
      console.error('Failed to clear old history:', err);
    }
  };

  if (!showHistory) return null;

  // Group history by date
  const groupedHistory: Record<string, HistoryEntry[]> = {};
  history.forEach(entry => {
    const date = new Date(entry.visitTime);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateKey: string;
    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday';
    } else {
      dateKey = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    if (!groupedHistory[dateKey]) {
      groupedHistory[dateKey] = [];
    }
    groupedHistory[dateKey].push(entry);
  });

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold">History</h2>
        <button
          onClick={() => setShowHistory(false)}
          className="p-1 rounded hover:bg-accent transition-colors"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg border border-input focus-within:border-primary transition-colors">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search history..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 hover:bg-accent rounded transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 py-2 border-b border-border">
        <button
          onClick={handleClearOld}
          className="text-xs px-3 py-1.5 rounded bg-secondary hover:bg-accent transition-colors"
        >
          Clear older than 30 days
        </button>
        <button
          onClick={handleClearAll}
          className="text-xs px-3 py-1.5 rounded bg-secondary hover:bg-accent text-destructive transition-colors"
        >
          Clear all
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            Loading...
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>{searchQuery ? 'No results found' : 'No history yet'}</p>
          </div>
        ) : (
          <div className="p-2">
            {Object.entries(groupedHistory).map(([date, entries]) => (
              <div key={date} className="mb-4">
                <h3 className="text-xs font-semibold text-muted-foreground px-2 py-1 sticky top-0 bg-card">
                  {date}
                </h3>
                <div className="space-y-1">
                  {entries.map(entry => (
                    <div
                      key={entry.id}
                      onClick={() => handleNavigate(entry.url)}
                      className="group flex items-start gap-2 px-2 py-2 rounded hover:bg-accent cursor-pointer transition-colors"
                    >
                      <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{entry.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{entry.url}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(entry.visitTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {entry.visitCount && entry.visitCount > 1 && ` • ${entry.visitCount} visits`}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDelete(entry.id!, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

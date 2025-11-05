import React from 'react';
import { useTabsStore } from '../../store/tabs';

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab } = useTabsStore();

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleNewTab = () => {
    addTab();
  };

  return (
    <div className="flex items-center bg-card border-b border-border overflow-x-auto">
      {/* Tabs */}
      <div className="flex flex-1 items-center overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`group flex items-center gap-2 px-4 py-2 border-r border-border cursor-pointer transition-colors min-w-[200px] max-w-[250px] ${
              tab.id === activeTabId ? 'bg-background' : 'hover:bg-accent/50'
            } ${tab.isSuspended ? 'opacity-60' : ''}`}
          >
            {/* Favicon or icon */}
            {tab.favicon ? (
              <img src={tab.favicon} alt="" className="w-4 h-4 flex-shrink-0" />
            ) : (
              <svg
                className="w-4 h-4 flex-shrink-0 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}

            {/* Title with suspended indicator */}
            <span className="flex-1 text-sm truncate flex items-center gap-1">
              {tab.isSuspended && (
                <svg
                  className="w-3 h-3 flex-shrink-0 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
              {tab.title || tab.url || 'New Tab'}
            </span>

            {/* Close button */}
            <button
              onClick={(e) => handleCloseTab(tab.id, e)}
              className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
              title="Close tab"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* New Tab Button */}
      <button
        onClick={handleNewTab}
        className="flex-shrink-0 p-2 hover:bg-accent transition-colors border-l border-border"
        title="New tab (Ctrl+T)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
};

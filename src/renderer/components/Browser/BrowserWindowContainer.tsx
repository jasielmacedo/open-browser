import React, { useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { useTabsStore } from '../../store/tabs';
import { useTabWindowEvents } from '../../hooks/useTabWindowEvents';
import { PersonalitySelector } from '../Settings/PersonalitySelector';
import type { Personality } from '../../../shared/types';

// Helper function to get emoji for icon names
function getIconEmoji(iconName: string): string {
  const iconMap: Record<string, string> = {
    briefcase: '💼',
    code: '💻',
    target: '🎯',
    calendar: '📅',
    book: '📚',
    users: '👥',
    'book-open': '📖',
    zap: '⚡',
    palette: '🎨',
    gamepad: '🎮',
    smile: '😄',
    'message-circle': '💬',
    image: '🖼️',
    coffee: '☕',
    theater: '🎭',
    heart: '❤️',
    compass: '🧭',
    'book-heart': '📚',
    'shield-heart': '🛡️',
    sparkles: '✨',
  };

  return iconMap[iconName] || '🤖';
}

export interface BrowserWindowHandle {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  openDevTools: () => void;
  print: () => void;
  viewSource: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

/**
 * BrowserWindowContainer
 * This component manages the browser content area for BrowserWindow-based tabs.
 * Unlike WebView, the actual browser windows are managed in the main process.
 * This component only handles the UI overlay when there are no tabs.
 */
export const BrowserWindowContainer = forwardRef<BrowserWindowHandle>((props, ref) => {
  const { tabs, activeTabId, addTab } = useTabsStore();
  const [isPersonalitySelectorOpen, setIsPersonalitySelectorOpen] = useState(false);
  const [currentPersonality, setCurrentPersonality] = useState<Personality | null>(null);

  // Listen for tab window events from main process
  useTabWindowEvents();

  // Load current personality on mount
  useEffect(() => {
    const loadPersonality = async () => {
      try {
        const personality = await window.electron.invoke('personalities:getCurrent');
        setCurrentPersonality(personality);
      } catch (error) {
        console.error('Failed to load current personality:', error);
      }
    };

    loadPersonality();
  }, []);

  // Reload personality when selector closes
  useEffect(() => {
    if (!isPersonalitySelectorOpen) {
      const loadPersonality = async () => {
        try {
          const personality = await window.electron.invoke('personalities:getCurrent');
          setCurrentPersonality(personality);
        } catch (error) {
          console.error('Failed to load current personality:', error);
        }
      };

      loadPersonality();
    }
  }, [isPersonalitySelectorOpen]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    goBack: async () => {
      if (activeTabId) {
        try {
          await window.electron.invoke('tabWindow:goBack', activeTabId);
        } catch (error) {
          console.error('Failed to go back:', error);
        }
      }
    },
    goForward: async () => {
      if (activeTabId) {
        try {
          await window.electron.invoke('tabWindow:goForward', activeTabId);
        } catch (error) {
          console.error('Failed to go forward:', error);
        }
      }
    },
    reload: async () => {
      if (activeTabId) {
        try {
          await window.electron.invoke('tabWindow:reload', activeTabId);
        } catch (error) {
          console.error('Failed to reload:', error);
        }
      }
    },
    stop: async () => {
      if (activeTabId) {
        try {
          await window.electron.invoke('tabWindow:stop', activeTabId);
        } catch (error) {
          console.error('Failed to stop:', error);
        }
      }
    },
    openDevTools: async () => {
      if (activeTabId) {
        try {
          await window.electron.invoke('tabWindow:openDevTools', activeTabId);
        } catch (error) {
          console.error('Failed to open DevTools:', error);
        }
      }
    },
    print: async () => {
      if (activeTabId) {
        try {
          await window.electron.invoke('tabWindow:print', activeTabId);
        } catch (error) {
          console.error('Failed to print:', error);
        }
      }
    },
    viewSource: () => {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.url) {
        addTab(`view-source:${activeTab.url}`);
      }
    },
    zoomIn: async () => {
      if (activeTabId) {
        try {
          await window.electron.invoke('tabWindow:zoomIn', activeTabId);
        } catch (error) {
          console.error('Failed to zoom in:', error);
        }
      }
    },
    zoomOut: async () => {
      if (activeTabId) {
        try {
          await window.electron.invoke('tabWindow:zoomOut', activeTabId);
        } catch (error) {
          console.error('Failed to zoom out:', error);
        }
      }
    },
    resetZoom: async () => {
      if (activeTabId) {
        try {
          await window.electron.invoke('tabWindow:resetZoom', activeTabId);
        } catch (error) {
          console.error('Failed to reset zoom:', error);
        }
      }
    },
  }));

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const showWelcomeScreen = !activeTab?.url;

  return (
    <>
      {/*
        The actual browser windows fill the entire main window.
        This container is just for showing the welcome screen when there are no tabs.
        The BrowserWindow tabs are positioned and shown/hidden by TabWindowManager.
      */}
      <div className="flex-1 relative pointer-events-auto">
        {/* Welcome Screen - shown when active tab has no URL */}
        {showWelcomeScreen && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 z-10 bg-background">
            <div className="space-y-6 max-w-md">
              <svg
                className="w-16 h-16 mx-auto text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
              <h2 className="text-2xl font-semibold">Welcome to Open Browser</h2>
              <p className="text-muted-foreground">
                Enter a URL or search query in the address bar to get started.
              </p>
              <p className="text-sm text-muted-foreground">
                Click the AI button to chat with local models about any page.
              </p>

              {/* Current Personality Display */}
              {currentPersonality && (
                <div className="pt-2">
                  <div className="inline-flex items-center gap-3 px-4 py-3 bg-primary/10 rounded-lg border border-primary/20">
                    <span className="text-3xl">{getIconEmoji(currentPersonality.icon)}</span>
                    <div className="text-left">
                      <div className="text-sm font-semibold text-primary">
                        Current AI: {currentPersonality.personName}
                      </div>
                      <div className="text-xs text-muted-foreground">{currentPersonality.name}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Personality Selection Button */}
              <div className="pt-2">
                <button
                  onClick={() => setIsPersonalitySelectorOpen(true)}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium shadow-lg"
                >
                  {currentPersonality ? 'Change AI Personality' : 'Choose AI Personality'}
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  Customize how your AI assistant talks to you
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Personality Selector Modal */}
      <PersonalitySelector
        isOpen={isPersonalitySelectorOpen}
        onClose={() => setIsPersonalitySelectorOpen(false)}
      />
    </>
  );
});

BrowserWindowContainer.displayName = 'BrowserWindowContainer';

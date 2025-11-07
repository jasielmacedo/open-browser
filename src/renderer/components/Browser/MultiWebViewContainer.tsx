import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { useBrowserStore } from '../../store/browser';
import { useTabsStore } from '../../store/tabs';
import { browserDataService } from '../../services/browserData';
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

export interface WebViewHandle {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  getWebview: () => any;
  openDevTools: () => void;
  print: () => void;
  viewSource: () => void;
  inspectElement: (x?: number, y?: number) => void;
}

export const MultiWebViewContainer = forwardRef<WebViewHandle>((props, ref) => {
  const {
    setIsLoading,
    setCanGoBack,
    setCanGoForward,
    setCurrentUrl,
    setPageTitle,
    setFavicon,
    setLoadProgress,
  } = useBrowserStore();
  const { tabs, activeTabId, updateTab } = useTabsStore();
  const webviewRefs = useRef<Record<string, any>>({});
  const [isPersonalitySelectorOpen, setIsPersonalitySelectorOpen] = useState(false);
  const [currentPersonality, setCurrentPersonality] = useState<Personality | null>(null);

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

  // Get active webview
  const getActiveWebview = () => {
    return activeTabId ? webviewRefs.current[activeTabId] : null;
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    goBack: () => {
      try {
        getActiveWebview()?.goBack();
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    goForward: () => {
      try {
        getActiveWebview()?.goForward();
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    reload: () => {
      try {
        getActiveWebview()?.reload();
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    stop: () => {
      try {
        getActiveWebview()?.stop();
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    zoomIn: () => {
      try {
        const webview = getActiveWebview();
        if (webview) {
          const currentZoom = webview.getZoomFactor();
          webview.setZoomFactor(currentZoom + 0.1);
        }
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    zoomOut: () => {
      try {
        const webview = getActiveWebview();
        if (webview) {
          const currentZoom = webview.getZoomFactor();
          webview.setZoomFactor(Math.max(0.5, currentZoom - 0.1));
        }
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    resetZoom: () => {
      try {
        getActiveWebview()?.setZoomFactor(1.0);
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    openDevTools: () => {
      try {
        const webview = getActiveWebview();
        if (webview) {
          webview.openDevTools();
        }
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    print: () => {
      try {
        const webview = getActiveWebview();
        if (webview) {
          webview.print();
        }
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    viewSource: () => {
      try {
        const webview = getActiveWebview();
        if (webview) {
          const url = webview.getURL();
          if (url) {
            // Open view-source in a new tab
            const { addTab } = useTabsStore.getState();
            addTab(`view-source:${url}`);
          }
        }
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    inspectElement: (x?: number, y?: number) => {
      try {
        const webview = getActiveWebview();
        if (webview) {
          if (x !== undefined && y !== undefined) {
            webview.inspectElement(x, y);
          } else {
            webview.openDevTools();
          }
        }
      } catch (e) {
        console.warn('WebView not ready:', e);
      }
    },
    getWebview: () => getActiveWebview(),
  }));

  // Setup event listeners for a webview
  const setupWebviewListeners = (webview: any, tabId: string) => {
    if (!webview) return;

    const isActive = () => tabId === activeTabId;

    const handleLoadStart = () => {
      if (isActive()) {
        setIsLoading(true);
        setLoadProgress(0);
      }
    };

    const handleLoadStop = () => {
      if (isActive()) {
        setIsLoading(false);
        setLoadProgress(100);
        setCanGoBack(webview.canGoBack());
        setCanGoForward(webview.canGoForward());
        setPageTitle(webview.getTitle() || '');
      }
      // Update tab info
      updateTab(tabId, {
        title: webview.getTitle() || webview.getURL(),
      });
    };

    const handleLoadProgress = (e: any) => {
      if (isActive()) {
        setLoadProgress(Math.floor(e.progress * 100));
      }
    };

    const handlePageTitleUpdated = (e: any) => {
      const title = e.title || '';
      if (isActive()) {
        setPageTitle(title);
      }
      // Update tab title
      updateTab(tabId, { title });

      // Update history
      const url = webview.getURL();
      if (url) {
        browserDataService
          .addHistory({
            url,
            title: title || url,
            visitTime: Date.now(),
            favicon: '',
          })
          .catch((err) => console.error('Failed to update history:', err));
      }
    };

    const handlePageFaviconUpdated = (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        const favicon = e.favicons[0];
        if (isActive()) {
          setFavicon(favicon);
        }
        updateTab(tabId, { favicon });
      }
    };

    const handleDidNavigate = (e: any) => {
      if (isActive()) {
        setCurrentUrl(e.url);
        setCanGoBack(webview.canGoBack());
        setCanGoForward(webview.canGoForward());
      }

      // Clear the last programmatic URL since this is a real navigation
      (webview as any).__lastProgrammaticUrl = e.url;

      // Update tab URL
      updateTab(tabId, { url: e.url });

      // Save to history (but not view-source pages)
      if (!e.url.startsWith('view-source:')) {
        const title = webview.getTitle() || e.url;
        browserDataService
          .addHistory({
            url: e.url,
            title,
            visitTime: Date.now(),
            favicon: '',
          })
          .catch((err) => console.error('Failed to save history:', err));
      }
    };

    const handleDidNavigateInPage = (e: any) => {
      if (!e.isMainFrame) return;
      if (isActive()) {
        setCurrentUrl(e.url);
      }
      updateTab(tabId, { url: e.url });
    };

    const handleNewWindow = (e: any) => {
      e.preventDefault();
      webview.src = e.url;
    };

    const handleDidFailLoad = (e: any) => {
      if (e.errorCode === -3) return;
      if (e.isMainFrame && isActive()) {
        console.error('Failed to load:', e.errorDescription);
        setIsLoading(false);
      }
    };

    webview.addEventListener('did-start-loading', handleLoadStart);
    webview.addEventListener('did-stop-loading', handleLoadStop);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigateInPage);
    webview.addEventListener('new-window', handleNewWindow);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('load-progress', handleLoadProgress);
    webview.addEventListener('page-title-updated', handlePageTitleUpdated);
    webview.addEventListener('page-favicon-updated', handlePageFaviconUpdated);

    return () => {
      webview.removeEventListener('did-start-loading', handleLoadStart);
      webview.removeEventListener('did-stop-loading', handleLoadStop);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigateInPage);
      webview.removeEventListener('new-window', handleNewWindow);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('load-progress', handleLoadProgress);
      webview.removeEventListener('page-title-updated', handlePageTitleUpdated);
      webview.removeEventListener('page-favicon-updated', handlePageFaviconUpdated);
    };
  };

  // Update active tab info in browser store
  useEffect(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const activeWebview = getActiveWebview();

    if (activeWebview) {
      try {
        setCanGoBack(activeWebview.canGoBack());
        setCanGoForward(activeWebview.canGoForward());
        setCurrentUrl(activeWebview.getURL() || '');
        setPageTitle(activeWebview.getTitle() || '');
      } catch {
        // Webview not ready yet - use tab data
        setCurrentUrl(activeTab?.url || '');
        setPageTitle(activeTab?.title || '');
        setCanGoBack(false);
        setCanGoForward(false);
      }
    } else if (activeTab) {
      // No webview yet (new tab or suspended), use tab data
      setCurrentUrl(activeTab.url || '');
      setPageTitle(activeTab.title || '');
      setCanGoBack(false);
      setCanGoForward(false);
    }
  }, [activeTabId, tabs]);

  // Navigate tab when URL changes (after initial mount)
  useEffect(() => {
    tabs.forEach((tab) => {
      const webview = webviewRefs.current[tab.id];
      if (!webview || !tab.url) return;

      // Mark that this webview has been initialized
      if (!(webview as any).__initialized) {
        (webview as any).__initialized = true;
        return; // Skip on first render - src attribute handles initial load
      }

      // Only navigate if URL actually changed
      try {
        const currentUrl = webview.getURL?.() || '';
        // Only call loadURL if:
        // 1. We have a current URL (webview is ready)
        // 2. The URL is different from what we want to navigate to
        // 3. The URL is not a view-source URL (let those load naturally)
        if (currentUrl && currentUrl !== tab.url && !currentUrl.startsWith('view-source:')) {
          // Store the last programmatically set URL to avoid loops
          if ((webview as any).__lastProgrammaticUrl !== tab.url) {
            (webview as any).__lastProgrammaticUrl = tab.url;
            webview.loadURL(tab.url);
          }
        }
      } catch {
        // Webview might not be ready, ignore the error
        // The src attribute will handle the navigation
      }
    });
  }, [tabs]);

  return (
    <>
      <div className="flex-1 relative bg-background">
        {tabs.map((tab) => {
          const isVisible = tab.id === activeTabId;
          const shouldRenderWebview = !tab.isSuspended;

          return (
            <div key={tab.id} className={`absolute inset-0 ${isVisible ? 'block' : 'hidden'}`}>
              {/* Suspended Tab Placeholder */}
              {tab.isSuspended && isVisible && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-background">
                  <div className="space-y-4 max-w-md">
                    <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                      {tab.favicon ? (
                        <img src={tab.favicon} alt="" className="w-8 h-8" />
                      ) : (
                        <svg
                          className="w-8 h-8 text-muted-foreground"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                          />
                        </svg>
                      )}
                    </div>
                    <h2 className="text-xl font-semibold">Tab Suspended</h2>
                    <p className="text-muted-foreground">This tab was suspended to save memory.</p>
                    <p className="text-sm text-muted-foreground truncate max-w-full">
                      {tab.title || tab.url || 'No title'}
                    </p>
                    <button
                      onClick={() => {
                        const { unsuspendTab } = useTabsStore.getState();
                        unsuspendTab(tab.id);
                      }}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Reload Tab
                    </button>
                  </div>
                </div>
              )}

              {/* Welcome Screen Overlay - shown when no URL */}
              {!tab.url && !tab.isSuspended && isVisible && (
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
                            <div className="text-xs text-muted-foreground">
                              {currentPersonality.name}
                            </div>
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

              {/* WebView - only render if not suspended and has URL */}
              {shouldRenderWebview && tab.url && (
                <webview
                  ref={(el) => {
                    if (el) {
                      webviewRefs.current[tab.id] = el;
                      // Setup listeners on mount
                      const cleanup = setupWebviewListeners(el, tab.id);
                      // Store cleanup function
                      (el as any).__cleanup = cleanup;
                    } else if (webviewRefs.current[tab.id]) {
                      // Cleanup on unmount
                      const cleanup = (webviewRefs.current[tab.id] as any).__cleanup;
                      if (cleanup) cleanup();
                      delete webviewRefs.current[tab.id];
                    }
                  }}
                  src={tab.url}
                  className="w-full h-full"
                  // @ts-ignore - webview is a custom Electron element
                  // Security: Use persistent partition for session data
                  partition="persist:main"
                  // Security: Disable popups to prevent popup spam and phishing
                  allowpopups="false"
                  // Security: Enable context isolation, allow javascript and plugins for full browsing
                  // Note: Webviews are sandboxed separately from the main renderer process
                  // Allow downloads by not restricting them in sandbox
                  webpreferences="contextIsolation=true,javascript=yes,plugins=yes,sandbox=true,enableBlinkFeatures=CSSBackdropFilter"
                  // User agent string for compatibility - use latest Chrome version
                  useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Personality Selector Modal */}
      <PersonalitySelector
        isOpen={isPersonalitySelectorOpen}
        onClose={() => setIsPersonalitySelectorOpen(false)}
      />
    </>
  );
});

MultiWebViewContainer.displayName = 'MultiWebViewContainer';

import { useEffect } from 'react';
import { useTabsStore } from '../store/tabs';
import { useBrowserStore } from '../store/browser';

/**
 * Hook to listen for tab window events from the main process
 * This replaces the webview event listeners we had before
 */
export function useTabWindowEvents() {
  const { updateTab } = useTabsStore();
  const {
    setIsLoading,
    setCanGoBack,
    setCanGoForward,
    setCurrentUrl,
    setPageTitle,
    setFavicon,
    setZoomLevel,
  } = useBrowserStore();

  useEffect(() => {
    // Title updated
    const unsubTitleUpdated = window.electron.on(
      'tab-title-updated',
      ({ tabId, title }: { tabId: string; title: string }) => {
        updateTab(tabId, { title });
        // If it's the active tab, update browser state
        const activeTabId = useTabsStore.getState().activeTabId;
        if (tabId === activeTabId) {
          setPageTitle(title);
        }
      }
    );

    // Favicon updated
    const unsubFaviconUpdated = window.electron.on(
      'tab-favicon-updated',
      ({ tabId, favicon }: { tabId: string; favicon: string }) => {
        updateTab(tabId, { favicon });
        // If it's the active tab, update browser state
        const activeTabId = useTabsStore.getState().activeTabId;
        if (tabId === activeTabId) {
          setFavicon(favicon);
        }
      }
    );

    // Loading started
    const unsubLoadingStart = window.electron.on(
      'tab-loading-start',
      ({ tabId }: { tabId: string }) => {
        const activeTabId = useTabsStore.getState().activeTabId;
        if (tabId === activeTabId) {
          setIsLoading(true);
        }
      }
    );

    // Loading stopped
    const unsubLoadingStop = window.electron.on(
      'tab-loading-stop',
      ({
        tabId,
        canGoBack,
        canGoForward,
      }: {
        tabId: string;
        canGoBack: boolean;
        canGoForward: boolean;
      }) => {
        const activeTabId = useTabsStore.getState().activeTabId;
        if (tabId === activeTabId) {
          setIsLoading(false);
          setCanGoBack(canGoBack);
          setCanGoForward(canGoForward);
        }
      }
    );

    // Navigation
    const unsubDidNavigate = window.electron.on(
      'tab-did-navigate',
      ({
        tabId,
        url,
        canGoBack,
        canGoForward,
      }: {
        tabId: string;
        url: string;
        canGoBack: boolean;
        canGoForward: boolean;
      }) => {
        updateTab(tabId, { url });
        const activeTabId = useTabsStore.getState().activeTabId;
        if (tabId === activeTabId) {
          setCurrentUrl(url);
          setCanGoBack(canGoBack);
          setCanGoForward(canGoForward);
        }
      }
    );

    // In-page navigation
    const unsubDidNavigateInPage = window.electron.on(
      'tab-did-navigate-in-page',
      ({ tabId, url }: { tabId: string; url: string }) => {
        updateTab(tabId, { url });
        const activeTabId = useTabsStore.getState().activeTabId;
        if (tabId === activeTabId) {
          setCurrentUrl(url);
        }
      }
    );

    // Request new tab (from popups/target="_blank")
    const unsubRequestNew = window.electron.on('tab-request-new', ({ url }: { url: string }) => {
      const { addTab } = useTabsStore.getState();
      addTab(url);
    });

    // Load error
    const unsubLoadError = window.electron.on(
      'tab-load-error',
      ({ tabId, errorDescription }: { tabId: string; errorDescription: string }) => {
        console.error(`Tab ${tabId} load error:`, errorDescription);
        // Could show an error message here
      }
    );

    // Tab activated
    const unsubActivated = window.electron.on(
      'tab-activated',
      ({
        url,
        title,
        canGoBack,
        canGoForward,
      }: {
        url: string;
        title: string;
        canGoBack: boolean;
        canGoForward: boolean;
      }) => {
        setCurrentUrl(url);
        setPageTitle(title);
        setCanGoBack(canGoBack);
        setCanGoForward(canGoForward);
      }
    );

    // Zoom level changed
    const unsubZoomChanged = window.electron.on(
      'tab-zoom-changed',
      ({ tabId, zoomFactor }: { tabId: string; zoomLevel: number; zoomFactor: number }) => {
        const activeTabId = useTabsStore.getState().activeTabId;
        if (tabId === activeTabId) {
          // Convert zoom factor to percentage (1.0 = 100%, 1.5 = 150%)
          const percentage = Math.round(zoomFactor * 100);
          setZoomLevel(percentage);
        }
      }
    );

    // Cleanup
    return () => {
      unsubTitleUpdated();
      unsubFaviconUpdated();
      unsubLoadingStart();
      unsubLoadingStop();
      unsubDidNavigate();
      unsubDidNavigateInPage();
      unsubRequestNew();
      unsubLoadError();
      unsubActivated();
      unsubZoomChanged();
    };
  }, [
    updateTab,
    setIsLoading,
    setCanGoBack,
    setCanGoForward,
    setCurrentUrl,
    setPageTitle,
    setFavicon,
    setZoomLevel,
  ]);
}

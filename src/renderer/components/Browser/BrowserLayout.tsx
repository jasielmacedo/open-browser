import React, { useRef, useEffect, useState } from 'react';
import { NavigationBar } from './NavigationBar';
import { BrowserWindowContainer, BrowserWindowHandle } from './BrowserWindowContainer';
import { TabBar } from './TabBar';
import { ChatSidebar } from '../Chat/ChatSidebar';
import { HistorySidebar } from './HistorySidebar';
import { BookmarksSidebar } from './BookmarksSidebar';
import { ModelManager } from '../Models/ModelManager';
import { DownloadStatusBar } from '../Downloads/DownloadStatusBar';
import { DownloadToast } from './DownloadToast';
import { useBrowserStore } from '../../store/browser';
import { useTabsStore } from '../../store/tabs';
import { useModelStore } from '../../store/models';

export const BrowserLayout: React.FC = () => {
  const browserWindowRef = useRef<BrowserWindowHandle>(null);
  const { toggleHistory, toggleBookmarks } = useBrowserStore();
  const { tabs, activeTabId, addTab, closeTab, setActiveTab, loadTabs, suspendInactiveTabs } =
    useTabsStore();
  const { setIsModelManagerOpen } = useModelStore();
  const [downloadNotification, setDownloadNotification] = useState<string | null>(null);
  const [previousDownloadsCount, setPreviousDownloadsCount] = useState(0);

  // Load tabs on mount
  useEffect(() => {
    loadTabs();
  }, [loadTabs]);

  // Periodically check and suspend inactive tabs
  useEffect(() => {
    const interval = setInterval(() => {
      suspendInactiveTabs();
    }, 60 * 1000); // Check every minute

    return () => clearInterval(interval);
  }, [suspendInactiveTabs]);

  // Monitor for new downloads and show notification
  useEffect(() => {
    const checkForNewDownloads = async () => {
      try {
        const downloads = await window.electron.invoke('download:getAll', 100, 0);
        const currentCount = downloads.length;

        // If we have a new download, show notification
        if (currentCount > previousDownloadsCount && previousDownloadsCount > 0) {
          const latestDownload = downloads[0]; // Most recent download
          if (latestDownload && latestDownload.filename) {
            setDownloadNotification(latestDownload.filename);
          }
        }

        setPreviousDownloadsCount(currentCount);
      } catch (error) {
        console.error('Failed to check for new downloads:', error);
      }
    };

    // Check immediately on mount
    checkForNewDownloads();

    // Poll every 3 seconds (less aggressive)
    const interval = setInterval(checkForNewDownloads, 3000);
    return () => clearInterval(interval);
  }, [previousDownloadsCount]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in input fields (except Ctrl+H, Ctrl+B, Ctrl+T, Ctrl+W, Ctrl+Tab)
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Ctrl/Cmd + T - New Tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        addTab();
        return;
      }
      // Ctrl/Cmd + W - Close Tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
        return;
      }
      // Ctrl + Tab - Next Tab
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIndex !== -1) {
          const nextIndex = (currentIndex + 1) % tabs.length;
          setActiveTab(tabs[nextIndex].id);
        }
        return;
      }
      // Ctrl + Shift + Tab - Previous Tab
      if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIndex !== -1) {
          const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          setActiveTab(tabs[prevIndex].id);
        }
        return;
      }
      // Ctrl/Cmd + H - Toggle History
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        toggleHistory();
        return;
      }
      // Ctrl/Cmd + B - Toggle Bookmarks
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleBookmarks();
        return;
      }
      // Ctrl/Cmd + M - Open Model Manager
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        setIsModelManagerOpen(true);
        return;
      }

      if (isTyping) {
        return;
      }

      // Ctrl/Cmd + R or F5 - Reload
      if (((e.ctrlKey || e.metaKey) && e.key === 'r') || e.key === 'F5') {
        e.preventDefault();
        browserWindowRef.current?.reload();
      }
      // Ctrl/Cmd + Plus - Zoom in
      else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        browserWindowRef.current?.zoomIn();
      }
      // Ctrl/Cmd + Minus - Zoom out
      else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        browserWindowRef.current?.zoomOut();
      }
      // Ctrl/Cmd + 0 - Reset zoom
      else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        browserWindowRef.current?.resetZoom();
      }
      // Alt + Left Arrow - Back
      else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        browserWindowRef.current?.goBack();
      }
      // Alt + Right Arrow - Forward
      else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        browserWindowRef.current?.goForward();
      }
      // Ctrl/Cmd + P - Print
      else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        browserWindowRef.current?.print();
      }
      // Ctrl/Cmd + U - View Page Source
      else if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        browserWindowRef.current?.viewSource();
      }
      // F12 - Developer Tools
      else if (e.key === 'F12') {
        e.preventDefault();
        browserWindowRef.current?.openDevTools();
      }
      // Escape - Stop loading
      else if (e.key === 'Escape') {
        browserWindowRef.current?.stop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    tabs,
    activeTabId,
    addTab,
    closeTab,
    setActiveTab,
    toggleHistory,
    toggleBookmarks,
    setIsModelManagerOpen,
  ]);

  return (
    <div className="flex flex-col h-screen bg-transparent text-foreground pointer-events-none">
      {/* Tab Bar - captures clicks */}
      <div className="pointer-events-auto">
        <TabBar />
      </div>

      {/* Navigation Bar - captures clicks */}
      <div className="pointer-events-auto">
        <NavigationBar browserWindowRef={browserWindowRef} />
      </div>

      {/* Main Content Area - BrowserWindows fill entire window, UI overlays on top */}
      <div className="flex flex-1 overflow-hidden pointer-events-none">
        {/* BrowserWindow Container - hidden, manages windows in main process */}
        <BrowserWindowContainer ref={browserWindowRef} />

        {/* Sidebars (only one visible at a time) - capture clicks */}
        <div className="pointer-events-auto">
          <ChatSidebar />
          <HistorySidebar />
          <BookmarksSidebar />
        </div>
      </div>

      {/* Modal Overlays - capture clicks */}
      <div className="pointer-events-auto">
        <ModelManager />
      </div>

      {/* Download Status Bar - capture clicks */}
      <div className="pointer-events-auto">
        <DownloadStatusBar />
      </div>

      {/* Download Notification Toast - capture clicks */}
      {downloadNotification && (
        <div className="pointer-events-auto">
          <DownloadToast
            filename={downloadNotification}
            onClose={() => setDownloadNotification(null)}
          />
        </div>
      )}
    </div>
  );
};

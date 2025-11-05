import React, { useRef, useEffect } from 'react';
import { NavigationBar } from './NavigationBar';
import { MultiWebViewContainer, WebViewHandle } from './MultiWebViewContainer';
import { TabBar } from './TabBar';
import { ChatSidebar } from '../Chat/ChatSidebar';
import { HistorySidebar } from './HistorySidebar';
import { BookmarksSidebar } from './BookmarksSidebar';
import { useBrowserStore } from '../../store/browser';
import { useTabsStore } from '../../store/tabs';

export const BrowserLayout: React.FC = () => {
  const webviewRef = useRef<WebViewHandle>(null);
  const { toggleHistory, toggleBookmarks } = useBrowserStore();
  const { tabs, activeTabId, addTab, closeTab, setActiveTab, loadTabs, suspendInactiveTabs } =
    useTabsStore();

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

      if (isTyping) {
        return;
      }

      // Ctrl/Cmd + R or F5 - Reload
      if (((e.ctrlKey || e.metaKey) && e.key === 'r') || e.key === 'F5') {
        e.preventDefault();
        webviewRef.current?.reload();
      }
      // Ctrl/Cmd + Plus - Zoom in
      else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        webviewRef.current?.zoomIn();
      }
      // Ctrl/Cmd + Minus - Zoom out
      else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        webviewRef.current?.zoomOut();
      }
      // Ctrl/Cmd + 0 - Reset zoom
      else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        webviewRef.current?.resetZoom();
      }
      // Alt + Left Arrow - Back
      else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        webviewRef.current?.goBack();
      }
      // Alt + Right Arrow - Forward
      else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        webviewRef.current?.goForward();
      }
      // Ctrl/Cmd + P - Print
      else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        webviewRef.current?.print();
      }
      // Ctrl/Cmd + U - View Page Source
      else if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        webviewRef.current?.viewSource();
      }
      // F12 - Developer Tools
      else if (e.key === 'F12') {
        e.preventDefault();
        webviewRef.current?.openDevTools();
      }
      // Escape - Stop loading
      else if (e.key === 'Escape') {
        webviewRef.current?.stop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, addTab, closeTab, setActiveTab, toggleHistory, toggleBookmarks]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Tab Bar */}
      <TabBar />

      {/* Navigation Bar */}
      <NavigationBar webviewRef={webviewRef} />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Multi-Tab WebView Container */}
        <MultiWebViewContainer ref={webviewRef} />

        {/* Sidebars (only one visible at a time) */}
        <ChatSidebar />
        <HistorySidebar />
        <BookmarksSidebar />
      </div>
    </div>
  );
};

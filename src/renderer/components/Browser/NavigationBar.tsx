import React, { useState, KeyboardEvent, RefObject, useEffect } from 'react';
import { useBrowserStore } from '../../store/browser';
import { useTabsStore } from '../../store/tabs';
import { useModelStore } from '../../store/models';
import { useChatStore } from '../../store/chat';
import { WebViewHandle } from './MultiWebViewContainer';
import { browserDataService } from '../../services/browserData';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { SystemPromptSettings } from '../Settings/SystemPromptSettings';
import { supportsVision } from '../../../shared/modelRegistry';

interface NavigationBarProps {
  webviewRef: RefObject<WebViewHandle>;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({ webviewRef }) => {
  const {
    currentUrl,
    pageTitle,
    favicon,
    isLoading,
    loadProgress,
    canGoBack,
    canGoForward,
    isChatOpen,
    isBookmarked,
    setCurrentUrl,
    setIsBookmarked,
    toggleChat,
    toggleHistory,
    toggleBookmarks,
  } = useBrowserStore();
  const { updateTab, activeTabId } = useTabsStore();
  const { setIsModelManagerOpen, defaultModel } = useModelStore();
  const { sendChatMessage, setCurrentModel } = useChatStore();

  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{ url: string; title: string; visitCount?: number }>
  >([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showSystemPromptSettings, setShowSystemPromptSettings] = useState(false);

  // Sync inputValue with currentUrl when not focused (for tab changes)
  useEffect(() => {
    if (!isFocused) {
      setInputValue('');
    }
  }, [currentUrl, isFocused]);

  // Check bookmark status when URL changes
  useEffect(() => {
    if (currentUrl) {
      browserDataService
        .isBookmarked(currentUrl)
        .then(setIsBookmarked)
        .catch((err) => console.error('Failed to check bookmark status:', err));
    } else {
      setIsBookmarked(false);
    }
  }, [currentUrl, setIsBookmarked]);

  // Listen for AI context menu actions from webview
  useEffect(() => {
    const handleAIAsk = async (selectedText: string) => {
      if (!defaultModel) {
        alert('Please select a default model first');
        return;
      }
      setCurrentModel(defaultModel);
      if (!isChatOpen) {
        toggleChat();
      }
      await sendChatMessage(`Can you help me with this: "${selectedText}"`);
    };

    const handleAIExplain = async (selectedText: string) => {
      if (!defaultModel) {
        alert('Please select a default model first');
        return;
      }
      setCurrentModel(defaultModel);
      if (!isChatOpen) {
        toggleChat();
      }
      await sendChatMessage(`Please explain this: "${selectedText}"`);
    };

    const handleAITranslate = async (selectedText: string) => {
      if (!defaultModel) {
        alert('Please select a default model first');
        return;
      }
      setCurrentModel(defaultModel);
      if (!isChatOpen) {
        toggleChat();
      }
      await sendChatMessage(`Please translate this to English: "${selectedText}"`);
    };

    const handleAISummarize = async (selectedText: string) => {
      if (!defaultModel) {
        alert('Please select a default model first');
        return;
      }
      setCurrentModel(defaultModel);
      if (!isChatOpen) {
        toggleChat();
      }
      await sendChatMessage(`Please summarize this: "${selectedText}"`);
    };

    const unsubAsk = window.electron.on('ai-ask-about-selection', handleAIAsk);
    const unsubExplain = window.electron.on('ai-explain-selection', handleAIExplain);
    const unsubTranslate = window.electron.on('ai-translate-selection', handleAITranslate);
    const unsubSummarize = window.electron.on('ai-summarize-selection', handleAISummarize);

    return () => {
      unsubAsk();
      unsubExplain();
      unsubTranslate();
      unsubSummarize();
    };
  }, [defaultModel, isChatOpen, toggleChat, sendChatMessage, setCurrentModel]);

  const handleToggleBookmark = async () => {
    if (!currentUrl) return;

    try {
      if (isBookmarked) {
        await browserDataService.deleteBookmarkByUrl(currentUrl);
        setIsBookmarked(false);
      } else {
        await browserDataService.addBookmark({
          url: currentUrl,
          title: pageTitle || currentUrl,
          favicon,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        setIsBookmarked(true);
      }
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  };

  // Show current URL when not focused, allow editing when focused
  const displayValue = isFocused ? inputValue : inputValue || currentUrl;

  // Fetch suggestions when input changes
  useEffect(() => {
    if (isFocused && inputValue.length > 1) {
      browserDataService
        .searchHistory(inputValue, 10)
        .then((results) => {
          setSuggestions(
            results.map((r) => ({
              url: r.url,
              title: r.title,
              visitCount: r.visitCount,
            }))
          );
          setSelectedSuggestionIndex(-1);
        })
        .catch((err) => console.error('Failed to fetch suggestions:', err));
    } else {
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
    }
  }, [inputValue, isFocused]);

  const handleNavigate = async () => {
    if (!inputValue.trim()) return;

    let url = inputValue.trim();

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Check if it looks like a URL
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        // Treat as AI prompt - send to chat
        if (!defaultModel) {
          alert('Please select a default model first to use AI chat');
          return;
        }

        // Set the current model for the chat
        setCurrentModel(defaultModel);

        // Open chat if not already open
        if (!isChatOpen) {
          toggleChat();
        }

        // Send the query to AI
        await sendChatMessage(url);
        setInputValue('');
        (document.activeElement as HTMLInputElement)?.blur();
        return;
      }
    }

    setCurrentUrl(url);
    // Also update the active tab's URL to trigger navigation
    if (activeTabId) {
      updateTab(activeTabId, { url });
    }
    setInputValue('');
    // Blur the input to show the currentUrl
    (document.activeElement as HTMLInputElement)?.blur();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        // Navigate to selected suggestion
        const url = suggestions[selectedSuggestionIndex].url;
        setCurrentUrl(url);
        // Also update the active tab's URL to trigger navigation
        if (activeTabId) {
          updateTab(activeTabId, { url });
        }
        setInputValue('');
        setSuggestions([]);
        (e.target as HTMLInputElement).blur();
      } else {
        handleNavigate();
      }
    } else if (e.key === 'Escape') {
      if (suggestions.length > 0) {
        setSuggestions([]);
        setSelectedSuggestionIndex(-1);
      } else {
        setInputValue('');
        (e.target as HTMLInputElement).blur();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev > -1 ? prev - 1 : -1));
    }
  };

  const handleFocus = () => {
    // Pre-populate with current URL when focusing
    if (!inputValue && currentUrl) {
      setInputValue(currentUrl);
    }
    setIsFocused(true);
    // Select all on focus for easy editing
    setTimeout(() => {
      (document.activeElement as HTMLInputElement)?.select();
    }, 0);
  };

  const handleBlur = () => {
    // Delay to allow click on suggestions
    setTimeout(() => {
      setIsFocused(false);
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
      if (!inputValue) {
        setInputValue('');
      }
    }, 200);
  };

  const handleSuggestionClick = (url: string) => {
    setCurrentUrl(url);
    // Also update the active tab's URL to trigger navigation
    if (activeTabId) {
      updateTab(activeTabId, { url });
    }
    setInputValue('');
    setSuggestions([]);
    setIsFocused(false);
  };

  const handleBack = () => {
    webviewRef.current?.goBack();
  };

  const handleForward = () => {
    webviewRef.current?.goForward();
  };

  const handleRefresh = () => {
    if (isLoading) {
      webviewRef.current?.stop();
    } else {
      webviewRef.current?.reload();
    }
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (showMenu) {
      setShowMenu(false);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenuPosition({ x: rect.right - 200, y: rect.bottom + 4 });
      setShowMenu(true);
    }
  };

  const handleMenuMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleAskAI = async () => {
    if (!defaultModel) {
      alert('Please select a default model first');
      return;
    }

    try {
      // Capture page content based on model capability
      const hasVision = supportsVision(defaultModel);
      const capture = await window.electron.invoke(
        hasVision ? 'capture:forVision' : 'capture:forText'
      );

      // Open chat if not already open
      if (!isChatOpen) {
        toggleChat();
      }

      // Send to AI with page context (this will add the user message and context info)
      const prompt = hasVision
        ? 'What is on this page? Please analyze the screenshot and content.'
        : 'What is on this page? Please summarize the content.';

      await sendChatMessage(prompt, capture.screenshot ? [capture.screenshot] : undefined, capture);
    } catch (error) {
      console.error('Failed to ask AI about page:', error);
      alert('Failed to analyze page. Please try again.');
    }
  };

  const handleExplainSelection = async () => {
    if (!defaultModel) {
      alert('Please select a default model first');
      return;
    }

    try {
      // Get selected text
      const selectedText = await webviewRef.current?.executeJavaScript(
        'window.getSelection().toString()'
      );

      if (!selectedText) {
        alert('Please select some text first');
        return;
      }

      // Open chat if not already open
      if (!isChatOpen) {
        toggleChat();
      }

      // Capture page context
      const pageCapture = await window.electron.invoke('capture:forText');

      // Send to AI with selected text in context
      const prompt = `Please explain the following text:\n\n"${selectedText}"`;
      await sendChatMessage(prompt, undefined, {
        ...pageCapture,
        selectedText,
      });
    } catch (error) {
      console.error('Failed to explain selection:', error);
      alert('Failed to explain text. Please try again.');
    }
  };

  const handleSummarizePage = async () => {
    if (!defaultModel) {
      alert('Please select a default model first');
      return;
    }

    try {
      // Capture page content for text (for context)
      const pageCapture = await window.electron.invoke('capture:forText');

      // Open chat if not already open
      if (!isChatOpen) {
        toggleChat();
      }

      // Send to AI with page context
      const prompt = 'Please provide a concise summary of this page.';
      await sendChatMessage(prompt, undefined, pageCapture);
    } catch (error) {
      console.error('Failed to summarize page:', error);
      alert('Failed to summarize page. Please try again.');
    }
  };

  // Check if URL is secure
  const isSecure = currentUrl.startsWith('https://');
  const hasUrl = !!currentUrl;

  const menuItems: ContextMenuItem[] = [
    {
      label: 'Ask AI about this page',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      ),
      onClick: handleAskAI,
      disabled: !hasUrl || !defaultModel,
    },
    {
      label: 'Explain selected text',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      ),
      onClick: handleExplainSelection,
      disabled: !hasUrl || !defaultModel,
    },
    {
      label: 'Summarize page',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h7"
          />
        </svg>
      ),
      onClick: handleSummarizePage,
      disabled: !hasUrl || !defaultModel,
    },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'System Prompt Settings',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
      onClick: () => setShowSystemPromptSettings(true),
    },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Zoom In',
      shortcut: 'Ctrl++',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
          />
        </svg>
      ),
      onClick: () => webviewRef.current?.zoomIn(),
    },
    {
      label: 'Zoom Out',
      shortcut: 'Ctrl+-',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
          />
        </svg>
      ),
      onClick: () => webviewRef.current?.zoomOut(),
    },
    {
      label: 'Reset Zoom',
      shortcut: 'Ctrl+0',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      ),
      onClick: () => webviewRef.current?.resetZoom(),
    },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Print...',
      shortcut: 'Ctrl+P',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
          />
        </svg>
      ),
      onClick: () => webviewRef.current?.print(),
    },
    {
      label: 'View Page Source',
      shortcut: 'Ctrl+U',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
      ),
      onClick: () => webviewRef.current?.viewSource(),
      disabled: !hasUrl,
    },
    {
      label: 'Developer Tools',
      shortcut: 'F12',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
      ),
      onClick: () => webviewRef.current?.openDevTools(),
    },
  ];

  return (
    <div className="flex flex-col bg-card border-b border-border">
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Navigation Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleBack}
            disabled={!canGoBack}
            className="p-2 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Back"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={handleForward}
            disabled={!canGoForward}
            className="p-2 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Forward"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={handleRefresh}
            className="p-2 rounded hover:bg-accent transition-colors"
            title={isLoading ? 'Stop loading' : 'Refresh'}
          >
            {isLoading ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
          </button>
        </div>

        {/* URL Input */}
        <div className="flex-1 relative">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg border border-input focus-within:border-primary transition-colors">
            {/* Security Indicator / Favicon */}
            {!isFocused && hasUrl ? (
              isSecure ? (
                <svg
                  className="w-4 h-4 text-green-500 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              ) : currentUrl.startsWith('http://') ? (
                <svg
                  className="w-4 h-4 text-yellow-500 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              ) : favicon ? (
                <img src={favicon} alt="" className="w-4 h-4 flex-shrink-0" />
              ) : (
                <svg
                  className="w-4 h-4 text-muted-foreground flex-shrink-0"
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
              )
            ) : (
              <svg
                className="w-4 h-4 text-muted-foreground flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            )}
            <input
              type="text"
              value={displayValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Ask or enter URL..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
            {isFocused && inputValue && (
              <button
                onClick={() => setInputValue('')}
                className="p-1 hover:bg-accent rounded transition-colors flex-shrink-0"
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
            )}
          </div>

          {/* Suggestions Dropdown */}
          {suggestions.length > 0 && isFocused && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.url}
                  onClick={() => handleSuggestionClick(suggestion.url)}
                  className={`px-4 py-2 cursor-pointer transition-colors ${
                    index === selectedSuggestionIndex ? 'bg-accent' : 'hover:bg-accent'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{suggestion.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{suggestion.url}</div>
                      {suggestion.visitCount && suggestion.visitCount > 1 && (
                        <div className="text-xs text-muted-foreground">
                          Visited {suggestion.visitCount} times
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bookmark Toggle Button */}
        <button
          onClick={handleToggleBookmark}
          disabled={!currentUrl}
          className={`p-2 rounded transition-colors ${
            isBookmarked ? 'text-yellow-500 hover:bg-accent' : 'hover:bg-accent disabled:opacity-30'
          }`}
          title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          <svg
            className="w-5 h-5"
            fill={isBookmarked ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
        </button>

        {/* History Button */}
        <button
          onClick={toggleHistory}
          className="p-2 rounded hover:bg-accent transition-colors"
          title="History (Ctrl+H)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>

        {/* Bookmarks Button */}
        <button
          onClick={toggleBookmarks}
          className="p-2 rounded hover:bg-accent transition-colors"
          title="Bookmarks (Ctrl+B)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
        </button>

        {/* Model Manager Button */}
        <button
          onClick={() => setIsModelManagerOpen(true)}
          className="p-2 rounded hover:bg-accent transition-colors"
          title="Model Manager (Ctrl+M)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
            />
          </svg>
        </button>

        {/* AI Toggle Button */}
        <button
          onClick={toggleChat}
          className={`p-2 rounded transition-colors ${
            isChatOpen ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
          }`}
          title="Toggle AI Chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </button>

        {/* Three-dots Menu Button */}
        <button
          onClick={handleMenuClick}
          onMouseDown={handleMenuMouseDown}
          className="p-2 rounded hover:bg-accent transition-colors"
          title="More options"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </button>
      </div>

      {/* Context Menu */}
      {showMenu && (
        <ContextMenu items={menuItems} position={menuPosition} onClose={() => setShowMenu(false)} />
      )}

      {/* Page Title Bar */}
      {pageTitle && !isFocused && (
        <div className="px-3 pb-1.5 text-xs text-muted-foreground truncate">{pageTitle}</div>
      )}

      {/* Loading Progress Bar */}
      {isLoading && loadProgress < 100 && (
        <div className="h-0.5 bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      )}

      {/* System Prompt Settings Modal */}
      <SystemPromptSettings
        isOpen={showSystemPromptSettings}
        onClose={() => setShowSystemPromptSettings(false)}
      />
    </div>
  );
};

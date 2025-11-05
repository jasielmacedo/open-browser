import React, { useState, useEffect, useRef } from 'react';
import { useChatStore, Message } from '../../store/chat';
import { useBrowserStore } from '../../store/browser';
import { useModelStore } from '../../store/models';

export const ChatSidebar: React.FC = () => {
  const {
    messages,
    isStreaming,
    currentModel,
    addMessage,
    appendToLastMessage,
    setIsStreaming,
    setCurrentModel,
    setError,
    startNewMessage,
  } = useChatStore();
  const {
    models,
    defaultModel,
    isOllamaRunning,
    refreshModels,
    setIsOllamaRunning,
    setIsModelManagerOpen,
  } = useModelStore();
  const { isChatOpen, toggleChat } = useBrowserStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get current model metadata
  const currentModelInfo = models.find((m) => m.name === currentModel);
  const supportsVision = currentModelInfo?.metadata?.capabilities.vision ?? false;

  // Load models on mount
  useEffect(() => {
    const checkOllama = async () => {
      try {
        const running = await window.electron.invoke('ollama:isRunning');
        setIsOllamaRunning(running);

        if (running) {
          await refreshModels();

          // Set default or first model if none selected
          if (!currentModel) {
            if (defaultModel) {
              setCurrentModel(defaultModel);
            } else if (models.length > 0) {
              setCurrentModel(models[0].name);
            }
          }
        }
      } catch (error) {
        console.error('Failed to check Ollama:', error);
        setIsOllamaRunning(false);
      }
    };

    if (isChatOpen) {
      checkOllama();
    }
    // Only run when chat opens - intentionally not including other deps to avoid re-fetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatOpen]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !currentModel) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message
    addMessage({
      role: 'user',
      content: userMessage,
    });

    // Start assistant message
    setIsStreaming(true);
    setError(null);
    startNewMessage('assistant');

    try {
      // Set up streaming listener
      const unsubscribe = window.electron.on('ollama:chatToken', (token: string) => {
        appendToLastMessage(token);
      });

      // Convert messages to Ollama format
      const chatMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Add the new user message
      chatMessages.push({
        role: 'user' as const,
        content: userMessage,
      });

      // Send chat request
      await window.electron.invoke('ollama:chat', {
        model: currentModel,
        messages: chatMessages,
      });

      // Cleanup listener
      unsubscribe();
    } catch (error: any) {
      console.error('Chat error:', error);
      setError(error.message || 'Failed to get response from AI');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isChatOpen) return null;

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <h2 className="font-semibold">AI Assistant</h2>
        </div>
        <button
          onClick={toggleChat}
          className="p-1 hover:bg-accent rounded transition-colors"
          title="Close chat"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Model Selector and Management */}
      <div className="p-3 border-b border-border space-y-2">
        {!isOllamaRunning ? (
          <div className="text-sm text-muted-foreground text-center py-2">
            Ollama is not running. Please start Ollama to use the AI assistant.
          </div>
        ) : models.length === 0 ? (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground text-center py-2">
              No models installed. Download models to get started.
            </div>
            <button
              onClick={() => setIsModelManagerOpen(true)}
              className="w-full px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              Open Model Manager
            </button>
          </div>
        ) : (
          <>
            <select
              className="w-full px-3 py-2 bg-secondary border border-input rounded text-sm focus:outline-none focus:border-primary transition-colors"
              value={currentModel || ''}
              onChange={(e) => setCurrentModel(e.target.value)}
            >
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.metadata?.displayName || model.name}
                  {model.name === defaultModel ? ' (Default)' : ''}
                </option>
              ))}
            </select>
            {currentModelInfo && (
              <div className="flex items-center justify-between text-xs">
                <div className="flex gap-1">
                  {supportsVision ? (
                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded">Vision</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-secondary rounded">Text-Only</span>
                  )}
                </div>
                <button
                  onClick={() => setIsModelManagerOpen(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Manage models"
                >
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
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Start a conversation</p>
              <p className="text-xs text-muted-foreground">
                Ask questions about the current page or anything else
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        {isStreaming && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-1">
              <div
                className="w-2 h-2 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <div
                className="w-2 h-2 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <div
                className="w-2 h-2 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            <span>AI is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this page..."
            rows={2}
            className="flex-1 px-3 py-2 bg-secondary border border-input rounded text-sm resize-none focus:outline-none focus:border-primary transition-colors"
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || !currentModel || !isOllamaRunning}
            className="px-3 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send message"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className="text-xs opacity-70 mt-1">
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
};

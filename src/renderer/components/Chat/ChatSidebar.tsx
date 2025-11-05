import React, { useState, useEffect, useRef } from 'react';
import { useChatStore, Message } from '../../store/chat';
import { useBrowserStore } from '../../store/browser';
import { useModelStore } from '../../store/models';
import { supportsVision, supportsToolCalling } from '../../../shared/modelRegistry';

export const ChatSidebar: React.FC = () => {
  const {
    messages,
    isStreaming,
    currentModel,
    error,
    planningMode,
    setCurrentModel,
    setError,
    setPlanningMode,
    sendChatMessage,
    clearMessages,
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
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [includeContext, setIncludeContext] = useState(false); // User toggle for page context
  const [contextSent, setContextSent] = useState(false); // Track if context has been sent
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get current model metadata
  const currentModelInfo = models.find((m) => m.name === currentModel);
  const hasVisionSupport = currentModel ? supportsVision(currentModel) : false;
  const hasToolCallingSupport = currentModel ? supportsToolCalling(currentModel) : false;

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

  // Reset context sent flag when conversation is cleared
  useEffect(() => {
    if (messages.length === 0) {
      setContextSent(false);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !currentModel) return;

    const userMessage = input.trim();
    const messageImages = [...attachedImages];
    setInput('');
    setAttachedImages([]);

    try {
      // Capture page context only if user enabled it AND context hasn't been sent yet
      let pageCapture = undefined;
      if (includeContext && !contextSent) {
        pageCapture = await window.electron.invoke('capture:forText');
        setContextSent(true); // Mark that we've sent context
      }

      await sendChatMessage(
        userMessage,
        messageImages.length > 0 ? messageImages : undefined,
        pageCapture
      );
    } catch (error: any) {
      console.error('Chat error:', error);
      setError(error.message || 'Failed to get response from AI');
    }
  };

  const handleCaptureScreenshot = async () => {
    if (!hasVisionSupport || isCapturing) return;

    setIsCapturing(true);
    try {
      const screenshot = await window.electron.invoke('capture:screenshot');
      if (screenshot) {
        setAttachedImages((prev) => [...prev, screenshot]);
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      alert('Failed to capture screenshot. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
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
                <div className="flex gap-1 items-center">
                  {hasVisionSupport ? (
                    <>
                      <span className="px-2 py-0.5 bg-primary/10 text-primary rounded flex items-center gap-1">
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                        Vision
                      </span>
                    </>
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

      {/* Error Banner */}
      {error && !isStreaming && (
        <div className="mx-3 mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="font-medium text-destructive">Connection Error</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Dismiss"
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
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 px-4">
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
            <div className="space-y-2">
              <p className="text-sm font-medium">Start a conversation</p>
              <p className="text-xs text-muted-foreground">
                Ask questions about the current page or anything else
              </p>
              {hasVisionSupport && (
                <div className="mt-3 p-2 bg-primary/5 rounded border border-primary/20 text-xs text-muted-foreground">
                  <p className="font-medium text-primary mb-1">Vision Model Active</p>
                  <p>
                    This model can analyze images! Try using the three-dot menu to ask about the
                    current page with visual context.
                  </p>
                </div>
              )}
              {hasToolCallingSupport && (
                <div className="mt-3 p-2 bg-accent rounded border border-border text-xs text-muted-foreground">
                  <p className="font-medium text-primary mb-1">Tool Calling Supported</p>
                  <p>
                    Enable Planning Mode in the input area below to let the AI use tools for searching history, analyzing pages, and more.
                  </p>
                </div>
              )}
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
      <div className="p-3 border-t border-border space-y-2">
        {/* Image Attachments Preview */}
        {attachedImages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachedImages.map((image, index) => (
              <div key={index} className="relative group">
                <img
                  src={`data:image/jpeg;base64,${image}`}
                  alt={`Attachment ${index + 1}`}
                  className="w-20 h-20 object-cover rounded border border-border"
                />
                <button
                  onClick={() => handleRemoveImage(index)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
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
        )}

        {/* Input Area */}
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this page..."
              rows={2}
              className="w-full px-3 py-2 bg-secondary border border-input rounded text-sm resize-none focus:outline-none focus:border-primary transition-colors"
              disabled={isStreaming}
            />
            {/* Tool controls - different UI based on model capabilities */}
            <div className="flex items-center gap-4 text-xs flex-wrap">
              {/* Page Context Toggle - always available */}
              <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                <button
                  onClick={() => setIncludeContext(!includeContext)}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    includeContext ? 'bg-primary' : 'bg-muted'
                  }`}
                  disabled={isStreaming}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      includeContext ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span>Include Page Context</span>
              </label>

              {hasToolCallingSupport ? (
                /* Planning Mode Toggle - AI decides when to use tools */
                <>
                  <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    <button
                      onClick={() => setPlanningMode(!planningMode)}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                        planningMode ? 'bg-primary' : 'bg-muted'
                      }`}
                      disabled={isStreaming}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          planningMode ? 'translate-x-3.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    <span>Planning Mode</span>
                  </label>
                  {planningMode && (
                    <span className="text-[10px] text-muted-foreground/70">
                      AI can use tools to search history, analyze pages, etc.
                    </span>
                  )}
                </>
              ) : (
                /* Manual tool buttons - user triggers tools explicitly */
                hasVisionSupport && (
                  <button
                    onClick={handleCaptureScreenshot}
                    disabled={isCapturing || isStreaming}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
                    title="Capture current page screenshot"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {isCapturing ? 'Capturing...' : 'Capture screenshot'}
                  </button>
                )
              )}
            </div>
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || !currentModel || !isOllamaRunning}
            className="px-3 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-start"
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
  const isTool = message.role === 'tool';
  const isToolExecution = message.isToolExecution;

  // Special styling for tool messages
  if (isToolExecution || isTool) {
    return (
      <div className="flex justify-center my-2">
        <div
          className={`px-4 py-2 rounded-lg text-sm border ${
            isToolExecution
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-200'
              : 'bg-green-500/10 border-green-500/30 text-green-200'
          }`}
        >
          <div className="flex items-start gap-2">
            {isToolExecution ? (
              <>
                {/* Tool execution indicator */}
                <svg
                  className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <div className="flex-1">
                  <div className="font-medium mb-1">Executing Tool: {message.toolCall?.name}</div>
                  {message.toolCall?.arguments && Object.keys(message.toolCall.arguments).length > 0 && (
                    <div className="text-xs opacity-75 mt-1">
                      <code className="text-[10px]">{JSON.stringify(message.toolCall.arguments)}</code>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Tool result indicator */}
                <svg
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <div className="flex-1">
                  <div className="font-medium">Tool Result</div>
                  <div className="text-xs opacity-75 mt-1 max-h-20 overflow-y-auto">
                    <code className="text-[10px] whitespace-pre-wrap">{message.content}</code>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
        }`}
      >
        {/* Context Info Badge */}
        {isUser && message.contextInfo && (
          <div className="mb-2 text-xs opacity-75 space-y-1">
            {message.contextInfo.pageUrl && (
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                  />
                </svg>
                <span className="truncate font-medium">
                  {message.contextInfo.pageTitle || 'Page'}
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {message.contextInfo.tokenEstimate && (
                <span className="px-1.5 py-0.5 bg-primary-foreground/20 rounded text-[10px] font-medium">
                  ~{message.contextInfo.tokenEstimate} tokens
                </span>
              )}
              {message.contextInfo.hasScreenshot && (
                <span className="px-1.5 py-0.5 bg-primary-foreground/10 rounded text-[10px]">
                  Screenshot
                </span>
              )}
              {message.contextInfo.hasContent && (
                <span className="px-1.5 py-0.5 bg-primary-foreground/10 rounded text-[10px]">
                  Page Content
                </span>
              )}
              {message.contextInfo.hasHistory && (
                <span className="px-1.5 py-0.5 bg-primary-foreground/10 rounded text-[10px]">
                  History
                </span>
              )}
              {message.contextInfo.hasBookmarks && (
                <span className="px-1.5 py-0.5 bg-primary-foreground/10 rounded text-[10px]">
                  Bookmarks
                </span>
              )}
            </div>
          </div>
        )}

        {/* Display attached images */}
        {message.images && message.images.length > 0 && (
          <div className="mb-2 space-y-2">
            {message.images.map((image, index) => (
              <div key={index} className="rounded overflow-hidden border border-border/50">
                <img
                  src={`data:image/jpeg;base64,${image}`}
                  alt={`Attachment ${index + 1}`}
                  className="w-full max-w-xs object-contain"
                />
              </div>
            ))}
          </div>
        )}

        {/* Message content */}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>

        {/* Timestamp and Timing Info */}
        <div className="flex items-center gap-2 text-xs opacity-70 mt-1 flex-wrap">
          <span>
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {/* Show timing for assistant messages */}
          {!isUser && message.timing && (
            <>
              {message.timing.ttft !== undefined && (
                <span className="px-1.5 py-0.5 bg-foreground/10 rounded text-[10px] font-medium">
                  TTFT: {(message.timing.ttft / 1000).toFixed(2)}s
                </span>
              )}
              {message.timing.totalTime !== undefined && (
                <span className="px-1.5 py-0.5 bg-foreground/10 rounded text-[10px] font-medium">
                  Total: {(message.timing.totalTime / 1000).toFixed(2)}s
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

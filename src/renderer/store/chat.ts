import { create } from 'zustand';
import type { ChatMessage } from '../../shared/types';
import { buildOptimizedContext, getRecommendedLimits } from '../../shared/contextManager';
import { supportsVision, supportsToolCalling } from '../../shared/modelRegistry';
import { AVAILABLE_TOOLS, toolsToOllamaFormat, executeTool } from '../../shared/tools';

export interface Message extends ChatMessage {
  id: string;
  timestamp: Date;
  contextInfo?: {
    pageUrl?: string;
    pageTitle?: string;
    hasContent?: boolean;
    hasScreenshot?: boolean;
    hasHistory?: boolean;
    hasBookmarks?: boolean;
    tokenEstimate?: number;
  };
  toolCall?: {
    name: string;
    arguments: Record<string, any>;
  };
  toolResult?: any;
  isToolExecution?: boolean;
  thinking?: string; // Chain-of-thought reasoning from Qwen models
  timing?: {
    startTime: number;
    firstTokenTime?: number;
    endTime?: number;
    ttft?: number; // Time to first token in ms
    totalTime?: number; // Total response time in ms
  };
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  currentModel: string | null;
  streamingContent: string;
  error: string | null;
  planningMode: boolean; // Enable tool calling and agentic behavior
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  appendToLastMessage: (content: string) => void;
  setStreamingContent: (content: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setCurrentModel: (model: string) => void;
  setError: (error: string | null) => void;
  setPlanningMode: (enabled: boolean) => void;
  clearMessages: () => void;
  startNewMessage: (role: 'user' | 'assistant') => string;
  cancelGeneration: () => Promise<void>;
  sendChatMessage: (
    prompt: string,
    images?: string[],
    pageContext?: {
      url?: string;
      title?: string;
      content?: string;
      selectedText?: string;
      screenshot?: string;
      readable?: any;
    }
  ) => Promise<{ tokenEstimate?: number }>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentModel: null,
  streamingContent: '',
  error: null,
  planningMode: true, // Enable tool calling by default

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
      ],
    })),

  appendToLastMessage: (content: string) =>
    set((state) => {
      const messages = [...state.messages];
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        lastMessage.content += content;
      }
      return { messages };
    }),

  setStreamingContent: (content: string) => set({ streamingContent: content }),

  setIsStreaming: (streaming: boolean) => set({ isStreaming: streaming }),

  setCurrentModel: (model: string) => set({ currentModel: model }),

  setError: (error: string | null) => set({ error }),

  setPlanningMode: (enabled: boolean) => set({ planningMode: enabled }),

  clearMessages: () => set({ messages: [], error: null, streamingContent: '' }),

  startNewMessage: (role: 'user' | 'assistant') => {
    const id = crypto.randomUUID();
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id,
          role,
          content: '',
          timestamp: new Date(),
        },
      ],
    }));
    return id;
  },

  cancelGeneration: async () => {
    try {
      await window.electron.invoke('ollama:cancelChat');
      set({ isStreaming: false, streamingContent: '' });

      // Add a message indicating the generation was stopped
      const state = get();
      state.addMessage({
        role: 'assistant',
        content: '⏹️ Generation stopped by user.',
      });
    } catch (error) {
      console.error('Failed to cancel generation:', error);
    }
  },

  sendChatMessage: async (prompt: string, images?: string[], pageContext?: any) => {
    const state = get();
    const { currentModel, planningMode } = state;

    if (!currentModel) {
      set({ error: 'No model selected' });
      return {};
    }

    // Build optimized context first to get token estimate
    let context = undefined;
    let tokenEstimate = 0;

    if (pageContext) {
      try {
        // Check if model supports vision
        const isVisionModel = currentModel ? supportsVision(currentModel) : false;
        const hasScreenshot = !!images && images.length > 0;

        // Get recommended limits based on model and content type
        const limits = getRecommendedLimits(isVisionModel, hasScreenshot, 'normal');

        // Get browsing context (will be limited by contextManager)
        const browsingContext = await window.electron.invoke(
          'browsing:getContext',
          limits.maxHistoryItems || 5
        );

        // Build optimized context
        const optimized = buildOptimizedContext(
          pageContext,
          browsingContext,
          isVisionModel,
          limits
        );

        context = {
          page: optimized.page,
          browsingHistory: optimized.browsingHistory,
          bookmarks: optimized.bookmarks,
        };

        tokenEstimate = optimized.tokenEstimate;

        console.log(`[Context] Estimated tokens: ${tokenEstimate}`, {
          hasScreenshot,
          isVisionModel,
          limits,
        });
      } catch (error) {
        console.warn('Failed to build context:', error);
      }
    }

    // Add user message with context info
    state.addMessage({
      role: 'user',
      content: prompt,
      images,
      contextInfo: pageContext
        ? {
            pageUrl: pageContext.url,
            pageTitle: pageContext.title,
            hasContent: !!pageContext.readable?.textContent || !!pageContext.html,
            hasScreenshot: !!images && images.length > 0,
            hasHistory: !!(context as any)?.browsingHistory?.length,
            hasBookmarks: !!(context as any)?.bookmarks?.length,
            tokenEstimate,
          }
        : undefined,
    });

    // Check if we should use tool calling
    const shouldUseTools = planningMode && supportsToolCalling(currentModel);
    const tools = shouldUseTools ? toolsToOllamaFormat(AVAILABLE_TOOLS) : undefined;

    let unsubscribeToken: (() => void) | undefined;
    let unsubscribeToolCalls: (() => void) | undefined;
    let unsubscribeThinking: (() => void) | undefined;

    // Track timing
    const startTime = Date.now();
    let firstTokenTime: number | undefined;

    // Track current message ID for listeners (will be updated for follow-up messages)
    let currentMessageId: string;

    try {
      set({ isStreaming: true, error: null, streamingContent: '' });

      // Start a new assistant message with timing
      currentMessageId = state.startNewMessage('assistant');

      // Initialize timing for the message
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === currentMessageId
            ? {
                ...m,
                timing: {
                  startTime,
                },
              }
            : m
        ),
      }));

      // Set up thinking listener (for Qwen chain-of-thought reasoning)
      unsubscribeThinking = window.electron.on('ollama:reasoning', (thinkingToken: string) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === currentMessageId
              ? {
                  ...m,
                  thinking: (m.thinking || '') + thinkingToken,
                }
              : m
          ),
        }));
      });

      // Set up token listener
      unsubscribeToken = window.electron.on('ollama:chatToken', (token: string) => {
        // Track first token time
        if (!firstTokenTime) {
          firstTokenTime = Date.now();
          const ttft = firstTokenTime - startTime;
          console.log(`[Chat] First token received, TTFT: ${ttft}ms`);

          // Update message with TTFT
          set((state) => ({
            streamingContent: state.streamingContent + token,
            messages: state.messages.map((m) =>
              m.id === currentMessageId
                ? {
                    ...m,
                    timing: {
                      ...m.timing!,
                      firstTokenTime,
                      ttft,
                    },
                  }
                : m
            ),
          }));
        } else {
          set((state) => ({
            streamingContent: state.streamingContent + token,
          }));
        }
        state.appendToLastMessage(token);
      });

      // Set up tool calls listener
      unsubscribeToolCalls = window.electron.on('ollama:toolCalls', async (toolCalls: any[]) => {
        console.log('[Tool Calls] Received:', toolCalls);

        // Process each tool call
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function?.name || toolCall.name;
          const toolArgs = toolCall.function?.arguments || toolCall.arguments || {};

          // Add tool execution message to show user which tool is being used
          state.addMessage({
            role: 'assistant',
            content: `🔧 Using tool: **${toolName}**\n\`\`\`json\n${JSON.stringify(toolArgs, null, 2)}\n\`\`\``,
            isToolExecution: true,
            toolCall: {
              name: toolName,
              arguments: toolArgs,
            },
          });

          try {
            // Execute the tool
            console.log(`[Tool] Executing ${toolName} with args:`, toolArgs);
            const result = await executeTool(toolName, toolArgs);

            // Check if tool execution had an error
            if (result.error) {
              console.error(`[Tool] ${toolName} returned error:`, result.error);
              state.addMessage({
                role: 'tool',
                content: `Tool execution failed: ${result.error}`,
                toolResult: { error: result.error },
              });
            } else {
              // Add tool result message
              const resultContent = result.result !== null && result.result !== undefined
                ? JSON.stringify(result.result, null, 2)
                : 'Tool executed successfully but returned no data';

              state.addMessage({
                role: 'tool',
                content: resultContent,
                toolResult: result.result,
              });

              console.log(`[Tool] ${toolName} result:`, result);
            }
          } catch (error: any) {
            console.error(`[Tool] ${toolName} failed:`, error);
            state.addMessage({
              role: 'tool',
              content: `Tool execution error: ${error.message}`,
              toolResult: { error: error.message },
            });
          }
        }

        // After executing all tools, we need to send the results back to the AI
        // Get fresh state to include tool results
        const updatedState = get();

        // Filter and prepare messages for next round
        const messagesForAI = updatedState.messages
          .filter((m) => {
            // Filter out empty assistant messages
            if (m.role === 'assistant' && !m.content) return false;
            // Filter out error messages
            if (m.role === 'assistant' && m.content.startsWith('❌')) return false;
            // Filter out tool execution display messages (keep tool results though)
            if (m.isToolExecution) return false;
            return true;
          })
          .map((m) => ({
            role: m.role,
            content: m.content,
            images: m.images,
          }));

        // Continue the conversation with tool results
        // Don't send context again - it's already in the conversation history
        try {
          // Start a new assistant message for the response after tools
          const followUpMessageId = state.startNewMessage('assistant');

          // Update the current message ID so listeners target the new message
          currentMessageId = followUpMessageId;

          // Reset streaming state for the follow-up request
          set({ isStreaming: true, streamingContent: '' });

          // The existing token listener will handle the follow-up response
          // because appendToLastMessage always appends to the last message
          console.log('[Tool] Continuing conversation with follow-up request');

          await window.electron.invoke('ollama:chat', {
            model: currentModel,
            messages: messagesForAI,
            context: undefined, // Don't send context again
            stream: true,
            planningMode: shouldUseTools,
            tools: tools,
          });

          // After follow-up completes, reset streaming state
          set({ isStreaming: false, streamingContent: '' });
        } catch (error) {
          console.error('[Tool] Failed to continue conversation:', error);
          // Reset streaming state on error
          set({ isStreaming: false, streamingContent: '' });
          // Add error message to UI
          state.addMessage({
            role: 'assistant',
            content: `❌ **Error continuing after tool use:** ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      });

      // Get fresh state to include the user message we just added
      const currentState = get();

      // Send chat request with context and tools
      const messages = currentState.messages
        .filter((m) => {
          // Filter out empty assistant messages
          if (m.role === 'assistant' && !m.content) return false;
          // Filter out error messages
          if (m.role === 'assistant' && m.content.startsWith('❌')) return false;
          // Filter out tool execution display messages
          if (m.isToolExecution) return false;
          return true;
        })
        .map((m) => ({
          role: m.role,
          content: m.content,
          images: m.images,
        }));

      // Only send context on the first message or when explicitly provided
      // This prevents context from being duplicated in every request
      const isFirstMessage = currentState.messages.filter((m) => m.role === 'user').length === 1;
      const contextToSend = isFirstMessage ? context : undefined;

      console.log('[Chat] Sending request:', {
        messageCount: messages.length,
        isFirstMessage,
        hasContext: !!contextToSend,
        contextTokens: contextToSend ? tokenEstimate : 0,
        hasPlanningMode: shouldUseTools,
        toolCount: tools?.length || 0,
      });

      await window.electron.invoke('ollama:chat', {
        model: currentModel,
        messages,
        context: contextToSend,
        stream: true,
        planningMode: shouldUseTools,
        tools: tools,
      });

      // Track end time and calculate total time
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Update message with end timing
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === currentMessageId
            ? {
                ...m,
                timing: {
                  ...m.timing!,
                  endTime,
                  totalTime,
                },
              }
            : m
        ),
      }));

      unsubscribeToken?.();
      unsubscribeToolCalls?.();
      unsubscribeThinking?.();
      set({ isStreaming: false, streamingContent: '' });
      return { tokenEstimate };
    } catch (error) {
      console.error('Chat error:', error);
      unsubscribeToken?.();
      unsubscribeToolCalls?.();
      unsubscribeThinking?.();

      // Create user-friendly error message
      let errorMessage = 'Failed to get response from AI';
      if (error instanceof Error) {
        if (error.message.includes('ECONNRESET') || error.message.includes('socket hang up')) {
          errorMessage =
            'Connection lost to AI model. The model may still be loading or ran out of memory. Please try again.';
        } else if (error.message.includes('ECONNREFUSED')) {
          errorMessage = 'Could not connect to Ollama. Please make sure Ollama is running.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Request timed out. The model may be too slow or overloaded.';
        } else {
          errorMessage = error.message;
        }
      }

      // Add error message as system message visible to user
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `❌ **Error:** ${errorMessage}\n\n💡 **Tip:** Try asking your question again. If this persists, check Model Manager to ensure your model is properly loaded.`,
            timestamp: new Date(),
          },
        ],
        error: errorMessage,
        isStreaming: false,
        streamingContent: '',
      }));
      return {};
    }
  },
}));

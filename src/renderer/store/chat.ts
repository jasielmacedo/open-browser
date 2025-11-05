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
  planningMode: false,

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

    // Track timing
    const startTime = Date.now();
    let firstTokenTime: number | undefined;

    try {
      set({ isStreaming: true, error: null, streamingContent: '' });

      // Start a new assistant message with timing
      const messageId = state.startNewMessage('assistant');

      // Initialize timing for the message
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                timing: {
                  startTime,
                },
              }
            : m
        ),
      }));

      // Set up token listener
      unsubscribeToken = window.electron.on('ollama:chatToken', (token: string) => {
        // Track first token time
        if (!firstTokenTime) {
          firstTokenTime = Date.now();
          const ttft = firstTokenTime - startTime;

          // Update message with TTFT
          set((state) => ({
            streamingContent: state.streamingContent + token,
            messages: state.messages.map((m) =>
              m.id === messageId
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

            // Add tool result message
            state.addMessage({
              role: 'tool',
              content: JSON.stringify(result.result, null, 2),
              toolResult: result.result,
            });

            console.log(`[Tool] ${toolName} result:`, result);
          } catch (error: any) {
            console.error(`[Tool] ${toolName} failed:`, error);
            state.addMessage({
              role: 'tool',
              content: `Error: ${error.message}`,
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
          state.startNewMessage('assistant');

          await window.electron.invoke('ollama:chat', {
            model: currentModel,
            messages: messagesForAI,
            context: undefined, // Don't send context again
            stream: true,
            planningMode: shouldUseTools,
            tools: tools,
          });
        } catch (error) {
          console.error('[Tool] Failed to continue conversation:', error);
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
      const isFirstMessage = currentState.messages.filter(m => m.role === 'user').length === 1;
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
          m.id === messageId
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
      set({ isStreaming: false, streamingContent: '' });
      return { tokenEstimate };
    } catch (error) {
      console.error('Chat error:', error);
      unsubscribeToken?.();
      unsubscribeToolCalls?.();

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

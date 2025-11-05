import { create } from 'zustand';
import type { ChatMessage } from '../../shared/types';

export interface Message extends ChatMessage {
  id: string;
  timestamp: Date;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  currentModel: string | null;
  streamingContent: string;
  error: string | null;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  appendToLastMessage: (content: string) => void;
  setStreamingContent: (content: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setCurrentModel: (model: string) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  startNewMessage: (role: 'user' | 'assistant') => string;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentModel: null,
  streamingContent: '',
  error: null,

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
}));

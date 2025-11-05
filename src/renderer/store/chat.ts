import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  currentModel: string | null;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  setIsStreaming: (streaming: boolean) => void;
  setCurrentModel: (model: string) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  currentModel: null,
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
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setCurrentModel: (model) => set({ currentModel: model }),
  clearMessages: () => set({ messages: [] }),
}));

export interface HistoryEntry {
  id?: number;
  url: string;
  title: string;
  visitTime: number;
  visitCount?: number;
  favicon?: string;
}

export interface Bookmark {
  id?: number;
  url: string;
  title: string;
  favicon?: string;
  tags?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BrowsingContext {
  history: HistoryEntry[];
  bookmarks: Bookmark[];
}

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isActive: boolean;
  position: number;
  isSuspended?: boolean;
  lastActiveTime?: number;
}

// LLM/Ollama related types
export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
  digest?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
  timestamp?: number;
}

export interface Conversation {
  id: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface GenerateOptions {
  model: string;
  prompt: string;
  images?: string[];
  system?: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
}

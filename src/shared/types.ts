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
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface ModelCapabilities {
  vision: boolean;
  chat: boolean;
  completion: boolean;
  embedding?: boolean;
}

export interface ModelMetadata {
  id: string;
  name: string;
  displayName: string;
  description: string;
  size?: string;
  parameters?: string;
  quantization?: string;
  capabilities: ModelCapabilities;
  recommended?: boolean;
  requiresGPU?: boolean;
  minRAM?: string;
  tags?: string[];
  family?: string;
  homepage?: string;
}

export interface ModelRegistry {
  models: ModelMetadata[];
}

export interface InstalledModelInfo extends OllamaModel {
  metadata?: ModelMetadata;
  isDefault?: boolean;
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

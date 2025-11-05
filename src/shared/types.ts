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

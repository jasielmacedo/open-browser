import type { HistoryEntry, Bookmark, BrowsingContext } from '../../shared/types';

declare global {
  interface Window {
    electron: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, callback: (...args: any[]) => void) => () => void;
      once: (channel: string, callback: (...args: any[]) => void) => void;
    };
  }
}

export const browserDataService = {
  // History
  async addHistory(entry: HistoryEntry): Promise<number> {
    return window.electron.invoke('history:add', entry);
  },

  async searchHistory(query: string, limit?: number): Promise<HistoryEntry[]> {
    return window.electron.invoke('history:search', query, limit);
  },

  async getHistory(limit?: number, offset?: number): Promise<HistoryEntry[]> {
    return window.electron.invoke('history:get', limit, offset);
  },

  async deleteHistory(id: number): Promise<void> {
    return window.electron.invoke('history:delete', id);
  },

  async clearHistory(olderThan?: number): Promise<void> {
    return window.electron.invoke('history:clear', olderThan);
  },

  // Bookmarks
  async addBookmark(bookmark: Bookmark): Promise<number> {
    return window.electron.invoke('bookmark:add', bookmark);
  },

  async getBookmarks(limit?: number, offset?: number): Promise<Bookmark[]> {
    return window.electron.invoke('bookmark:get', limit, offset);
  },

  async searchBookmarks(query: string, limit?: number): Promise<Bookmark[]> {
    return window.electron.invoke('bookmark:search', query, limit);
  },

  async isBookmarked(url: string): Promise<boolean> {
    return window.electron.invoke('bookmark:isBookmarked', url);
  },

  async deleteBookmark(id: number): Promise<void> {
    return window.electron.invoke('bookmark:delete', id);
  },

  async deleteBookmarkByUrl(url: string): Promise<void> {
    return window.electron.invoke('bookmark:deleteByUrl', url);
  },

  async updateBookmark(id: number, updates: Partial<Bookmark>): Promise<void> {
    return window.electron.invoke('bookmark:update', id, updates);
  },

  // AI Context
  async getBrowsingContext(limit?: number): Promise<BrowsingContext> {
    return window.electron.invoke('browsing:getContext', limit);
  },
};

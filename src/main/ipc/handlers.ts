import { ipcMain } from 'electron';
import { databaseService, HistoryEntry, Bookmark, Tab } from '../services/database';

export function registerIpcHandlers() {
  console.log('registerIpcHandlers called');

  // History handlers
  ipcMain.handle('history:add', async (event, entry: HistoryEntry) => {
    return databaseService.addHistory(entry);
  });
  console.log('Registered history:add handler');

  ipcMain.handle('history:search', async (event, query: string, limit?: number) => {
    return databaseService.searchHistory(query, limit);
  });

  ipcMain.handle('history:get', async (event, limit?: number, offset?: number) => {
    return databaseService.getHistory(limit, offset);
  });

  ipcMain.handle('history:delete', async (event, id: number) => {
    return databaseService.deleteHistory(id);
  });

  ipcMain.handle('history:clear', async (event, olderThan?: number) => {
    return databaseService.clearHistory(olderThan);
  });

  // Bookmark handlers
  ipcMain.handle('bookmark:add', async (event, bookmark: Bookmark) => {
    return databaseService.addBookmark(bookmark);
  });

  ipcMain.handle('bookmark:get', async (event, limit?: number, offset?: number) => {
    return databaseService.getBookmarks(limit, offset);
  });

  ipcMain.handle('bookmark:search', async (event, query: string, limit?: number) => {
    return databaseService.searchBookmarks(query, limit);
  });

  ipcMain.handle('bookmark:isBookmarked', async (event, url: string) => {
    return databaseService.isBookmarked(url);
  });

  ipcMain.handle('bookmark:delete', async (event, id: number) => {
    return databaseService.deleteBookmark(id);
  });

  ipcMain.handle('bookmark:deleteByUrl', async (event, url: string) => {
    return databaseService.deleteBookmarkByUrl(url);
  });

  ipcMain.handle('bookmark:update', async (event, id: number, updates: Partial<Bookmark>) => {
    return databaseService.updateBookmark(id, updates);
  });

  // AI context handler
  ipcMain.handle('browsing:getContext', async (event, limit?: number) => {
    return databaseService.getBrowsingContext(limit);
  });

  // Tab session handlers
  ipcMain.handle('tabs:save', async (event, tabs: Tab[]) => {
    return databaseService.saveTabs(tabs);
  });

  ipcMain.handle('tabs:load', async () => {
    return databaseService.loadTabs();
  });

  ipcMain.handle('tabs:clear', async () => {
    return databaseService.clearTabs();
  });

  // Webview control handlers
  ipcMain.handle('webview:openDevTools', async (event) => {
    // The webview will handle this via executeJavaScript
    return true;
  });

  ipcMain.handle('webview:print', async (event) => {
    // The webview will handle this via print()
    return true;
  });

  ipcMain.handle('webview:viewSource', async (event, url: string) => {
    // Return the URL for view-source
    return `view-source:${url}`;
  });
}

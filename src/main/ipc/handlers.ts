import { ipcMain, BrowserWindow, webContents } from 'electron';
import { databaseService, HistoryEntry, Bookmark, Tab } from '../services/database';
import {
  validateUrl,
  validatePositiveInteger,
  validateString,
  validateBoolean,
} from '../utils/validation';
import { ollamaService } from '../services/ollama';
import { captureService } from '../services/capture';
import type { GenerateOptions, ChatOptions } from '../../shared/types';

export function registerIpcHandlers() {
  console.log('registerIpcHandlers called');

  // History handlers
  ipcMain.handle('history:add', async (event, entry: HistoryEntry) => {
    try {
      // Validate input
      if (!entry || typeof entry !== 'object') {
        throw new Error('Invalid history entry');
      }
      validateString(entry.url, 'URL', 2048);
      validateString(entry.title, 'Title', 1024);
      validatePositiveInteger(entry.visitTime, 'Visit time');

      return databaseService.addHistory(entry);
    } catch (error: any) {
      console.error('history:add validation error:', error.message);
      throw error;
    }
  });
  console.log('Registered history:add handler');

  ipcMain.handle('history:search', async (event, query: string, limit?: number) => {
    try {
      validateString(query, 'Search query', 1024);
      if (limit !== undefined) {
        validatePositiveInteger(limit, 'Limit');
      }
      return databaseService.searchHistory(query, limit);
    } catch (error: any) {
      console.error('history:search validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('history:get', async (event, limit?: number, offset?: number) => {
    try {
      if (limit !== undefined) {
        validatePositiveInteger(limit, 'Limit');
      }
      if (offset !== undefined) {
        validatePositiveInteger(offset, 'Offset');
      }
      return databaseService.getHistory(limit, offset);
    } catch (error: any) {
      console.error('history:get validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('history:delete', async (event, id: number) => {
    try {
      validatePositiveInteger(id, 'History ID');
      return databaseService.deleteHistory(id);
    } catch (error: any) {
      console.error('history:delete validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('history:clear', async (event, olderThan?: number) => {
    try {
      if (olderThan !== undefined) {
        validatePositiveInteger(olderThan, 'Older than timestamp');
      }
      return databaseService.clearHistory(olderThan);
    } catch (error: any) {
      console.error('history:clear validation error:', error.message);
      throw error;
    }
  });

  // Bookmark handlers
  ipcMain.handle('bookmark:add', async (event, bookmark: Bookmark) => {
    try {
      // Validate input
      if (!bookmark || typeof bookmark !== 'object') {
        throw new Error('Invalid bookmark');
      }
      validateString(bookmark.url, 'URL', 2048);
      validateString(bookmark.title, 'Title', 1024);
      validatePositiveInteger(bookmark.createdAt, 'Created at timestamp');
      validatePositiveInteger(bookmark.updatedAt, 'Updated at timestamp');

      return databaseService.addBookmark(bookmark);
    } catch (error: any) {
      console.error('bookmark:add validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('bookmark:get', async (event, limit?: number, offset?: number) => {
    try {
      if (limit !== undefined) {
        validatePositiveInteger(limit, 'Limit');
      }
      if (offset !== undefined) {
        validatePositiveInteger(offset, 'Offset');
      }
      return databaseService.getBookmarks(limit, offset);
    } catch (error: any) {
      console.error('bookmark:get validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('bookmark:search', async (event, query: string, limit?: number) => {
    try {
      validateString(query, 'Search query', 1024);
      if (limit !== undefined) {
        validatePositiveInteger(limit, 'Limit');
      }
      return databaseService.searchBookmarks(query, limit);
    } catch (error: any) {
      console.error('bookmark:search validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('bookmark:isBookmarked', async (event, url: string) => {
    try {
      validateString(url, 'URL', 2048);
      return databaseService.isBookmarked(url);
    } catch (error: any) {
      console.error('bookmark:isBookmarked validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('bookmark:delete', async (event, id: number) => {
    try {
      validatePositiveInteger(id, 'Bookmark ID');
      return databaseService.deleteBookmark(id);
    } catch (error: any) {
      console.error('bookmark:delete validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('bookmark:deleteByUrl', async (event, url: string) => {
    try {
      validateString(url, 'URL', 2048);
      return databaseService.deleteBookmarkByUrl(url);
    } catch (error: any) {
      console.error('bookmark:deleteByUrl validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('bookmark:update', async (event, id: number, updates: Partial<Bookmark>) => {
    try {
      validatePositiveInteger(id, 'Bookmark ID');

      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid updates object');
      }

      // Validate each field if present
      if (updates.url !== undefined) {
        validateString(updates.url, 'URL', 2048);
      }
      if (updates.title !== undefined) {
        validateString(updates.title, 'Title', 1024);
      }

      return databaseService.updateBookmark(id, updates);
    } catch (error: any) {
      console.error('bookmark:update validation error:', error.message);
      throw error;
    }
  });

  // AI context handlers
  ipcMain.handle('browsing:getContext', async (event, limit?: number) => {
    try {
      if (limit !== undefined) {
        validatePositiveInteger(limit, 'Limit');
      }
      return databaseService.getBrowsingContext(limit);
    } catch (error: any) {
      console.error('browsing:getContext validation error:', error.message);
      throw error;
    }
  });

  // Get current page context (URL, title, selected text, etc.)
  ipcMain.handle('page:getContext', async (event, pageInfo: any) => {
    try {
      // Validate page info
      if (!pageInfo || typeof pageInfo !== 'object') {
        return { url: '', title: '' }; // Return empty context if invalid
      }

      const context: any = {};

      if (pageInfo.url) {
        validateString(pageInfo.url, 'Page URL', 2048);
        context.url = pageInfo.url;
      }

      if (pageInfo.title) {
        validateString(pageInfo.title, 'Page title', 1024);
        context.title = pageInfo.title;
      }

      if (pageInfo.selectedText) {
        validateString(pageInfo.selectedText, 'Selected text', 50000);
        context.selectedText = pageInfo.selectedText;
      }

      if (pageInfo.content) {
        validateString(pageInfo.content, 'Page content', 100000);
        context.content = pageInfo.content;
      }

      return context;
    } catch (error: any) {
      console.error('page:getContext validation error:', error.message);
      throw error;
    }
  });

  // Tab session handlers
  ipcMain.handle('tabs:save', async (event, tabs: Tab[]) => {
    try {
      if (!Array.isArray(tabs)) {
        throw new Error('Tabs must be an array');
      }

      // Validate each tab
      for (const tab of tabs) {
        if (!tab || typeof tab !== 'object') {
          throw new Error('Invalid tab object');
        }
        validateString(tab.id, 'Tab ID', 256);
        validateString(tab.url, 'Tab URL', 2048);
        validateString(tab.title, 'Tab title', 1024);
        validateBoolean(tab.isActive, 'Tab isActive');
        validatePositiveInteger(tab.position, 'Tab position');
      }

      return databaseService.saveTabs(tabs);
    } catch (error: any) {
      console.error('tabs:save validation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabs:load', async () => {
    return databaseService.loadTabs();
  });

  ipcMain.handle('tabs:clear', async () => {
    return databaseService.clearTabs();
  });

  ipcMain.handle('tabs:wasCrash', async () => {
    // If app-running is "true", it means the app crashed (didn't cleanly exit)
    const wasRunning = databaseService.getSetting('app-running');
    return wasRunning === 'true';
  });

  // Webview control handlers
  ipcMain.handle('webview:openDevTools', async (_event) => {
    // The webview will handle this via executeJavaScript
    return true;
  });

  ipcMain.handle('webview:print', async (_event) => {
    // The webview will handle this via print()
    return true;
  });

  ipcMain.handle('webview:viewSource', async (event, url: string) => {
    try {
      validateString(url, 'URL', 2048);
      validateUrl(url, 'View source URL');
      // Return the URL for view-source
      return `view-source:${url}`;
    } catch (error: any) {
      console.error('webview:viewSource validation error:', error.message);
      throw error;
    }
  });

  // Page capture handlers
  ipcMain.handle('capture:page', async (event, options?: any) => {
    try {
      const webContents = event.sender;

      // Get the focused webview's webContents instead of the main window
      const focusedWebContents = webContents.isFocused()
        ? webContents
        : BrowserWindow.getFocusedWindow()?.webContents;

      if (!focusedWebContents) {
        throw new Error('No active page to capture');
      }

      const captureOptions = {
        includeScreenshot: options?.includeScreenshot ?? true,
        extractReadable: options?.extractReadable ?? true,
        maxWidth: options?.maxWidth ?? 1280,
        maxHeight: options?.maxHeight ?? 720,
        quality: options?.quality ?? 80,
      };

      return await captureService.capturePage(focusedWebContents, captureOptions);
    } catch (error: any) {
      console.error('capture:page error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('capture:screenshot', async (event, options?: any) => {
    try {
      // Find the active webview (browser tab) instead of the chat window
      const allWebContents = webContents.getAllWebContents();
      const webviewContents = allWebContents.find(wc => wc.getType() === 'webview');

      if (!webviewContents) {
        throw new Error('No active browser tab to capture screenshot');
      }

      const captureOptions = {
        maxWidth: options?.maxWidth ?? 1280,
        maxHeight: options?.maxHeight ?? 720,
        quality: options?.quality ?? 80,
      };

      return await captureService.captureScreenshotOnly(webviewContents, captureOptions);
    } catch (error: any) {
      console.error('capture:screenshot error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('capture:forVision', async (event) => {
    try {
      // Find the active webview (browser tab) instead of the chat window
      const allWebContents = webContents.getAllWebContents();
      const webviewContents = allWebContents.find(wc => wc.getType() === 'webview');

      if (!webviewContents) {
        throw new Error('No active browser tab for vision capture');
      }

      return await captureService.captureForVision(webviewContents);
    } catch (error: any) {
      console.error('capture:forVision error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('capture:forText', async (event) => {
    try {
      // Find the active webview (browser tab) instead of the chat window
      // Webviews have type 'webview' and are guest windows
      const allWebContents = webContents.getAllWebContents();
      const webviewContents = allWebContents.find(wc => wc.getType() === 'webview');

      if (!webviewContents) {
        throw new Error('No active browser tab for text capture');
      }

      return await captureService.captureForText(webviewContents);
    } catch (error: any) {
      console.error('capture:forText error:', error.message);
      throw error;
    }
  });

  // Ollama/LLM handlers
  ipcMain.handle('ollama:isRunning', async () => {
    try {
      return await ollamaService.isRunning();
    } catch (error: any) {
      console.error('ollama:isRunning error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('ollama:start', async () => {
    try {
      await ollamaService.start();
      return { success: true };
    } catch (error: any) {
      console.error('ollama:start error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('ollama:listModels', async () => {
    try {
      return await ollamaService.listModels();
    } catch (error: any) {
      console.error('ollama:listModels error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('ollama:pullModel', async (event, modelName: string) => {
    try {
      validateString(modelName, 'Model name', 256);

      // Stream progress updates back to renderer
      const generator = ollamaService.pullModel(modelName);

      for await (const progress of generator) {
        event.sender.send('ollama:pullProgress', progress);
      }

      return { success: true };
    } catch (error: any) {
      console.error('ollama:pullModel error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('ollama:deleteModel', async (event, modelName: string) => {
    try {
      validateString(modelName, 'Model name', 256);
      await ollamaService.deleteModel(modelName);
      return { success: true };
    } catch (error: any) {
      console.error('ollama:deleteModel error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('ollama:generate', async (event, options: GenerateOptions) => {
    try {
      if (!options || typeof options !== 'object') {
        throw new Error('Invalid generate options');
      }

      validateString(options.model, 'Model name', 256);
      validateString(options.prompt, 'Prompt', 50000);

      if (options.system) {
        validateString(options.system, 'System prompt', 10000);
      }

      // Validate context if provided
      if (options.context) {
        if (options.context.page?.url) {
          validateString(options.context.page.url, 'Page URL', 2048);
        }
        if (options.context.page?.title) {
          validateString(options.context.page.title, 'Page title', 1024);
        }
      }

      // Stream response tokens back to renderer
      const generator = ollamaService.generate({
        model: options.model,
        prompt: options.prompt,
        images: options.images,
        system: options.system,
        context: options.context,
        stream: true,
      });

      for await (const token of generator) {
        event.sender.send('ollama:generateToken', token);
      }

      return { success: true };
    } catch (error: any) {
      console.error('ollama:generate error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('ollama:chat', async (event, options: ChatOptions & { planningMode?: boolean; tools?: any[] }) => {
    try {
      if (!options || typeof options !== 'object') {
        throw new Error('Invalid chat options');
      }

      validateString(options.model, 'Model name', 256);

      if (!Array.isArray(options.messages)) {
        throw new Error('Messages must be an array');
      }

      // Validate messages
      for (const msg of options.messages) {
        if (!msg || typeof msg !== 'object') {
          throw new Error('Invalid message object');
        }
        validateString(msg.content, 'Message content', 50000);
        if (!['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
          throw new Error('Invalid message role');
        }
      }

      // Validate context if provided
      if (options.context) {
        if (options.context.page?.url) {
          validateString(options.context.page.url, 'Page URL', 2048);
        }
        if (options.context.page?.title) {
          validateString(options.context.page.title, 'Page title', 1024);
        }
      }

      // Stream response tokens back to renderer
      const generator = ollamaService.chat({
        model: options.model,
        messages: options.messages,
        context: options.context,
        stream: true,
        planningMode: options.planningMode,
        tools: options.tools,
      });

      for await (const token of generator) {
        // Handle both string tokens and tool call objects
        if (typeof token === 'string') {
          event.sender.send('ollama:chatToken', token);
        } else if (token.type === 'tool_calls') {
          // Send tool calls to renderer for display
          event.sender.send('ollama:toolCalls', token.tool_calls);
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('ollama:chat error:', error.message);
      throw error;
    }
  });

  // Tool execution handlers
  ipcMain.handle('tool:search_history', async (event, args: any) => {
    try {
      const { query = '', limit = 10 } = args || {};
      const history = await databaseService.searchHistory(query, limit);
      return history.map((h) => ({
        title: h.title,
        url: h.url,
        visitTime: h.visitTime,
      }));
    } catch (error: any) {
      console.error('tool:search_history error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tool:get_bookmarks', async (event, args: any) => {
    try {
      const { query = '' } = args || {};
      const bookmarks = await databaseService.getBookmarks();
      // Filter by query if provided
      if (query) {
        const lowerQuery = query.toLowerCase();
        return bookmarks.filter(
          (b) =>
            b.title.toLowerCase().includes(lowerQuery) || b.url.toLowerCase().includes(lowerQuery)
        );
      }
      return bookmarks.map((b) => ({
        title: b.title,
        url: b.url,
        tags: b.tags,
      }));
    } catch (error: any) {
      console.error('tool:get_bookmarks error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tool:analyze_page_content', async (event) => {
    try {
      const webContents = event.sender;
      const focusedWebContents = webContents.isFocused()
        ? webContents
        : BrowserWindow.getFocusedWindow()?.webContents;

      if (!focusedWebContents) {
        throw new Error('No active page to analyze');
      }

      const capture = await captureService.capturePage(focusedWebContents, {
        includeScreenshot: false,
        extractReadable: true,
      });

      return {
        url: capture.url,
        title: capture.title,
        content: capture.readable?.textContent || '',
        excerpt: capture.readable?.excerpt || '',
      };
    } catch (error: any) {
      console.error('tool:analyze_page_content error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tool:capture_screenshot', async (event) => {
    try {
      const webContents = event.sender;
      const focusedWebContents = webContents.isFocused()
        ? webContents
        : BrowserWindow.getFocusedWindow()?.webContents;

      if (!focusedWebContents) {
        throw new Error('No active page to capture');
      }

      const screenshot = await captureService.captureScreenshot(focusedWebContents);
      return { screenshot };
    } catch (error: any) {
      console.error('tool:capture_screenshot error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tool:get_page_metadata', async (event) => {
    try {
      const webContents = event.sender;
      const focusedWebContents = webContents.isFocused()
        ? webContents
        : BrowserWindow.getFocusedWindow()?.webContents;

      if (!focusedWebContents) {
        throw new Error('No active page');
      }

      const url = focusedWebContents.getURL();
      const title = focusedWebContents.getTitle();

      return {
        url,
        title,
        canGoBack: focusedWebContents.canGoBack(),
        canGoForward: focusedWebContents.canGoForward(),
      };
    } catch (error: any) {
      console.error('tool:get_page_metadata error:', error.message);
      throw error;
    }
  });
}

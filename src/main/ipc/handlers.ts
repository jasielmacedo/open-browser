import { ipcMain, BrowserWindow, webContents, dialog, shell, app } from 'electron';
import path from 'path';
import { databaseService, HistoryEntry, Bookmark, Tab } from '../services/database';
import {
  validateUrl,
  validatePositiveInteger,
  validateString,
  validateBoolean,
} from '../utils/validation';
import { ollamaService } from '../services/ollama';
import { captureService } from '../services/capture';
import { downloadService } from '../services/download';
import { tabWindowManager } from '../services/tabWindowManager';
import { createDownloadManagerWindow } from '../index';
import type {
  GenerateOptions,
  ChatOptions,
  PersonalitiesConfig,
  Personality,
} from '../../shared/types';
import personalitiesConfigData from '../../shared/personalities/personalities.json';

// Load personalities configuration
let personalitiesConfig: PersonalitiesConfig | null = null;
try {
  personalitiesConfig = personalitiesConfigData as PersonalitiesConfig;
} catch (error) {
  console.error('Failed to load personalities config:', error);
}

// Helper function to get personality by id
function getPersonalityById(personalityId: string): Personality | null {
  if (!personalitiesConfig) return null;

  for (const category of Object.values(personalitiesConfig.categories)) {
    const personality = category.personalities.find((p) => p.id === personalityId);
    if (personality) return personality;
  }
  return null;
}

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
      const webviewContents = allWebContents.find((wc) => wc.getType() === 'webview');

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

  ipcMain.handle('capture:forVision', async (_event) => {
    try {
      // Get active tab window
      const activeTabId = tabWindowManager.getActiveTabId();
      if (!activeTabId) {
        // Gracefully return null if no active tab - user might have context toggle on in empty tab
        console.log('capture:forVision: No active browser tab, skipping context capture');
        return null;
      }

      const tabWebContents = tabWindowManager.getTabWebContents(activeTabId);
      if (!tabWebContents) {
        console.log('capture:forVision: Could not access tab contents');
        return null;
      }

      return await captureService.captureForVision(tabWebContents);
    } catch (error: any) {
      console.error('capture:forVision error:', error.message);
      // Return null instead of throwing - let the chat continue without context
      return null;
    }
  });

  ipcMain.handle('capture:forText', async (_event) => {
    try {
      // Get active tab window
      const activeTabId = tabWindowManager.getActiveTabId();
      if (!activeTabId) {
        // Gracefully return null if no active tab - user might have context toggle on in empty tab
        console.log('capture:forText: No active browser tab, skipping context capture');
        return null;
      }

      const tabWebContents = tabWindowManager.getTabWebContents(activeTabId);
      if (!tabWebContents) {
        console.log('capture:forText: Could not access tab contents');
        return null;
      }

      return await captureService.captureForText(tabWebContents);
    } catch (error: any) {
      console.error('capture:forText error:', error.message);
      // Return null instead of throwing - let the chat continue without context
      return null;
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

  ipcMain.handle(
    'ollama:chat',
    async (
      event,
      options: ChatOptions & { planningMode?: boolean; tools?: any[]; think?: boolean }
    ) => {
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

        const messages = [...options.messages];

        // Add system message if not already present
        // System messages should be the first message in the conversation
        if (messages.length === 0 || messages[0].role !== 'system') {
          const defaultSystemPrompt = `You are an AI assistant integrated directly into a web browser, giving you unique capabilities to help users browse, research, and understand the web.

## Your Environment
- You are running inside a desktop browser application called "Browser-LLM"
- You can see and interact with web pages the user is viewing
- You have access to the user's browsing history and bookmarks
- You can execute tools to help users accomplish tasks

## Your Capabilities
When Planning Mode is enabled, you have access to these tools:
- **analyze_page_content**: Extract and analyze the full text content of the current webpage
- **capture_screenshot**: Take a screenshot of the current page (vision models only)
- **get_page_metadata**: Get metadata like title, URL, description, etc.
- **search_history**: Search through the user's browsing history
- **get_bookmarks**: Access the user's saved bookmarks
- **web_search**: Perform a Google search and retrieve results

## How to Help Users
1. **Context First**: If the user's message includes "## Current Page Context" with page content, USE THAT CONTEXT DIRECTLY - you don't need to call tools to get what you already have. Only call tools when:
   - The context is missing or incomplete
   - The user asks you to search history or bookmarks
   - The user asks you to perform a web search
   - You need a screenshot and one isn't provided

2. **Working with Page Context**: When page context is provided in the message:
   - URL and page title are shown at the top
   - Page content is included in the context
   - Simply analyze and respond based on what's provided
   - No need to call analyze_page_content unless you need fresh data

3. **When to Use Tools**:
   - **analyze_page_content**: Only if context is missing or user explicitly asks for fresh analysis
   - **capture_screenshot**: Only if user asks about visuals and no screenshot is provided
   - **search_history**: When user asks about past browsing or finding previously visited pages
   - **get_bookmarks**: When user asks about their saved bookmarks
   - **web_search**: When user asks you to search for new information online

4. **Be Specific**: Reference specific content from pages, use exact quotes, cite URLs

5. **Research Mode**: When asked to research or find information:
   - Use search_history to see if the user has already visited relevant pages
   - Use web_search to find new information
   - Combine multiple sources for comprehensive answers

6. **Accuracy**: Always verify information when possible by checking multiple sources

## Communication Style
- Be clear, concise, and helpful
- Use markdown formatting for better readability
- When using tools, explain what you're doing and why
- If you can't help with something, explain why and suggest alternatives

## Important Notes
- You are a LOCAL AI running on the user's machine - respect their privacy
- Page context and history are ONLY available when the user enables those features
- Always be honest about your capabilities and limitations`;

          // Always use the default system prompt as the base
          // User customizations are ADDED, not replaced
          const userCustomPrompt = databaseService.getSetting('system-prompt') || '';
          const userInfo = databaseService.getSetting('user-info') || '';
          const customInstructions = databaseService.getSetting('custom-instructions') || '';

          // Get selected personality
          const selectedPersonalityId =
            databaseService.getSetting('selected-personality') || 'best-friend';
          const selectedPersonality = getPersonalityById(selectedPersonalityId);

          // Get current date and time
          const now = new Date();
          const dateTimeInfo = `Current date and time: ${now.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
          })}`;

          // Build full system message - start with base prompt
          let fullSystemMessage = `${defaultSystemPrompt}\n\n${dateTimeInfo}`;

          // Add personality prompt if available
          if (selectedPersonality) {
            fullSystemMessage += `\n\n## AI Personality\nYou have been given the "${selectedPersonality.name}" personality. Follow these personality guidelines:\n\n${selectedPersonality.systemPrompt}`;
          }

          // Add user customizations at the bottom
          if (userCustomPrompt && userCustomPrompt.trim()) {
            fullSystemMessage += `\n\n## Additional Instructions\n${userCustomPrompt}`;
          }
          if (userInfo && userInfo.trim()) {
            fullSystemMessage += `\n\n## User Information\n${userInfo}`;
          }
          if (customInstructions && customInstructions.trim()) {
            fullSystemMessage += `\n\n## Custom Instructions\n${customInstructions}`;
          }

          // Add system message as the first message
          messages.unshift({
            role: 'system',
            content: fullSystemMessage,
          });
        }

        // Stream response tokens back to renderer
        const generator = ollamaService.chat({
          model: options.model,
          messages,
          context: options.context,
          stream: true,
          planningMode: options.planningMode,
          tools: options.tools,
          think: options.think,
        });

        for await (const token of generator) {
          // Handle both string tokens and special objects (tool calls, thinking)
          if (typeof token === 'string') {
            event.sender.send('ollama:chatToken', token);
          } else if (token.type === 'tool_calls') {
            // Send tool calls to renderer for display
            event.sender.send('ollama:toolCalls', token.tool_calls);
          } else if (token.type === 'thinking') {
            // Send thinking tokens separately to renderer (using 'reasoning' to avoid reserved word)
            event.sender.send('ollama:reasoning', token.content);
          }
        }

        return { success: true };
      } catch (error: any) {
        console.error('ollama:chat error:', error.message);
        throw error;
      }
    }
  );

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

  ipcMain.handle('tool:analyze_page_content', async (_event) => {
    try {
      // Get active tab window
      const activeTabId = tabWindowManager.getActiveTabId();
      if (!activeTabId) {
        throw new Error(
          'No browser tab is currently open. Please open a webpage first, then try again.'
        );
      }

      const tabWebContents = tabWindowManager.getTabWebContents(activeTabId);
      if (!tabWebContents) {
        throw new Error('Could not access tab contents');
      }

      const capture = await captureService.capturePage(tabWebContents, {
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

  ipcMain.handle('tool:capture_screenshot', async (_event) => {
    try {
      // Get active tab window
      const activeTabId = tabWindowManager.getActiveTabId();
      if (!activeTabId) {
        throw new Error(
          'No browser tab is currently open. Please open a webpage first, then try again.'
        );
      }

      const tabWebContents = tabWindowManager.getTabWebContents(activeTabId);
      if (!tabWebContents) {
        throw new Error('Could not access tab contents');
      }

      const screenshot = await captureService.captureScreenshot(tabWebContents);
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

  ipcMain.handle('tool:web_search', async (event, args: any) => {
    try {
      const query = args.query;
      if (!query) {
        throw new Error('Search query is required');
      }

      validateString(query, 'Search query', 2048);

      const captureScreenshot = args.capture_screenshot !== false; // Default to true

      // This is a placeholder - the actual implementation will be handled
      // by the renderer process since it needs to coordinate with the tab system
      // and webview. We return instructions for the renderer to execute.
      return {
        action: 'open_search_tab',
        query,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        captureScreenshot,
        message: `Opening Google search for: "${query}"`,
      };
    } catch (error: any) {
      console.error('tool:web_search error:', error.message);
      throw error;
    }
  });

  // Settings handlers
  ipcMain.handle('settings:get', async (_event, key: string) => {
    try {
      validateString(key, 'Settings key', 256);
      return databaseService.getSetting(key);
    } catch (error: any) {
      console.error('settings:get error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('settings:set', async (_event, key: string, value: any) => {
    try {
      validateString(key, 'Settings key', 256);

      // Convert value to string if it's not already
      let stringValue: string;
      if (typeof value === 'string') {
        stringValue = value;
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        stringValue = String(value);
      } else if (value === null || value === undefined) {
        stringValue = '';
      } else {
        // For objects/arrays, stringify them
        stringValue = JSON.stringify(value);
      }

      validateString(stringValue, 'Settings value', 10000); // Allow long values for system prompts
      return databaseService.setSetting(key, stringValue);
    } catch (error: any) {
      console.error('settings:set error:', error.message);
      throw error;
    }
  });

  // Personality handlers
  ipcMain.handle('personalities:getAll', async () => {
    try {
      return personalitiesConfig;
    } catch (error: any) {
      console.error('personalities:getAll error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('personalities:getCurrent', async () => {
    try {
      const selectedPersonalityId =
        databaseService.getSetting('selected-personality') || 'best-friend';
      const personality = getPersonalityById(selectedPersonalityId);
      return personality || null;
    } catch (error: any) {
      console.error('personalities:getCurrent error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('personalities:select', async (_event, personalityId: string) => {
    try {
      validateString(personalityId, 'Personality ID', 128);

      // Verify the personality exists
      const personality = getPersonalityById(personalityId);
      if (!personality) {
        throw new Error(`Personality not found: ${personalityId}`);
      }

      databaseService.setSetting('selected-personality', personalityId);
      return personality;
    } catch (error: any) {
      console.error('personalities:select error:', error.message);
      throw error;
    }
  });

  // Models folder handlers
  ipcMain.handle('models:getFolder', async () => {
    try {
      const ollamaHome =
        process.env.OLLAMA_MODELS ||
        (process.platform === 'win32'
          ? path.join(process.env.USERPROFILE || '', '.ollama', 'models')
          : path.join(process.env.HOME || '', '.ollama', 'models'));
      return ollamaHome;
    } catch (error: any) {
      console.error('models:getFolder error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('models:selectFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Models Folder',
        buttonLabel: 'Select Folder',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error: any) {
      console.error('models:selectFolder error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('models:openFolder', async (_event, folderPath?: string) => {
    try {
      const targetPath =
        folderPath ||
        process.env.OLLAMA_MODELS ||
        (process.platform === 'win32'
          ? path.join(process.env.USERPROFILE || '', '.ollama', 'models')
          : path.join(process.env.HOME || '', '.ollama', 'models'));

      await shell.openPath(targetPath);
      return { success: true };
    } catch (error: any) {
      console.error('models:openFolder error:', error.message);
      throw error;
    }
  });

  // Download control handlers
  ipcMain.handle('ollama:cancelPull', async (_event, modelName: string) => {
    try {
      validateString(modelName, 'Model name', 256);
      ollamaService.cancelPull(modelName);
      return { success: true };
    } catch (error: any) {
      console.error('ollama:cancelPull error:', error.message);
      throw error;
    }
  });

  // Chat control handlers
  ipcMain.handle('ollama:cancelChat', async () => {
    try {
      ollamaService.cancelChat();
      return { success: true };
    } catch (error: any) {
      console.error('ollama:cancelChat error:', error.message);
      throw error;
    }
  });

  // Service monitoring and control handlers
  ipcMain.handle('ollama:getStatus', async () => {
    try {
      return await ollamaService.getServiceStatus();
    } catch (error: any) {
      console.error('ollama:getStatus error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('ollama:restart', async () => {
    try {
      await ollamaService.restart();
      return { success: true };
    } catch (error: any) {
      console.error('ollama:restart error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('ollama:forceKill', async () => {
    try {
      await ollamaService.forceKill();
      return { success: true };
    } catch (error: any) {
      console.error('ollama:forceKill error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('ollama:stop', async () => {
    try {
      await ollamaService.stop();
      return { success: true };
    } catch (error: any) {
      console.error('ollama:stop error:', error.message);
      throw error;
    }
  });

  // Download handlers
  ipcMain.handle('download:getAll', async (_event, limit?: number, offset?: number) => {
    try {
      if (limit !== undefined) {
        validatePositiveInteger(limit, 'Limit');
      }
      if (offset !== undefined) {
        validatePositiveInteger(offset, 'Offset');
      }
      return downloadService.getDownloads(limit, offset);
    } catch (error: any) {
      console.error('download:getAll error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:getActive', async () => {
    try {
      return downloadService.getActiveDownloads();
    } catch (error: any) {
      console.error('download:getActive error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:pause', async (_event, id: number) => {
    try {
      validatePositiveInteger(id, 'Download ID');
      return downloadService.pauseDownload(id);
    } catch (error: any) {
      console.error('download:pause error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:resume', async (_event, id: number) => {
    try {
      validatePositiveInteger(id, 'Download ID');
      return downloadService.resumeDownload(id);
    } catch (error: any) {
      console.error('download:resume error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:cancel', async (_event, id: number) => {
    try {
      validatePositiveInteger(id, 'Download ID');
      return downloadService.cancelDownload(id);
    } catch (error: any) {
      console.error('download:cancel error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:open', async (_event, id: number) => {
    try {
      validatePositiveInteger(id, 'Download ID');
      return downloadService.openDownload(id);
    } catch (error: any) {
      console.error('download:open error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:showInFolder', async (_event, id: number) => {
    try {
      validatePositiveInteger(id, 'Download ID');
      return downloadService.showInFolder(id);
    } catch (error: any) {
      console.error('download:showInFolder error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:delete', async (_event, id: number) => {
    try {
      validatePositiveInteger(id, 'Download ID');
      downloadService.deleteDownload(id);
      return { success: true };
    } catch (error: any) {
      console.error('download:delete error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:clear', async (_event, olderThan?: number) => {
    try {
      if (olderThan !== undefined) {
        validatePositiveInteger(olderThan, 'Older than timestamp');
      }
      downloadService.clearDownloads(olderThan);
      return { success: true };
    } catch (error: any) {
      console.error('download:clear error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:getDefaultFolder', async () => {
    try {
      return downloadService.getDefaultDownloadFolder();
    } catch (error: any) {
      console.error('download:getDefaultFolder error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:chooseFolder', async () => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      const folder = await downloadService.chooseDownloadFolder(window);
      if (folder) {
        downloadService.setDefaultDownloadFolder(folder);
        return folder;
      }
      return null;
    } catch (error: any) {
      console.error('download:chooseFolder error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:chooseSaveLocation', async (_event, defaultFilename: string) => {
    try {
      validateString(defaultFilename, 'Filename', 255);
      const window = BrowserWindow.getFocusedWindow();
      return await downloadService.chooseSaveLocation(window, defaultFilename);
    } catch (error: any) {
      console.error('download:chooseSaveLocation error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('download:openManager', () => {
    try {
      createDownloadManagerWindow();
      return { success: true };
    } catch (error: any) {
      console.error('download:openManager error:', error.message);
      throw error;
    }
  });

  // Save image with "Save As" dialog
  ipcMain.handle('download:saveImage', async (_event, imageUrl: string, suggestedName?: string) => {
    try {
      validateUrl(imageUrl, 'Image URL');
      if (suggestedName) {
        validateString(suggestedName, 'Suggested name', 255);
      }

      const window = BrowserWindow.getFocusedWindow();
      if (!window) {
        throw new Error('No focused window');
      }

      // Extract filename from URL if not provided
      const filename = suggestedName || path.basename(new URL(imageUrl).pathname) || 'image.png';

      // Show save dialog
      const savePath = await downloadService.chooseSaveLocation(window, filename);
      if (!savePath) {
        return { success: false, cancelled: true };
      }

      // Register the custom save path for this URL
      downloadService.setCustomSavePath(imageUrl, savePath);

      // Trigger download - will use the custom path
      window.webContents.downloadURL(imageUrl);

      return { success: true, savePath };
    } catch (error: any) {
      console.error('download:saveImage error:', error.message);
      throw error;
    }
  });

  // User agreement handlers
  ipcMain.handle('agreement:check', async () => {
    try {
      const accepted = databaseService.getSetting('user-agreement-accepted');
      return accepted === 'true';
    } catch (error: any) {
      console.error('agreement:check error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('agreement:accept', async () => {
    try {
      databaseService.setSetting('user-agreement-accepted', 'true');
      return { success: true };
    } catch (error: any) {
      console.error('agreement:accept error:', error.message);
      throw error;
    }
  });

  // App control handlers
  ipcMain.handle('app:quit', async () => {
    try {
      app.quit();
      return { success: true };
    } catch (error: any) {
      console.error('app:quit error:', error.message);
      throw error;
    }
  });

  // Tab window handlers (BrowserWindow-based tabs)
  ipcMain.handle('tabWindow:create', async (_event, tabId: string, url: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      if (url) {
        validateUrl(url, 'URL');
      }
      const tab = tabWindowManager.createTab(tabId, url);
      return {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
      };
    } catch (error: any) {
      console.error('tabWindow:create error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabWindow:close', async (_event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      tabWindowManager.closeTab(tabId);
      return { success: true };
    } catch (error: any) {
      console.error('tabWindow:close error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabWindow:setActive', async (_event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      tabWindowManager.setActiveTab(tabId);
      return { success: true };
    } catch (error: any) {
      console.error('tabWindow:setActive error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabWindow:navigate', async (_event, tabId: string, url: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      validateUrl(url, 'URL');
      tabWindowManager.navigateTab(tabId, url);
      return { success: true };
    } catch (error: any) {
      console.error('tabWindow:navigate error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabWindow:goBack', async (_event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      tabWindowManager.goBack(tabId);
      return { success: true };
    } catch (error: any) {
      console.error('tabWindow:goBack error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabWindow:goForward', async (_event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      tabWindowManager.goForward(tabId);
      return { success: true };
    } catch (error: any) {
      console.error('tabWindow:goForward error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabWindow:reload', async (_event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      tabWindowManager.reload(tabId);
      return { success: true };
    } catch (error: any) {
      console.error('tabWindow:reload error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabWindow:stop', async (_event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      tabWindowManager.stop(tabId);
      return { success: true };
    } catch (error: any) {
      console.error('tabWindow:stop error:', error.message);
      throw error;
    }
  });

  // Update browser content bounds (called when layout changes, e.g., sidebar opens/closes)
  ipcMain.handle(
    'tabWindow:updateBounds',
    async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
      try {
        tabWindowManager.setBrowserBounds(bounds);
        return { success: true };
      } catch (error: any) {
        console.error('tabWindow:updateBounds error:', error.message);
        throw error;
      }
    }
  );

  ipcMain.handle('tabWindow:getInfo', async (_event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      const tab = tabWindowManager.getTabInfo(tabId);
      if (!tab) {
        throw new Error(`Tab not found: ${tabId}`);
      }
      return {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
        isActive: tab.isActive,
      };
    } catch (error: any) {
      console.error('tabWindow:getInfo error:', error.message);
      throw error;
    }
  });

  // DevTools handler
  ipcMain.handle('tabWindow:openDevTools', async (_event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      const webContents = tabWindowManager.getTabWebContents(tabId);
      if (webContents) {
        webContents.openDevTools();
        return { success: true };
      }
      throw new Error(`Tab not found: ${tabId}`);
    } catch (error: any) {
      console.error('tabWindow:openDevTools error:', error.message);
      throw error;
    }
  });

  // Print handler
  ipcMain.handle('tabWindow:print', async (_event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      const webContents = tabWindowManager.getTabWebContents(tabId);
      if (webContents) {
        webContents.print();
        return { success: true };
      }
      throw new Error(`Tab not found: ${tabId}`);
    } catch (error: any) {
      console.error('tabWindow:print error:', error.message);
      throw error;
    }
  });

  // Zoom handlers
  ipcMain.handle('tabWindow:zoomIn', async (event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      const webContents = tabWindowManager.getTabWebContents(tabId);
      if (webContents) {
        const currentZoom = webContents.getZoomLevel();
        const newZoom = currentZoom + 0.5;
        webContents.setZoomLevel(newZoom);

        // Save zoom level per-origin (like Chrome)
        const currentUrl = webContents.getURL();
        try {
          const origin = new URL(currentUrl).origin;
          databaseService.setZoomLevel(origin, newZoom);
        } catch (_err) {
          console.warn('[Zoom] Invalid URL, cannot save zoom preference:', currentUrl);
        }

        // Send zoom level update to renderer
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          mainWindow.webContents.send('tab-zoom-changed', {
            tabId,
            zoomLevel: newZoom,
            zoomFactor: webContents.getZoomFactor(),
          });
        }

        return { success: true, zoomLevel: newZoom };
      }
      throw new Error(`Tab not found: ${tabId}`);
    } catch (error: any) {
      console.error('tabWindow:zoomIn error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabWindow:zoomOut', async (event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      const webContents = tabWindowManager.getTabWebContents(tabId);
      if (webContents) {
        const currentZoom = webContents.getZoomLevel();
        const newZoom = currentZoom - 0.5;
        webContents.setZoomLevel(newZoom);

        // Save zoom level per-origin (like Chrome)
        const currentUrl = webContents.getURL();
        try {
          const origin = new URL(currentUrl).origin;
          databaseService.setZoomLevel(origin, newZoom);
        } catch (_err) {
          console.warn('[Zoom] Invalid URL, cannot save zoom preference:', currentUrl);
        }

        // Send zoom level update to renderer
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          mainWindow.webContents.send('tab-zoom-changed', {
            tabId,
            zoomLevel: newZoom,
            zoomFactor: webContents.getZoomFactor(),
          });
        }

        return { success: true, zoomLevel: newZoom };
      }
      throw new Error(`Tab not found: ${tabId}`);
    } catch (error: any) {
      console.error('tabWindow:zoomOut error:', error.message);
      throw error;
    }
  });

  ipcMain.handle('tabWindow:resetZoom', async (event, tabId: string) => {
    try {
      validateString(tabId, 'Tab ID', 256);
      const webContents = tabWindowManager.getTabWebContents(tabId);
      if (webContents) {
        webContents.setZoomLevel(0);

        // Save zoom level per-origin (like Chrome) - reset to 0 (100%)
        const currentUrl = webContents.getURL();
        try {
          const origin = new URL(currentUrl).origin;
          databaseService.setZoomLevel(origin, 0);
        } catch (_err) {
          console.warn('[Zoom] Invalid URL, cannot save zoom preference:', currentUrl);
        }

        // Send zoom level update to renderer
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          mainWindow.webContents.send('tab-zoom-changed', {
            tabId,
            zoomLevel: 0,
            zoomFactor: 1.0,
          });
        }

        return { success: true, zoomLevel: 0 };
      }
      throw new Error(`Tab not found: ${tabId}`);
    } catch (error: any) {
      console.error('tabWindow:resetZoom error:', error.message);
      throw error;
    }
  });
}

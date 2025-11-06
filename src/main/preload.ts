import { contextBridge, ipcRenderer } from 'electron';

// Whitelist of allowed IPC channels for security
const ALLOWED_INVOKE_CHANNELS = [
  'history:add',
  'history:search',
  'history:get',
  'history:delete',
  'history:clear',
  'bookmark:add',
  'bookmark:get',
  'bookmark:search',
  'bookmark:isBookmarked',
  'bookmark:delete',
  'bookmark:deleteByUrl',
  'bookmark:update',
  'browsing:getContext',
  'page:getContext',
  'tabs:save',
  'tabs:load',
  'tabs:clear',
  'webview:openDevTools',
  'webview:print',
  'webview:viewSource',
  'capture:page',
  'capture:screenshot',
  'capture:forVision',
  'capture:forText',
  'ollama:isRunning',
  'ollama:start',
  'ollama:listModels',
  'ollama:pullModel',
  'ollama:deleteModel',
  'ollama:generate',
  'ollama:chat',
  'ollama:getStatus',
  'tool:search_history',
  'tool:get_bookmarks',
  'tool:analyze_page_content',
  'tool:capture_screenshot',
  'tool:get_page_metadata',
  'tool:web_search',
  'settings:get',
  'settings:set',
  'models:getFolder',
  'models:list',
  'models:pull-progress',
  'models:openFolder',
  'models:selectFolder',
];

const ALLOWED_LISTEN_CHANNELS = [
  'open-view-source',
  'ollama:pullProgress',
  'ollama:generateToken',
  'ollama:chatToken',
  'ollama:toolCalls',
  'ollama:reasoning',
  'ollama:getStatus',
  'ai-ask-about-selection',
  'ai-explain-selection',
  'ai-translate-selection',
  'ai-summarize-selection',
];

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // IPC Communication - with channel whitelisting
  invoke: (channel: string, ...args: any[]) => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`IPC channel '${channel}' is not allowed`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel: string, callback: (...args: any[]) => void) => {
    if (!ALLOWED_LISTEN_CHANNELS.includes(channel)) {
      throw new Error(`IPC channel '${channel}' is not allowed for listening`);
    }
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  once: (channel: string, callback: (...args: any[]) => void) => {
    if (!ALLOWED_LISTEN_CHANNELS.includes(channel)) {
      throw new Error(`IPC channel '${channel}' is not allowed for listening`);
    }
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },

  // Platform information
  platform: process.platform,

  // App version (will be populated later)
  version: '0.1.0',
});

// Type definitions for TypeScript
export interface ElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
  once: (channel: string, callback: (...args: any[]) => void) => void;
  platform: string;
  version: string;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

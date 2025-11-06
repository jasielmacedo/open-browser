console.log('===== MAIN PROCESS STARTING =====');

import { app, BrowserWindow, session, Menu, MenuItem } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { databaseService } from './services/database';
import { ollamaService } from './services/ollama';
import { downloadService } from './services/download';
import { registerIpcHandlers } from './ipc/handlers';

// Polyfill __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('===== IMPORTS COMPLETED =====');
console.log('===== SETUP COMPLETED =====');

let mainWindow: BrowserWindow | null = null;
let downloadManagerWindow: BrowserWindow | null = null;

// Window state persistence
interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

let windowState: WindowState = {
  width: 1200,
  height: 800,
  isMaximized: false,
};

// Load window state from database
const loadWindowState = (): WindowState => {
  try {
    const stateJson = databaseService.getSetting('window-state');
    if (stateJson) {
      return JSON.parse(stateJson);
    }
  } catch (error) {
    console.error('Failed to load window state:', error);
  }
  return windowState;
};

// Save window state to database
const saveWindowState = () => {
  try {
    if (!mainWindow) return;

    const bounds = mainWindow.getBounds();
    windowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized(),
    };

    databaseService.setSetting('window-state', JSON.stringify(windowState));
  } catch (error) {
    console.error('Failed to save window state:', error);
  }
};

const createWindow = () => {
  // Load previous window state
  windowState = loadWindowState();

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Security: Disable node integration to prevent direct Node.js access from renderer
      nodeIntegration: false,
      // Security: Enable context isolation to separate preload and renderer contexts
      contextIsolation: true,
      // Security: Sandbox is disabled for webview functionality
      // Note: This reduces security isolation. Webviews have their own sandboxing
      // and we mitigate this with:
      // - Strict IPC channel whitelisting in preload script
      // - URL validation before loading content
      // - Content Security Policy
      // - Navigation guards in web-contents-created handler
      sandbox: false,
      // Security: Enable web security features (same-origin policy, etc.)
      webSecurity: true,
      // Security: Prevent loading insecure content on HTTPS pages
      allowRunningInsecureContent: false,
      // Enable webview tag for browser functionality
      // Note: webviewTag is deprecated but required for this use case
      // Webviews are configured with contextIsolation and safe webpreferences
      webviewTag: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1d24',
    show: false, // Don't show until ready
    autoHideMenuBar: true, // Hide menu bar
    frame: true, // Keep window frame for title bar controls
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Remove the default menu
  Menu.setApplicationMenu(null);

  // Show window when ready to prevent flicker
  mainWindow.once('ready-to-show', () => {
    // Restore maximized state
    if (windowState.isMaximized) {
      mainWindow?.maximize();
    }
    mainWindow?.show();
  });

  // Save window state on resize/move
  mainWindow.on('resize', () => {
    if (!mainWindow?.isMaximized()) {
      saveWindowState();
    }
  });

  mainWindow.on('move', () => {
    if (!mainWindow?.isMaximized()) {
      saveWindowState();
    }
  });

  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  // Save state before closing
  mainWindow.on('close', () => {
    saveWindowState();
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Create download manager window
export const createDownloadManagerWindow = () => {
  // If window already exists, focus it
  if (downloadManagerWindow && !downloadManagerWindow.isDestroyed()) {
    downloadManagerWindow.focus();
    return;
  }

  // Create the download manager window
  downloadManagerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    parent: mainWindow || undefined,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1d24',
    show: false,
    autoHideMenuBar: true,
    frame: true,
  });

  // Load the download manager page
  if (process.env.VITE_DEV_SERVER_URL) {
    downloadManagerWindow.loadURL(process.env.VITE_DEV_SERVER_URL + '#/downloads');
  } else {
    downloadManagerWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: 'downloads',
    });
  }

  // Remove the default menu
  Menu.setApplicationMenu(null);

  // Show window when ready
  downloadManagerWindow.once('ready-to-show', () => {
    downloadManagerWindow?.show();
  });

  // Clean up reference when closed
  downloadManagerWindow.on('closed', () => {
    downloadManagerWindow = null;
  });
};

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Initialize database
  databaseService.initialize();

  // Set flag to indicate app is running - used for crash detection
  databaseService.setSetting('app-running', 'true');

  // Register IPC handlers
  console.log('Registering IPC handlers...');
  try {
    registerIpcHandlers();
    console.log('IPC handlers registered successfully');
  } catch (error) {
    console.error('Failed to register IPC handlers:', error);
  }

  // Clean up any orphan Ollama processes from previous sessions
  console.log('Cleaning up orphan Ollama processes...');
  try {
    await ollamaService.killOrphanProcesses();
    console.log('Orphan process cleanup complete');
  } catch (error) {
    console.error('Failed to clean up orphan processes:', error);
  }

  // Auto-start Ollama service
  console.log('Starting Ollama service...');
  try {
    await ollamaService.ensureRunning();
    console.log('Ollama service started successfully');
  } catch (error) {
    console.error('Failed to start Ollama service:', error);
    console.error(
      'The application will continue, but LLM features may not work until Ollama is started manually.'
    );
  }

  // Setup download handling with the download service
  session.defaultSession.on('will-download', (_event, item, webContents) => {
    // Check if there's a custom save path for this URL (e.g., from Save Image As)
    const customPath = downloadService.getCustomSavePath(item.getURL());

    let savePath: string;
    if (customPath) {
      // Use the custom path chosen by user
      savePath = customPath;
    } else {
      // Use default download folder with unique filename
      const filename = downloadService.sanitizeFilename(item.getFilename());
      const downloadFolder = downloadService.getDefaultDownloadFolder();
      savePath = downloadService.getUniqueFilename(downloadFolder, filename);
    }

    // Handle the download with the service
    downloadService.handleDownload(item, savePath, webContents);
  });

  createWindow();

  // On macOS, re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Track if cleanup has been performed
let cleanupPerformed = false;

// Perform cleanup
async function performCleanup(): Promise<void> {
  if (cleanupPerformed) {
    console.log('[Main] Cleanup already performed, skipping...');
    return;
  }

  cleanupPerformed = true;
  console.log('[Main] Performing cleanup...');

  try {
    // Stop Ollama service first
    await ollamaService.stop();
    console.log('[Main] Ollama service stopped');
  } catch (error) {
    console.error('[Main] Error stopping Ollama service:', error);
  }

  // Clear tabs on clean exit (not on crash)
  databaseService.clearTabs();
  // Mark app as cleanly closed
  databaseService.setSetting('app-running', 'false');
  databaseService.close();

  console.log('[Main] Cleanup complete');
}

// Cleanup on app quit (primary handler)
app.on('before-quit', async (e) => {
  if (!cleanupPerformed) {
    // Prevent default quit to allow async cleanup
    e.preventDefault();

    console.log('[Main] App quitting (before-quit)...');
    await performCleanup();

    // Now actually quit the app
    app.exit(0);
  }
});

// Backup cleanup handler in case before-quit doesn't fire
app.on('will-quit', async (e) => {
  if (!cleanupPerformed) {
    e.preventDefault();

    console.log('[Main] App quitting (will-quit)...');
    await performCleanup();

    // Now actually quit the app
    app.exit(0);
  }
});

// Security: Configure web contents behavior
app.on('web-contents-created', (event, contents) => {
  // Check if this is a webview
  const isWebview = contents.getType() === 'webview';

  // Security: Control navigation to prevent malicious redirects
  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);

      // Allow HTTP(S) and view-source navigation in webviews
      if (
        isWebview &&
        (parsedUrl.protocol.startsWith('http') || parsedUrl.protocol === 'view-source:')
      ) {
        return; // Allow navigation
      }

      // Block all navigation in main window (only renderer-initiated loads allowed)
      if (!isWebview) {
        event.preventDefault();
        return;
      }

      // Block dangerous protocols in webviews (javascript:, data:, file:, etc.)
      if (!parsedUrl.protocol.startsWith('http') && parsedUrl.protocol !== 'view-source:') {
        console.warn('Blocked navigation to unsafe protocol:', parsedUrl.protocol);
        event.preventDefault();
      }
    } catch {
      // Invalid URL, block it for security
      console.warn('Blocked navigation to invalid URL');
      event.preventDefault();
    }
  });

  // Security: Handle new window requests
  contents.setWindowOpenHandler(({ url: _url }) => {
    // Security: Deny all new window/popup requests to prevent:
    // - Popup spam
    // - Phishing attempts via new windows
    // - Bypassing navigation guards
    // Links that try to open new windows will be handled by the webview's new-window event
    return { action: 'deny' };
  });

  // Enable context menu for webviews
  if (isWebview) {
    contents.on('context-menu', (event, params) => {
      const menu = new Menu();

      // Back
      if (contents.canGoBack()) {
        menu.append(
          new MenuItem({
            label: 'Back',
            click: () => contents.goBack(),
          })
        );
      }

      // Forward
      if (contents.canGoForward()) {
        menu.append(
          new MenuItem({
            label: 'Forward',
            click: () => contents.goForward(),
          })
        );
      }

      // Reload
      menu.append(
        new MenuItem({
          label: 'Reload',
          click: () => contents.reload(),
        })
      );

      // Separator
      if (menu.items.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // Copy/Cut/Paste based on context
      if (params.editFlags.canCut) {
        menu.append(
          new MenuItem({
            label: 'Cut',
            role: 'cut',
          })
        );
      }

      if (params.editFlags.canCopy || params.selectionText) {
        menu.append(
          new MenuItem({
            label: 'Copy',
            role: 'copy',
          })
        );
      }

      if (params.editFlags.canPaste) {
        menu.append(
          new MenuItem({
            label: 'Paste',
            role: 'paste',
          })
        );
      }

      // Separator if we added edit items
      if (params.editFlags.canCut || params.editFlags.canCopy || params.editFlags.canPaste) {
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // Save Image As for images
      if (params.mediaType === 'image' && params.srcURL) {
        menu.append(
          new MenuItem({
            label: 'Save Image As...',
            click: async () => {
              try {
                const imageUrl = params.srcURL;
                const suggestedName = path.basename(new URL(imageUrl).pathname) || 'image.png';
                const savePath = await downloadService.chooseSaveLocation(
                  mainWindow,
                  suggestedName
                );
                if (savePath) {
                  // Register the custom save path for this URL
                  downloadService.setCustomSavePath(imageUrl, savePath);
                  // Trigger download - will use the custom path
                  contents.downloadURL(imageUrl);
                }
              } catch (error) {
                console.error('Failed to save image:', error);
              }
            },
          })
        );

        menu.append(
          new MenuItem({
            label: 'Copy Image',
            click: () => {
              // Copy image to clipboard - this will copy the image URL for now
              // In a full implementation, you'd fetch and copy the actual image data
              contents.copyImageAt(params.x, params.y);
            },
          })
        );

        menu.append(new MenuItem({ type: 'separator' }));
      }

      // AI features for selected text
      if (params.selectionText && params.selectionText.trim().length > 0) {
        menu.append(
          new MenuItem({
            label: 'Ask AI about this',
            click: () => {
              mainWindow?.webContents.send('ai-ask-about-selection', params.selectionText);
            },
          })
        );

        menu.append(
          new MenuItem({
            label: 'Explain this',
            click: () => {
              mainWindow?.webContents.send('ai-explain-selection', params.selectionText);
            },
          })
        );

        menu.append(
          new MenuItem({
            label: 'Translate this',
            click: () => {
              mainWindow?.webContents.send('ai-translate-selection', params.selectionText);
            },
          })
        );

        menu.append(
          new MenuItem({
            label: 'Summarize this',
            click: () => {
              mainWindow?.webContents.send('ai-summarize-selection', params.selectionText);
            },
          })
        );

        menu.append(new MenuItem({ type: 'separator' }));
      }

      // View Page Source
      menu.append(
        new MenuItem({
          label: 'View Page Source',
          click: () => {
            // Send to renderer to open in new tab
            mainWindow?.webContents.send('open-view-source', contents.getURL());
          },
        })
      );

      // Inspect Element
      menu.append(
        new MenuItem({
          label: 'Inspect Element',
          click: () => {
            contents.inspectElement(params.x, params.y);
          },
        })
      );

      menu.popup();
    });
  }
});

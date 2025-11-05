console.log('===== MAIN PROCESS STARTING =====');

import { app, BrowserWindow, session, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { databaseService } from './services/database';
import { registerIpcHandlers } from './ipc/handlers';

// Polyfill __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('===== IMPORTS COMPLETED =====');
console.log('===== SETUP COMPLETED =====');

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
      webviewTag: true
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1d24',
    show: false, // Don't show until ready
    autoHideMenuBar: true, // Hide menu bar
    frame: true // Keep window frame for title bar controls
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
    mainWindow?.show();
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Initialize database
  databaseService.initialize();

  // Register IPC handlers
  console.log('Registering IPC handlers...');
  try {
    registerIpcHandlers();
    console.log('IPC handlers registered successfully');
  } catch (error) {
    console.error('Failed to register IPC handlers:', error);
  }

  // Setup download handling
  session.defaultSession.on('will-download', (event, item, webContents) => {
    // Save to default downloads folder with sanitized filename
    let filename = item.getFilename();

    // Sanitize filename to prevent path traversal attacks
    // Remove path separators and other dangerous characters
    filename = path.basename(filename).replace(/[<>:"|?*\x00-\x1F]/g, '_');

    // Prevent hidden files and ensure filename is not empty
    if (!filename || filename.startsWith('.')) {
      filename = 'download_' + Date.now();
    }

    // Limit filename length to prevent issues
    if (filename.length > 255) {
      const ext = path.extname(filename);
      filename = filename.substring(0, 255 - ext.length) + ext;
    }

    const downloadPath = path.join(app.getPath('downloads'), filename);
    item.setSavePath(downloadPath);

    item.on('updated', (event, state) => {
      if (state === 'interrupted') {
        console.log('Download interrupted:', filename);
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          console.log('Download paused:', filename);
        } else {
          const percent = Math.round((item.getReceivedBytes() / item.getTotalBytes()) * 100);
          console.log(`Download progress for ${filename}: ${percent}%`);
        }
      }
    });

    item.once('done', (event, state) => {
      if (state === 'completed') {
        console.log('Download completed:', downloadPath);
      } else {
        console.log('Download failed:', state);
      }
    });
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

// Cleanup on app quit
app.on('before-quit', () => {
  databaseService.close();
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
      if (isWebview && (parsedUrl.protocol.startsWith('http') || parsedUrl.protocol === 'view-source:')) {
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
    } catch (error) {
      // Invalid URL, block it for security
      console.warn('Blocked navigation to invalid URL');
      event.preventDefault();
    }
  });

  // Security: Handle new window requests
  contents.setWindowOpenHandler(({ url }) => {
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
      const { Menu, MenuItem } = require('electron');
      const menu = new Menu();

      // Back
      if (contents.canGoBack()) {
        menu.append(new MenuItem({
          label: 'Back',
          click: () => contents.goBack()
        }));
      }

      // Forward
      if (contents.canGoForward()) {
        menu.append(new MenuItem({
          label: 'Forward',
          click: () => contents.goForward()
        }));
      }

      // Reload
      menu.append(new MenuItem({
        label: 'Reload',
        click: () => contents.reload()
      }));

      // Separator
      if (menu.items.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // Copy/Cut/Paste based on context
      if (params.editFlags.canCut) {
        menu.append(new MenuItem({
          label: 'Cut',
          role: 'cut'
        }));
      }

      if (params.editFlags.canCopy || params.selectionText) {
        menu.append(new MenuItem({
          label: 'Copy',
          role: 'copy'
        }));
      }

      if (params.editFlags.canPaste) {
        menu.append(new MenuItem({
          label: 'Paste',
          role: 'paste'
        }));
      }

      // Separator if we added edit items
      if (params.editFlags.canCut || params.editFlags.canCopy || params.editFlags.canPaste) {
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // View Page Source
      menu.append(new MenuItem({
        label: 'View Page Source',
        click: () => {
          // Send to renderer to open in new tab
          mainWindow?.webContents.send('open-view-source', contents.getURL());
        }
      }));

      // Inspect Element
      menu.append(new MenuItem({
        label: 'Inspect Element',
        click: () => {
          contents.inspectElement(params.x, params.y);
        }
      }));

      menu.popup();
    });
  }
});


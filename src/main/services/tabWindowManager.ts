import { BrowserWindow, WebContents } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { databaseService } from './database';

// Polyfill __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TabWindow {
  id: string;
  window: BrowserWindow;
  url: string;
  title: string;
  favicon: string;
  isActive: boolean;
}

/**
 * TabWindowManager
 * Manages BrowserWindow instances for each tab - the Chrome pattern
 * Each tab is a separate BrowserWindow that gets shown/hidden based on active state
 */
class TabWindowManager {
  private tabWindows: Map<string, TabWindow> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private activeTabId: string | null = null;

  /**
   * Initialize the manager with the main window reference
   */
  initialize(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    console.log('[TabWindowManager] Initialized with main window');

    // Listen for main window close to cleanup tab windows
    mainWindow.on('close', () => {
      console.log('[TabWindowManager] Main window closing, cleaning up tab windows');
      this.cleanup();
    });

    // Listen for main window resize/move to update tab window positions
    mainWindow.on('resize', () => this.updateAllTabWindowBounds());
    mainWindow.on('move', () => this.updateAllTabWindowBounds());
    mainWindow.on('maximize', () => this.updateAllTabWindowBounds());
    mainWindow.on('unmaximize', () => this.updateAllTabWindowBounds());
  }

  /**
   * Create a new tab window
   */
  createTab(tabId: string, url: string): TabWindow {
    if (!this.mainWindow) {
      throw new Error('TabWindowManager not initialized with main window');
    }

    console.log(`[TabWindowManager] Creating tab window for tab: ${tabId}, URL: ${url}`);

    // Create a new BrowserWindow for this tab
    const tabWindow = new BrowserWindow({
      show: false, // Start hidden
      parent: this.mainWindow,
      modal: false,
      frame: false, // No frame - we'll position it ourselves
      backgroundColor: '#1a1d24',
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true, // Full sandbox for security
        webSecurity: true,
        allowRunningInsecureContent: false,
        // No webviewTag needed - this is a real browser window!
      },
    });

    // Prevent the tab window from being independently closeable
    tabWindow.setClosable(false);
    tabWindow.setMenuBarVisibility(false);

    const tab: TabWindow = {
      id: tabId,
      window: tabWindow,
      url: url || '',
      title: '',
      favicon: '',
      isActive: false,
    };

    this.tabWindows.set(tabId, tab);

    // Setup event listeners BEFORE loading URL to catch all events
    this.setupTabWindowListeners(tab);

    // Position the tab window
    this.updateTabWindowBounds(tabId);

    // Load the URL after everything is set up
    if (url) {
      tabWindow.loadURL(url).catch((err) => {
        console.error(`[TabWindowManager] Failed to load URL in tab ${tabId}:`, err);
      });
    }

    console.log(`[TabWindowManager] Tab window created: ${tabId}`);
    return tab;
  }

  /**
   * Extract origin from URL (protocol + hostname + port) for per-domain zoom
   */
  private getOrigin(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.origin;
    } catch {
      return null;
    }
  }

  /**
   * Restore saved zoom level for a URL's origin
   */
  private restoreZoomLevel(webContents: WebContents, url: string) {
    const origin = this.getOrigin(url);
    if (!origin) return;

    const savedZoom = databaseService.getZoomLevel(origin);
    if (savedZoom !== null) {
      console.log(`[TabWindowManager] Restoring zoom level ${savedZoom} for ${origin}`);
      webContents.setZoomLevel(savedZoom);
    }
  }

  /**
   * Setup event listeners for a tab window
   */
  private setupTabWindowListeners(tab: TabWindow) {
    const { window: tabWindow } = tab;
    const webContents = tabWindow.webContents;

    // Page title updated
    webContents.on('page-title-updated', (event, title) => {
      tab.title = title;
      this.notifyMainWindow('tab-title-updated', {
        tabId: tab.id,
        title,
      });
    });

    // Favicon updated
    webContents.on('page-favicon-updated', (event, favicons) => {
      if (favicons.length > 0) {
        tab.favicon = favicons[0];
        this.notifyMainWindow('tab-favicon-updated', {
          tabId: tab.id,
          favicon: favicons[0],
        });
      }
    });

    // Navigation events
    webContents.on('did-start-loading', () => {
      this.notifyMainWindow('tab-loading-start', {
        tabId: tab.id,
      });
    });

    webContents.on('did-stop-loading', () => {
      this.notifyMainWindow('tab-loading-stop', {
        tabId: tab.id,
        canGoBack: webContents.canGoBack(),
        canGoForward: webContents.canGoForward(),
      });
    });

    webContents.on('did-navigate', (event, url) => {
      tab.url = url;

      // Restore saved zoom level for this origin
      this.restoreZoomLevel(webContents, url);

      this.notifyMainWindow('tab-did-navigate', {
        tabId: tab.id,
        url,
        canGoBack: webContents.canGoBack(),
        canGoForward: webContents.canGoForward(),
      });
    });

    webContents.on('did-navigate-in-page', (event, url) => {
      tab.url = url;

      // In-page navigation (hash changes) keeps same origin, no zoom change needed
      this.notifyMainWindow('tab-did-navigate-in-page', {
        tabId: tab.id,
        url,
      });
    });

    // New window handling (popups, target="_blank")
    webContents.setWindowOpenHandler(({ url }) => {
      // Create a new tab for the new window
      this.notifyMainWindow('tab-request-new', { url });
      return { action: 'deny' }; // Deny the default popup, we'll handle it
    });

    // Handle failed loads
    webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return; // ERR_ABORTED is normal (user cancelled)
      console.error(
        `[TabWindowManager] Tab ${tab.id} failed to load:`,
        errorDescription,
        validatedURL
      );
      this.notifyMainWindow('tab-load-error', {
        tabId: tab.id,
        errorCode,
        errorDescription,
        url: validatedURL,
      });
    });

    // Handle renderer crashes
    webContents.on('render-process-gone', (event, details) => {
      console.error(`[TabWindowManager] Tab ${tab.id} crashed:`, details.reason);
      this.notifyMainWindow('tab-crashed', {
        tabId: tab.id,
        reason: details.reason,
        exitCode: details.exitCode,
      });

      // If killed, try to reload
      if (details.reason === 'killed' || details.reason === 'crashed') {
        console.log(`[TabWindowManager] Attempting to reload crashed tab ${tab.id}`);
        setTimeout(() => {
          if (!tabWindow.isDestroyed()) {
            tabWindow.reload();
          }
        }, 1000);
      }
    });

    // Handle unresponsive renderer
    webContents.on('unresponsive', () => {
      console.warn(`[TabWindowManager] Tab ${tab.id} became unresponsive`);
      this.notifyMainWindow('tab-unresponsive', {
        tabId: tab.id,
      });
    });

    webContents.on('responsive', () => {
      console.log(`[TabWindowManager] Tab ${tab.id} became responsive again`);
      this.notifyMainWindow('tab-responsive', {
        tabId: tab.id,
      });
    });

    // Handle certificate errors
    webContents.on('certificate-error', (event, url, error, certificate, callback) => {
      console.warn(`[TabWindowManager] Certificate error for ${url}: ${error}`);
      // For now, deny all certificate errors (secure by default)
      // TODO: Add UI to let user override
      event.preventDefault();
      callback(false);

      this.notifyMainWindow('tab-certificate-error', {
        tabId: tab.id,
        url,
        error,
      });
    });

    // Handle context menu (right-click)
    webContents.on('context-menu', (event, params) => {
      // Notify renderer to show context menu with params
      this.notifyMainWindow('tab-context-menu', {
        tabId: tab.id,
        params: {
          x: params.x,
          y: params.y,
          linkURL: params.linkURL,
          srcURL: params.srcURL,
          pageURL: params.pageURL,
          frameURL: params.frameURL,
          selectionText: params.selectionText,
          isEditable: params.isEditable,
          mediaType: params.mediaType,
        },
      });
    });
  }

  /**
   * Calculate the bounds for tab windows based on main window
   * Tab windows should fill the content area below the navigation bar
   */
  private getTabWindowBounds(): { x: number; y: number; width: number; height: number } {
    if (!this.mainWindow) {
      return { x: 0, y: 0, width: 800, height: 600 };
    }

    // const mainBounds = this.mainWindow.getBounds();
    const mainPosition = this.mainWindow.getPosition();

    // Get the actual content bounds from the main window
    // This accounts for the window frame and title bar
    const contentBounds = this.mainWindow.getContentBounds();

    // The navigation bar + tab bar + status bar is approximately 120px tall
    // This is measured from the actual UI layout (TabBar ~40px + NavigationBar ~60px + padding ~20px)
    // TODO: Make this dynamic by receiving actual measurements from renderer
    const navBarHeight = 120;

    return {
      x: mainPosition[0],
      y: mainPosition[1] + navBarHeight,
      width: contentBounds.width,
      height: contentBounds.height - navBarHeight,
    };
  }

  /**
   * Update a specific tab window's bounds
   */
  private updateTabWindowBounds(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (!tab) return;

    const bounds = this.getTabWindowBounds();
    tab.window.setBounds(bounds);
  }

  /**
   * Update all tab window bounds (called on main window resize/move)
   */
  private updateAllTabWindowBounds() {
    const bounds = this.getTabWindowBounds();
    this.tabWindows.forEach((tab) => {
      tab.window.setBounds(bounds);
    });
  }

  /**
   * Switch to a different tab (show/hide windows)
   */
  setActiveTab(tabId: string) {
    console.log(`[TabWindowManager] Switching to tab: ${tabId}`);

    // Hide current active tab
    if (this.activeTabId) {
      const currentTab = this.tabWindows.get(this.activeTabId);
      if (currentTab) {
        currentTab.isActive = false;
        currentTab.window.hide();
      }
    }

    // Show new active tab
    const newTab = this.tabWindows.get(tabId);
    if (newTab) {
      newTab.isActive = true;
      this.updateTabWindowBounds(tabId); // Ensure correct position
      newTab.window.show();
      newTab.window.focus();
      this.activeTabId = tabId;

      // Notify main window about active tab change
      this.notifyMainWindow('tab-activated', {
        tabId,
        url: newTab.url,
        title: newTab.title,
        canGoBack: newTab.window.webContents.canGoBack(),
        canGoForward: newTab.window.webContents.canGoForward(),
      });
    }
  }

  /**
   * Close a tab window
   */
  closeTab(tabId: string) {
    console.log(`[TabWindowManager] Closing tab: ${tabId}`);
    const tab = this.tabWindows.get(tabId);
    if (!tab) return;

    // If this was the active tab, we need to activate another one
    const wasActive = tab.isActive;

    // Destroy the window
    tab.window.destroy();
    this.tabWindows.delete(tabId);

    // If this was the active tab, activate another one
    if (wasActive && this.tabWindows.size > 0) {
      const nextTab = Array.from(this.tabWindows.values())[0];
      this.setActiveTab(nextTab.id);
    } else if (this.tabWindows.size === 0) {
      this.activeTabId = null;
    }
  }

  /**
   * Navigate a tab to a URL
   */
  navigateTab(tabId: string, url: string) {
    const tab = this.tabWindows.get(tabId);
    if (!tab) return;

    console.log(`[TabWindowManager] Navigating tab ${tabId} to: ${url}`);
    tab.window.loadURL(url).catch((err) => {
      console.error(`[TabWindowManager] Failed to navigate tab ${tabId}:`, err);
    });
  }

  /**
   * Browser controls for active tab
   */
  goBack(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (tab && tab.window.webContents.canGoBack()) {
      tab.window.webContents.goBack();
    }
  }

  goForward(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (tab && tab.window.webContents.canGoForward()) {
      tab.window.webContents.goForward();
    }
  }

  reload(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (tab) {
      tab.window.webContents.reload();
    }
  }

  stop(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (tab) {
      tab.window.webContents.stop();
    }
  }

  /**
   * Get a tab's webContents for operations like screenshots, etc.
   */
  getTabWebContents(tabId: string): WebContents | null {
    const tab = this.tabWindows.get(tabId);
    return tab ? tab.window.webContents : null;
  }

  /**
   * Get info about a tab
   */
  getTabInfo(tabId: string): TabWindow | null {
    return this.tabWindows.get(tabId) || null;
  }

  /**
   * Get all tabs
   */
  getAllTabs(): TabWindow[] {
    return Array.from(this.tabWindows.values());
  }

  /**
   * Get active tab ID
   */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /**
   * Send notification to main window
   */
  private notifyMainWindow(channel: string, data: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Cleanup all tab windows
   */
  cleanup() {
    console.log('[TabWindowManager] Cleaning up all tab windows');
    this.tabWindows.forEach((tab) => {
      if (!tab.window.isDestroyed()) {
        tab.window.destroy();
      }
    });
    this.tabWindows.clear();
    this.activeTabId = null;
  }
}

export const tabWindowManager = new TabWindowManager();

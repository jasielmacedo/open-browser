import { BrowserWindow, WebContents, WebContentsView } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { databaseService } from './database';

// Polyfill __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TabWindow {
  id: string;
  view: WebContentsView;
  url: string;
  title: string;
  favicon: string;
  isActive: boolean;
}

/**
 * TabWindowManager
 * Manages WebContentsView instances for each tab - the Chrome pattern
 * Each tab is a separate WebContentsView that gets shown/hidden based on active state
 * WebContentsViews are properly embedded within the parent window (not floating)
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
   * Create a new tab view
   */
  createTab(tabId: string, url: string): TabWindow {
    if (!this.mainWindow) {
      throw new Error('TabWindowManager not initialized with main window');
    }

    console.log(`[TabWindowManager] Creating tab view for tab: ${tabId}, URL: ${url}`);

    // Create a new WebContentsView for this tab
    const tabView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true, // Full sandbox for security
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    const tab: TabWindow = {
      id: tabId,
      view: tabView,
      url: url || '',
      title: '',
      favicon: '',
      isActive: false,
    };

    this.tabWindows.set(tabId, tab);

    // Add view to main window
    this.mainWindow.contentView.addChildView(tabView);

    // Setup event listeners BEFORE loading URL to catch all events
    this.setupTabWindowListeners(tab);

    // Position the tab view
    this.updateTabWindowBounds(tabId);

    // Start hidden - setActiveTab will make it visible
    tabView.setVisible(false);

    // Load the URL after everything is set up
    if (url) {
      tabView.webContents.loadURL(url).catch((err) => {
        console.error(`[TabWindowManager] Failed to load URL in tab ${tabId}:`, err);
      });
    }

    console.log(`[TabWindowManager] Tab view created: ${tabId}`);
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
   * Setup event listeners for a tab view
   */
  private setupTabWindowListeners(tab: TabWindow) {
    const webContents = tab.view.webContents;

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
          webContents.reload();
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
   * Calculate the bounds for tab views based on main window
   * WebContentsViews fill the ENTIRE content area - UI overlays on top
   */
  private getTabWindowBounds(): { x: number; y: number; width: number; height: number } {
    if (!this.mainWindow) {
      return { x: 0, y: 0, width: 800, height: 600 };
    }

    // Get the full content bounds
    const [width, height] = this.mainWindow.getSize();

    // WebContentsViews fill the entire content area (0, 0, full width, full height)
    // The UI (navbar, sidebars) will overlay on top using pointer-events CSS
    return {
      x: 0,
      y: 0,
      width,
      height,
    };
  }

  /**
   * Update a specific tab view's bounds
   */
  private updateTabWindowBounds(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (!tab) return;

    const bounds = this.getTabWindowBounds();
    tab.view.setBounds(bounds);
  }

  /**
   * Update all tab view bounds (called on main window resize/move)
   */
  private updateAllTabWindowBounds() {
    const bounds = this.getTabWindowBounds();
    this.tabWindows.forEach((tab) => {
      tab.view.setBounds(bounds);
    });
  }

  /**
   * Switch to a different tab (show/hide views)
   */
  setActiveTab(tabId: string) {
    console.log(`[TabWindowManager] Switching to tab: ${tabId}`);

    // Hide current active tab
    if (this.activeTabId) {
      const currentTab = this.tabWindows.get(this.activeTabId);
      if (currentTab) {
        currentTab.isActive = false;
        currentTab.view.setVisible(false);
      }
    }

    // Show new active tab
    const newTab = this.tabWindows.get(tabId);
    if (newTab) {
      newTab.isActive = true;
      this.updateTabWindowBounds(tabId); // Ensure correct position
      newTab.view.setVisible(true);
      this.activeTabId = tabId;

      // Notify main window about active tab change
      this.notifyMainWindow('tab-activated', {
        tabId,
        url: newTab.url,
        title: newTab.title,
        canGoBack: newTab.view.webContents.canGoBack(),
        canGoForward: newTab.view.webContents.canGoForward(),
      });
    }
  }

  /**
   * Close a tab view
   */
  closeTab(tabId: string) {
    console.log(`[TabWindowManager] Closing tab: ${tabId}`);
    const tab = this.tabWindows.get(tabId);
    if (!tab || !this.mainWindow) return;

    // If this was the active tab, we need to activate another one
    const wasActive = tab.isActive;

    // Remove view from main window
    this.mainWindow.contentView.removeChildView(tab.view);
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
    tab.view.webContents.loadURL(url).catch((err) => {
      console.error(`[TabWindowManager] Failed to navigate tab ${tabId}:`, err);
    });
  }

  /**
   * Browser controls for active tab
   */
  goBack(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (tab && tab.view.webContents.canGoBack()) {
      tab.view.webContents.goBack();
    }
  }

  goForward(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (tab && tab.view.webContents.canGoForward()) {
      tab.view.webContents.goForward();
    }
  }

  reload(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (tab) {
      tab.view.webContents.reload();
    }
  }

  stop(tabId: string) {
    const tab = this.tabWindows.get(tabId);
    if (tab) {
      tab.view.webContents.stop();
    }
  }

  /**
   * Get a tab's webContents for operations like screenshots, etc.
   */
  getTabWebContents(tabId: string): WebContents | null {
    const tab = this.tabWindows.get(tabId);
    return tab ? tab.view.webContents : null;
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
   * Cleanup all tab views
   */
  cleanup() {
    console.log('[TabWindowManager] Cleaning up all tab views');
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.tabWindows.forEach((tab) => {
        this.mainWindow!.contentView.removeChildView(tab.view);
      });
    }
    this.tabWindows.clear();
    this.activeTabId = null;
  }
}

export const tabWindowManager = new TabWindowManager();

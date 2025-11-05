import { create } from 'zustand';
import type { Tab } from '../../shared/types';

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (url?: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  getActiveTab: () => Tab | undefined;
  loadTabs: () => Promise<void>;
  saveTabs: () => Promise<void>;
  suspendInactiveTabs: () => void;
  unsuspendTab: (tabId: string) => void;
}

// Counter to ensure unique tab IDs even when created simultaneously
let tabCounter = 0;

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (url = '') => {
    // Generate a unique ID combining UUID, timestamp, and counter
    const uniqueId = `${crypto.randomUUID()}-${Date.now()}-${++tabCounter}`;

    const newTab: Tab = {
      id: uniqueId,
      url,
      title: url || 'New Tab',
      favicon: '',
      isActive: true,
      position: get().tabs.length,
      isSuspended: false,
      lastActiveTime: Date.now(),
    };

    set((state) => ({
      tabs: state.tabs
        .map((tab) => ({
          ...tab,
          isActive: false,
          lastActiveTime: tab.lastActiveTime || Date.now(),
        }))
        .concat(newTab),
      activeTabId: newTab.id,
    }));

    // Auto-save after adding tab
    get().saveTabs();
  },

  closeTab: (tabId: string) => {
    const state = get();
    const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const newTabs = state.tabs.filter((t) => t.id !== tabId);

    // If closing the last tab, remove it first then create a new empty tab
    if (newTabs.length === 0) {
      set({ tabs: [] }); // Clear tabs array first
      get().addTab(''); // Create new empty tab
      return;
    }

    // If closing active tab, activate adjacent tab
    let newActiveId = state.activeTabId;
    if (tabId === state.activeTabId) {
      // Activate tab to the left, or first tab if closing leftmost
      const adjacentIndex = Math.max(0, tabIndex - 1);
      newActiveId = newTabs[adjacentIndex].id;
      newTabs[adjacentIndex] = { ...newTabs[adjacentIndex], isActive: true };
    }

    // Update positions
    const updatedTabs = newTabs.map((tab, index) => ({
      ...tab,
      position: index,
    }));

    set({ tabs: updatedTabs, activeTabId: newActiveId });

    // Auto-save after closing tab
    get().saveTabs();
  },

  setActiveTab: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => ({
        ...tab,
        isActive: tab.id === tabId,
        isSuspended: tab.id === tabId ? false : tab.isSuspended,
        lastActiveTime: tab.id === tabId ? Date.now() : tab.lastActiveTime,
      })),
      activeTabId: tabId,
    }));

    // Auto-save after switching tabs
    get().saveTabs();
  },

  updateTab: (tabId: string, updates: Partial<Tab>) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab)),
    }));

    // Debounced save (title/url updates happen frequently)
    setTimeout(() => get().saveTabs(), 1000);
  },

  moveTab: (fromIndex: number, toIndex: number) => {
    const tabs = [...get().tabs];
    const [movedTab] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, movedTab);

    set({
      tabs: tabs.map((tab, index) => ({ ...tab, position: index })),
    });

    get().saveTabs();
  },

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId);
  },

  loadTabs: async () => {
    try {
      // Check if the app crashed (only restore tabs on crash)
      const wasCrash = await window.electron.invoke('tabs:wasCrash');

      if (wasCrash) {
        // App crashed - restore previous session
        const savedTabs = await window.electron.invoke('tabs:load');
        if (savedTabs && savedTabs.length > 0) {
          const activeTab = savedTabs.find((t: Tab) => t.isActive);
          set({
            tabs: savedTabs,
            activeTabId: activeTab?.id || savedTabs[0].id,
          });
          return;
        }
      }

      // Normal start (no crash) or no saved tabs - create a new tab
      get().addTab();
    } catch {
      // Silently create default tab if IPC not ready yet
      if (!get().tabs.length) {
        get().addTab();
      }
    }
  },

  saveTabs: async () => {
    try {
      const { tabs } = get();
      await window.electron.invoke('tabs:save', tabs);
    } catch {
      // Silently fail - IPC handlers may not be ready yet
    }
  },

  suspendInactiveTabs: () => {
    const SUSPEND_AFTER_MS = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    set((state) => ({
      tabs: state.tabs.map((tab) => {
        // Don't suspend active tab
        if (tab.isActive) return tab;

        // Check if tab should be suspended
        const inactiveTime = now - (tab.lastActiveTime || now);
        if (inactiveTime > SUSPEND_AFTER_MS && !tab.isSuspended) {
          return { ...tab, isSuspended: true };
        }

        return tab;
      }),
    }));

    // Auto-save after suspension
    get().saveTabs();
  },

  unsuspendTab: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, isSuspended: false, lastActiveTime: Date.now() } : tab
      ),
    }));
  },
}));

import { create } from 'zustand';

interface BrowserState {
  currentUrl: string;
  pageTitle: string;
  favicon: string;
  isLoading: boolean;
  loadProgress: number;
  canGoBack: boolean;
  canGoForward: boolean;
  isChatOpen: boolean;
  isBookmarked: boolean;
  showHistory: boolean;
  showBookmarks: boolean;
  zoomLevel: number;
  setCurrentUrl: (url: string) => void;
  setPageTitle: (title: string) => void;
  setFavicon: (favicon: string) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadProgress: (progress: number) => void;
  setCanGoBack: (canGoBack: boolean) => void;
  setCanGoForward: (canGoForward: boolean) => void;
  toggleChat: () => void;
  setIsChatOpen: (open: boolean) => void;
  setIsBookmarked: (bookmarked: boolean) => void;
  toggleHistory: () => void;
  setShowHistory: (show: boolean) => void;
  toggleBookmarks: () => void;
  setShowBookmarks: (show: boolean) => void;
  setZoomLevel: (zoom: number) => void;
  resetZoom: () => void;
}

export const useBrowserStore = create<BrowserState>((set) => ({
  currentUrl: '',
  pageTitle: '',
  favicon: '',
  isLoading: false,
  loadProgress: 0,
  canGoBack: false,
  canGoForward: false,
  isChatOpen: false,
  isBookmarked: false,
  showHistory: false,
  showBookmarks: false,
  zoomLevel: 100,
  setCurrentUrl: (url) => set({ currentUrl: url }),
  setPageTitle: (title) => set({ pageTitle: title }),
  setFavicon: (favicon) => set({ favicon }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setLoadProgress: (progress) => set({ loadProgress: progress }),
  setCanGoBack: (canGoBack) => set({ canGoBack }),
  setCanGoForward: (canGoForward) => set({ canGoForward }),
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen, showHistory: false, showBookmarks: false })),
  setIsChatOpen: (open) => set({ isChatOpen: open }),
  setIsBookmarked: (bookmarked) => set({ isBookmarked: bookmarked }),
  toggleHistory: () => set((state) => ({ showHistory: !state.showHistory, isChatOpen: false, showBookmarks: false })),
  setShowHistory: (show) => set({ showHistory: show }),
  toggleBookmarks: () => set((state) => ({ showBookmarks: !state.showBookmarks, isChatOpen: false, showHistory: false })),
  setShowBookmarks: (show) => set({ showBookmarks: show }),
  setZoomLevel: (zoom) => set({ zoomLevel: zoom }),
  resetZoom: () => set({ zoomLevel: 100 }),
}));

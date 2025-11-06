/**
 * Smart Context Manager
 * Optimizes what context gets sent to AI to reduce tokens and improve response time
 */

export interface ContextLimits {
  // Text limits (in characters)
  maxPageContentLength: number;
  maxHistoryItems: number;
  maxBookmarkItems: number;

  // Feature flags
  includeHistory: boolean;
  includeBookmarks: boolean;

  // Smart modes
  preferScreenshotForVision: boolean; // If true, vision models get screenshot instead of full text
  summarizeContent: boolean; // If true, use readability excerpt instead of full content
}

export const DEFAULT_LIMITS: ContextLimits = {
  maxPageContentLength: 2000, // ~500 tokens
  maxHistoryItems: 5,
  maxBookmarkItems: 3,
  includeHistory: true,
  includeBookmarks: false, // Off by default to save tokens
  preferScreenshotForVision: true, // Vision models get screenshot, minimal text
  summarizeContent: true,
};

export const MINIMAL_LIMITS: ContextLimits = {
  maxPageContentLength: 500,
  maxHistoryItems: 0,
  maxBookmarkItems: 0,
  includeHistory: false,
  includeBookmarks: false,
  preferScreenshotForVision: true,
  summarizeContent: true,
};

export const FULL_LIMITS: ContextLimits = {
  maxPageContentLength: 5000,
  maxHistoryItems: 10,
  maxBookmarkItems: 10,
  includeHistory: true,
  includeBookmarks: true,
  preferScreenshotForVision: false,
  summarizeContent: false,
};

/**
 * Truncate text to max length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Extract just the most relevant content
 */
export function extractRelevantContent(
  readable: any,
  html: string | undefined,
  limits: ContextLimits
): string {
  // Prefer readability excerpt if available and summarizing
  if (limits.summarizeContent && readable?.excerpt) {
    return truncateText(readable.excerpt, limits.maxPageContentLength);
  }

  // Use readability text content
  if (readable?.textContent) {
    return truncateText(readable.textContent, limits.maxPageContentLength);
  }

  // Fallback to html (strip tags roughly)
  if (html) {
    const textOnly = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return truncateText(textOnly, limits.maxPageContentLength);
  }

  return '';
}

/**
 * Build optimized context for AI
 */
export function buildOptimizedContext(
  pageCapture: any,
  browsingContext: any,
  isVisionModel: boolean,
  limits: ContextLimits = DEFAULT_LIMITS
): {
  page: any;
  browsingHistory?: any[];
  bookmarks?: any[];
  tokenEstimate: number;
} {
  // For vision models with screenshot, minimize text
  const shouldMinimizeText =
    isVisionModel && limits.preferScreenshotForVision && pageCapture.screenshot;

  // Build page context
  const pageContent = shouldMinimizeText
    ? truncateText(pageCapture.title || '', 200) // Just title for vision
    : extractRelevantContent(pageCapture.readable, pageCapture.html, limits);

  const page = {
    url: pageCapture.url,
    title: pageCapture.title,
    content: pageContent,
    selectedText: pageCapture.selectedText
      ? truncateText(pageCapture.selectedText, 500)
      : undefined,
  };

  // Estimate tokens (rough: 1 token ≈ 4 characters)
  let tokenEstimate = Math.ceil(
    ((page.url?.length || 0) +
      (page.title?.length || 0) +
      (page.content?.length || 0) +
      (page.selectedText?.length || 0)) /
      4
  );

  // Add history if enabled
  let history: any[] | undefined;
  if (limits.includeHistory && limits.maxHistoryItems > 0 && browsingContext?.history) {
    history = browsingContext.history.slice(0, limits.maxHistoryItems).map((h: any) => ({
      title: truncateText(h.title, 100),
      url: truncateText(h.url, 200), // Truncate URLs to prevent massive query params
    }));
    tokenEstimate += history.length * 60; // ~60 tokens per history item (more conservative)
  }

  // Add bookmarks if enabled
  let bookmarks: any[] | undefined;
  if (limits.includeBookmarks && limits.maxBookmarkItems > 0 && browsingContext?.bookmarks) {
    bookmarks = browsingContext.bookmarks.slice(0, limits.maxBookmarkItems).map((b: any) => ({
      title: truncateText(b.title, 100),
      url: truncateText(b.url, 200), // Truncate URLs to prevent massive query params
    }));
    tokenEstimate += bookmarks.length * 60; // ~60 tokens per bookmark (more conservative)
  }

  return {
    page,
    browsingHistory: history,
    bookmarks,
    tokenEstimate,
  };
}

/**
 * Get recommended limits based on model and use case
 */
export function getRecommendedLimits(
  isVisionModel: boolean,
  hasScreenshot: boolean,
  useCase: 'quick-answer' | 'deep-analysis' | 'normal' = 'normal'
): ContextLimits {
  // Vision model with screenshot - minimize text drastically to prevent Ollama 500 errors
  // llama3.2-vision can't handle much context with streaming enabled
  if (isVisionModel && hasScreenshot) {
    return {
      ...MINIMAL_LIMITS,
      maxPageContentLength: 100, // Just page title
      maxHistoryItems: 0, // No history - causes 500 errors with streaming
      includeHistory: false,
      includeBookmarks: false,
      preferScreenshotForVision: true,
    };
  }

  // Vision model without screenshot - still minimal to avoid crashes
  if (isVisionModel) {
    return {
      ...MINIMAL_LIMITS,
      maxPageContentLength: 300, // Small excerpt
      maxHistoryItems: 0,
      includeHistory: false,
      includeBookmarks: false,
    };
  }

  // Quick answer - minimal context
  if (useCase === 'quick-answer') {
    return MINIMAL_LIMITS;
  }

  // Deep analysis - more context
  if (useCase === 'deep-analysis') {
    return {
      ...FULL_LIMITS,
      maxPageContentLength: 3000,
    };
  }

  // Normal - balanced
  return DEFAULT_LIMITS;
}

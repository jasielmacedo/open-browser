import { WebContents } from 'electron';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

// Try to load sharp, but make it optional
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharp: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sharp = require('sharp');
} catch (_error) {
  console.warn('Sharp module not available. Screenshots will use PNG format without optimization.');
}

export interface CaptureOptions {
  /**
   * Maximum width for the captured image
   */
  maxWidth?: number;
  /**
   * Maximum height for the captured image
   */
  maxHeight?: number;
  /**
   * JPEG quality (0-100)
   */
  quality?: number;
  /**
   * Whether to extract readable content using Mozilla Readability
   */
  extractReadable?: boolean;
  /**
   * Whether to capture a screenshot
   */
  includeScreenshot?: boolean;
}

export interface PageCapture {
  /**
   * Screenshot as base64-encoded JPEG (if includeScreenshot is true)
   */
  screenshot?: string;
  /**
   * Page URL
   */
  url: string;
  /**
   * Page title
   */
  title: string;
  /**
   * Selected text (if any)
   */
  selectedText?: string;
  /**
   * Full page HTML (if extractReadable is false)
   */
  html?: string;
  /**
   * Readable content extracted by Mozilla Readability (if extractReadable is true)
   */
  readable?: {
    title: string;
    byline: string | null;
    content: string;
    textContent: string;
    excerpt: string;
  };
}

export class CaptureService {
  /**
   * Capture page screenshot and optimize it for AI vision models
   */
  private async captureScreenshot(
    webContents: WebContents,
    options: CaptureOptions = {}
  ): Promise<string | null> {
    try {
      const { maxWidth = 1280, maxHeight = 720, quality = 80 } = options;

      // Capture the page as a NativeImage
      const image = await webContents.capturePage();

      // If sharp is available, optimize the image
      if (sharp) {
        try {
          const buffer = image.toPNG();
          const optimized = await sharp(buffer)
            .resize(maxWidth, maxHeight, {
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({
              quality,
              mozjpeg: true, // Better compression
            })
            .toBuffer();

          return optimized.toString('base64');
        } catch (sharpError) {
          console.warn('Sharp optimization failed, using PNG fallback:', sharpError);
        }
      }

      // Fallback: use JPEG from Electron (no resize)
      const jpegBuffer = image.toJPEG(quality);
      return jpegBuffer.toString('base64');
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      return null;
    }
  }

  /**
   * Extract readable content from HTML using Mozilla Readability
   */
  private extractReadableContent(html: string, url: string): PageCapture['readable'] | null {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        return null;
      }

      return {
        title: article.title,
        byline: article.byline,
        content: article.content,
        textContent: article.textContent,
        excerpt: article.excerpt,
      };
    } catch (error) {
      console.error('Failed to extract readable content:', error);
      return null;
    }
  }

  /**
   * Get selected text from the page
   */
  private async getSelectedText(webContents: WebContents): Promise<string | undefined> {
    try {
      const result = await webContents.executeJavaScript('window.getSelection().toString()');
      return result || undefined;
    } catch (error) {
      console.error('Failed to get selected text:', error);
      return undefined;
    }
  }

  /**
   * Get page HTML content
   */
  private async getPageHTML(webContents: WebContents): Promise<string> {
    try {
      return await webContents.executeJavaScript('document.documentElement.outerHTML');
    } catch (error) {
      console.error('Failed to get page HTML:', error);
      return '';
    }
  }

  /**
   * Capture comprehensive page context including screenshot, text, and metadata
   */
  async capturePage(webContents: WebContents, options: CaptureOptions = {}): Promise<PageCapture> {
    const { extractReadable = true, includeScreenshot = true } = options;

    // Get basic page info
    const url = webContents.getURL();
    const title = webContents.getTitle();

    // Capture screenshot if requested
    let screenshot: string | undefined;
    if (includeScreenshot) {
      const screenshotData = await this.captureScreenshot(webContents, options);
      screenshot = screenshotData || undefined;
    }

    // Get selected text
    const selectedText = await this.getSelectedText(webContents);

    // Get page HTML
    const html = await this.getPageHTML(webContents);

    // Extract readable content if requested
    let readable: PageCapture['readable'] | undefined;
    if (extractReadable && html) {
      readable = this.extractReadableContent(html, url) || undefined;
    }

    return {
      screenshot,
      url,
      title,
      selectedText,
      html: extractReadable ? undefined : html,
      readable,
    };
  }

  /**
   * Capture page with optimized settings for vision models
   * Includes screenshot and readable text content
   */
  async captureForVision(webContents: WebContents): Promise<PageCapture> {
    return this.capturePage(webContents, {
      includeScreenshot: true,
      extractReadable: true,
      maxWidth: 1280,
      maxHeight: 720,
      quality: 80,
    });
  }

  /**
   * Capture page with text-only content (no screenshot)
   * Useful for text-only models
   */
  async captureForText(webContents: WebContents): Promise<PageCapture> {
    return this.capturePage(webContents, {
      includeScreenshot: false,
      extractReadable: true,
    });
  }

  /**
   * Quick capture of just the screenshot
   */
  async captureScreenshotOnly(
    webContents: WebContents,
    options: CaptureOptions = {}
  ): Promise<string | null> {
    return this.captureScreenshot(webContents, options);
  }
}

// Export singleton instance
export const captureService = new CaptureService();

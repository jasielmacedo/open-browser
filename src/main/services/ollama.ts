import axios, { AxiosInstance } from 'axios';
import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
  digest?: string;
  error?: string;
}

export interface PageContext {
  url?: string;
  title?: string;
  content?: string;
  selectedText?: string;
  screenshot?: string;
}

export interface AIContext {
  page?: PageContext;
  browsingHistory?: any[];
  bookmarks?: any[];
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  images?: string[];
  stream?: boolean;
  system?: string;
  context?: AIContext;
}

export interface GenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  context?: AIContext;
}

export class OllamaService {
  private baseURL: string;
  private client: AxiosInstance;
  private process: ChildProcess | null = null;
  private isServerRunning = false;
  private activePulls: Map<string, boolean> = new Map();

  constructor(baseURL = 'http://localhost:11434') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 120000, // 2 minutes for model operations
    });
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND'];
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

    // Check error code
    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }

    // Check HTTP status code
    if (error.response?.status && retryableStatusCodes.includes(error.response.status)) {
      return true;
    }

    // Check if error message indicates network issue
    const errorMessage = error.message?.toLowerCase() || '';
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('socket') ||
      errorMessage.includes('aborted')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Build context-aware system prompt
   */
  private buildContextualSystemPrompt(baseSystem: string | undefined, context?: AIContext): string {
    if (!context) {
      return baseSystem || '';
    }

    const contextParts: string[] = [];

    if (baseSystem) {
      contextParts.push(baseSystem);
    }

    // Add page context
    if (context.page) {
      const { url, title, content, selectedText } = context.page;

      contextParts.push('\n## Current Page Context');

      if (url) {
        contextParts.push(`URL: ${url}`);
      }

      if (title) {
        contextParts.push(`Page Title: ${title}`);
      }

      if (selectedText) {
        contextParts.push(`\nSelected Text:\n${selectedText}`);
      }

      if (content) {
        // Limit content to first 5000 characters to avoid token limits
        const truncatedContent = content.length > 5000 ? content.substring(0, 5000) + '...' : content;
        contextParts.push(`\nPage Content:\n${truncatedContent}`);
      }
    }

    // Add browsing history context
    if (context.browsingHistory && context.browsingHistory.length > 0) {
      contextParts.push('\n## Recent Browsing History');
      const historyItems = context.browsingHistory.slice(0, 10).map(
        (h: any) => `- ${h.title || 'Untitled'} (${h.url})`
      );
      contextParts.push(historyItems.join('\n'));
    }

    // Add bookmarks context
    if (context.bookmarks && context.bookmarks.length > 0) {
      contextParts.push('\n## Bookmarks');
      const bookmarkItems = context.bookmarks.slice(0, 10).map(
        (b: any) => `- ${b.title || 'Untitled'} (${b.url})`
      );
      contextParts.push(bookmarkItems.join('\n'));
    }

    return contextParts.join('\n');
  }

  /**
   * Get the path to the bundled Ollama executable
   */
  private getBundledOllamaPath(): string | null {
    const isPackaged = app.isPackaged;
    const platform = process.platform;

    let ollamaPath: string;

    if (isPackaged) {
      // In production, use resources/bin from app resources
      const resourcesPath = process.resourcesPath;
      if (platform === 'win32') {
        ollamaPath = path.join(resourcesPath, 'bin', 'win32', 'ollama.exe');
      } else if (platform === 'darwin') {
        ollamaPath = path.join(
          resourcesPath,
          'bin',
          'darwin',
          'Ollama.app',
          'Contents',
          'Resources',
          'ollama'
        );
      } else {
        console.error('Unsupported platform:', platform);
        return null;
      }
    } else {
      // In development, use resources/bin from project root
      const appPath = app.getAppPath();
      if (platform === 'win32') {
        ollamaPath = path.join(appPath, 'resources', 'bin', 'win32', 'ollama.exe');
      } else if (platform === 'darwin') {
        ollamaPath = path.join(
          appPath,
          'resources',
          'bin',
          'darwin',
          'Ollama.app',
          'Contents',
          'Resources',
          'ollama'
        );
      } else {
        console.error('Unsupported platform:', platform);
        return null;
      }
    }

    // Check if the file exists
    if (fs.existsSync(ollamaPath)) {
      console.log('Found bundled Ollama at:', ollamaPath);
      return ollamaPath;
    } else {
      console.error('Bundled Ollama not found at:', ollamaPath);
      return null;
    }
  }

  /**
   * Check if Ollama server is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/version', { timeout: 3000 });
      this.isServerRunning = response.status === 200;
      return this.isServerRunning;
    } catch (_error) {
      this.isServerRunning = false;
      return false;
    }
  }

  /**
   * Start Ollama server process
   */
  async start(): Promise<void> {
    if (await this.isRunning()) {
      console.log('Ollama server is already running');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Get bundled Ollama path
        const ollamaPath = this.getBundledOllamaPath();
        if (!ollamaPath) {
          reject(new Error('Bundled Ollama executable not found. Please check the installation.'));
          return;
        }

        console.log('Starting Ollama from:', ollamaPath);

        // Set environment variables for Windows to use the bundled libs
        const env = { ...process.env };
        if (process.platform === 'win32') {
          const libPath = path.join(path.dirname(ollamaPath), 'lib', 'ollama');
          env.PATH = `${libPath};${env.PATH}`;
        }

        // Spawn ollama serve process with bundled executable
        this.process = spawn(ollamaPath, ['serve'], {
          stdio: 'pipe',
          detached: false,
          env,
        });

        this.process.on('error', (error) => {
          console.error('Failed to start Ollama:', error);
          reject(new Error('Failed to start Ollama. Please check the installation.'));
        });

        // Wait for server to be ready
        const checkInterval = setInterval(async () => {
          if (await this.isRunning()) {
            clearInterval(checkInterval);
            console.log('Ollama server started successfully');
            resolve();
          }
        }, 500);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Ollama server failed to start within timeout'));
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Ensure Ollama is running, start it if not
   */
  async ensureRunning(): Promise<void> {
    if (!(await this.isRunning())) {
      await this.start();
    }
  }

  /**
   * Stop Ollama server process
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isServerRunning = false;
    }
  }

  /**
   * List all installed models
   */
  async listModels(): Promise<OllamaModel[]> {
    await this.ensureRunning();

    try {
      const response = await this.client.get<{ models: OllamaModel[] }>('/api/tags');
      return response.data.models || [];
    } catch (error) {
      console.error('Failed to list models:', error);
      throw new Error('Failed to list Ollama models');
    }
  }

  /**
   * Pull/download a model from Ollama library with retry logic
   * Returns an async generator for progress updates
   */
  async *pullModel(modelName: string, maxRetries = 3): AsyncGenerator<PullProgress> {
    await this.ensureRunning();

    // Track active pull to prevent duplicates
    if (this.activePulls.get(modelName)) {
      throw new Error(`Model ${modelName} is already being downloaded`);
    }

    this.activePulls.set(modelName, true);

    try {
      let attempt = 0;
      let lastError: any = null;

      while (attempt <= maxRetries) {
        try {
          // Yield retry status if this is a retry
          if (attempt > 0) {
            yield {
              status: 'retrying',
              error: `Retrying download (attempt ${attempt + 1}/${maxRetries + 1})...`,
            };
            // Exponential backoff: 2s, 4s, 8s
            const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 8000);
            await this.sleep(backoffMs);
          }

          const response = await this.client.post(
            '/api/pull',
            { name: modelName },
            {
              responseType: 'stream',
              timeout: 0, // No timeout for downloads
              // Add socket timeout to detect stalled connections
              httpAgent: new (require('http').Agent)({
                keepAlive: true,
                timeout: 60000, // 60 second socket timeout
              }),
              httpsAgent: new (require('https').Agent)({
                keepAlive: true,
                timeout: 60000, // 60 second socket timeout
              }),
            }
          );

          const stream = response.data;
          let buffer = '';
          let lastProgressTime = Date.now();
          const heartbeatTimeout = 120000; // 2 minutes without progress = stalled

          // Set up heartbeat check
          const heartbeatInterval = setInterval(() => {
            const timeSinceProgress = Date.now() - lastProgressTime;
            if (timeSinceProgress > heartbeatTimeout) {
              console.warn('Download stalled, no progress for', heartbeatTimeout / 1000, 'seconds');
              stream.destroy(new Error('Download stalled - no progress'));
            }
          }, 10000); // Check every 10 seconds

          try {
            for await (const chunk of stream) {
              lastProgressTime = Date.now(); // Update heartbeat
              buffer += chunk.toString();
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const progress: PullProgress = JSON.parse(line);
                    yield progress;

                    // Check if pull is complete
                    if (progress.status === 'success' || progress.status === 'complete') {
                      clearInterval(heartbeatInterval);
                      this.activePulls.delete(modelName);
                      return;
                    }

                    // Check for error status
                    if (progress.status === 'error') {
                      clearInterval(heartbeatInterval);
                      throw new Error(progress.error || 'Unknown error during download');
                    }
                  } catch (parseError) {
                    console.warn('Failed to parse progress line:', line);
                  }
                }
              }
            }

            clearInterval(heartbeatInterval);

            // If we reach here, stream ended without success status
            console.warn('Stream ended without completion status');
            throw new Error('Download stream ended unexpectedly');
          } catch (streamError) {
            clearInterval(heartbeatInterval);
            throw streamError;
          }
        } catch (error: any) {
          lastError = error;
          const errorCode = error.code || 'UNKNOWN';
          const errorMessage = error.message || 'Unknown error';

          console.error(
            `Pull model attempt ${attempt + 1} failed:`,
            errorCode,
            errorMessage
          );

          // If not retryable or max retries reached, throw
          if (!this.isRetryableError(error) || attempt >= maxRetries) {
            throw error;
          }

          // Yield error status before retrying
          yield {
            status: 'error',
            error: `Network error (${errorCode}). Will retry...`,
          };

          attempt++;
        }
      }

      // If we exhausted all retries
      throw lastError || new Error('Failed to pull model after maximum retries');
    } catch (error: any) {
      this.activePulls.delete(modelName);

      const errorCode = error.code || 'UNKNOWN';
      const errorMessage = error.message || 'Unknown error';

      console.error('Failed to pull model:', errorCode, errorMessage, error);

      // Provide user-friendly error messages
      let friendlyMessage = `Failed to download model ${modelName}`;

      if (errorCode === 'ECONNRESET') {
        friendlyMessage += ': Connection was reset. Please check your internet connection.';
      } else if (errorCode === 'ETIMEDOUT') {
        friendlyMessage += ': Connection timed out. Please check your internet connection.';
      } else if (errorCode === 'ECONNREFUSED') {
        friendlyMessage += ': Cannot connect to Ollama server.';
      } else if (errorMessage.includes('stalled')) {
        friendlyMessage += ': Download stalled. Please try again.';
      } else {
        friendlyMessage += `: ${errorMessage}`;
      }

      throw new Error(friendlyMessage);
    } finally {
      this.activePulls.delete(modelName);
    }
  }

  /**
   * Cancel an active model download
   */
  cancelPull(modelName: string): void {
    this.activePulls.delete(modelName);
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName: string): Promise<void> {
    await this.ensureRunning();

    try {
      await this.client.delete('/api/delete', {
        data: { name: modelName },
      });
    } catch (error) {
      console.error('Failed to delete model:', error);
      throw new Error(`Failed to delete model ${modelName}`);
    }
  }

  /**
   * Generate text with optional vision input and context awareness
   * Returns an async generator for streaming responses
   */
  async *generate(request: GenerateRequest): AsyncGenerator<string> {
    await this.ensureRunning();

    try {
      // Build contextual system prompt
      const contextualSystem = this.buildContextualSystemPrompt(request.system, request.context);

      // Build the request with context
      const ollamaRequest = {
        model: request.model,
        prompt: request.prompt,
        images: request.images,
        stream: request.stream,
        system: contextualSystem || undefined,
      };

      const response = await this.client.post('/api/generate', ollamaRequest, {
        responseType: 'stream',
        timeout: 0, // No timeout for generation
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data: GenerateResponse = JSON.parse(line);

              if (data.response) {
                yield data.response;
              }

              if (data.done) {
                return;
              }
            } catch (_e) {
              console.warn('Failed to parse response line:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to generate:', error);
      throw new Error('Failed to generate response from Ollama');
    }
  }

  /**
   * Chat completion with conversation history and context awareness
   * Returns an async generator for streaming responses
   */
  async *chat(request: ChatRequest): AsyncGenerator<string> {
    await this.ensureRunning();

    try {
      let messages = [...request.messages];

      // If context is provided, prepend it as a system message or enhance existing system message
      if (request.context) {
        const contextualSystem = this.buildContextualSystemPrompt('', request.context);

        if (contextualSystem) {
          // Check if there's already a system message
          const systemMessageIndex = messages.findIndex((m) => m.role === 'system');

          if (systemMessageIndex >= 0) {
            // Enhance existing system message
            messages[systemMessageIndex] = {
              ...messages[systemMessageIndex],
              content: messages[systemMessageIndex].content + '\n\n' + contextualSystem,
            };
          } else {
            // Add new system message at the beginning
            messages = [
              {
                role: 'system',
                content: contextualSystem,
              },
              ...messages,
            ];
          }
        }
      }

      // Build the request with enhanced messages
      const ollamaRequest = {
        model: request.model,
        messages: messages,
        stream: request.stream,
      };

      const response = await this.client.post('/api/chat', ollamaRequest, {
        responseType: 'stream',
        timeout: 0,
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);

              if (data.message?.content) {
                yield data.message.content;
              }

              if (data.done) {
                return;
              }
            } catch (_e) {
              console.warn('Failed to parse chat response line:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to chat:', error);
      throw new Error('Failed to chat with Ollama');
    }
  }
}

// Export singleton instance
export const ollamaService = new OllamaService();

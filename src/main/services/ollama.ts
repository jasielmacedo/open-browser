import axios, { AxiosInstance } from 'axios';
import { spawn, ChildProcess, exec } from 'child_process';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';

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
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  context?: AIContext;
  tools?: any[]; // Tool definitions in Ollama format
  planningMode?: boolean; // Enable tool calling behavior
}

export class OllamaService {
  private baseURL: string;
  private client: AxiosInstance;
  private process: ChildProcess | null = null;
  private isServerRunning = false;
  private activePulls: Map<string, boolean> = new Map();
  private activeRequest: http.ClientRequest | null = null;

  constructor(baseURL = 'http://localhost:11434') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 120000, // 2 minutes for model operations
      decompress: false, // Disable automatic decompression to match curl behavior
      headers: {
        'Accept-Encoding': 'identity', // Disable compression to match curl
      },
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
        const truncatedContent =
          content.length > 5000 ? content.substring(0, 5000) + '...' : content;
        contextParts.push(`\nPage Content:\n${truncatedContent}`);
      }
    }

    // Add browsing history context
    if (context.browsingHistory && context.browsingHistory.length > 0) {
      contextParts.push('\n## Recent Browsing History');
      const historyItems = context.browsingHistory
        .slice(0, 10)
        .map((h: any) => `- ${h.title || 'Untitled'} (${h.url})`);
      contextParts.push(historyItems.join('\n'));
    }

    // Add bookmarks context
    if (context.bookmarks && context.bookmarks.length > 0) {
      contextParts.push('\n## Bookmarks');
      const bookmarkItems = context.bookmarks
        .slice(0, 10)
        .map((b: any) => `- ${b.title || 'Untitled'} (${b.url})`);
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

        // Enable GPU acceleration if available
        // Ollama will automatically detect and use CUDA (NVIDIA) or ROCm (AMD) if installed
        // These environment variables ensure optimal GPU usage
        env.OLLAMA_NUM_PARALLEL = '1'; // Number of parallel requests (1 for better single-request performance)
        env.OLLAMA_MAX_LOADED_MODELS = '1'; // Keep only 1 model in memory for better performance

        // For NVIDIA GPUs, ensure all layers are offloaded to GPU
        // Set to 0 to let Ollama auto-detect optimal layer count, or set a high number like 999
        if (!env.OLLAMA_NUM_GPU) {
          env.OLLAMA_NUM_GPU = '999'; // Offload all layers to GPU if available
        }

        console.log('Ollama environment:', {
          numGpu: env.OLLAMA_NUM_GPU,
          numParallel: env.OLLAMA_NUM_PARALLEL,
          maxLoaded: env.OLLAMA_MAX_LOADED_MODELS,
        });

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
        let isChecking = false;
        const checkInterval = setInterval(async () => {
          // Skip if a check is already in progress
          if (isChecking) {
            return;
          }

          isChecking = true;
          try {
            if (await this.isRunning()) {
              clearInterval(checkInterval);
              console.log('Ollama server started successfully');
              resolve();
            }
          } finally {
            isChecking = false;
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
   * Kill any orphan Ollama processes left from previous sessions
   */
  async killOrphanProcesses(): Promise<void> {
    console.log('[Ollama] Checking for orphan Ollama processes...');

    if (process.platform === 'win32') {
      // On Windows, find and kill all ollama.exe processes
      return new Promise<void>((resolve) => {
        exec('tasklist /FI "IMAGENAME eq ollama.exe" /FO CSV /NH', (error, stdout) => {
          if (error || !stdout || stdout.includes('INFO: No tasks are running')) {
            console.log('[Ollama] No orphan processes found');
            resolve();
            return;
          }

          // Parse the output to get PIDs
          const lines = stdout.trim().split('\n');
          const pids: number[] = [];

          for (const line of lines) {
            const match = line.match(/"ollama\.exe","(\d+)"/);
            if (match && match[1]) {
              pids.push(parseInt(match[1], 10));
            }
          }

          if (pids.length === 0) {
            console.log('[Ollama] No orphan processes found');
            resolve();
            return;
          }

          console.log(`[Ollama] Found ${pids.length} orphan Ollama process(es), terminating...`);

          // Kill all found processes
          const killPromises = pids.map((pid) => {
            return new Promise<void>((resolveKill) => {
              exec(`taskkill /F /PID ${pid} /T`, (killError) => {
                if (killError) {
                  console.error(`[Ollama] Failed to kill process ${pid}:`, killError);
                } else {
                  console.log(`[Ollama] Killed orphan process ${pid}`);
                }
                resolveKill();
              });
            });
          });

          Promise.all(killPromises).then(() => {
            console.log('[Ollama] All orphan processes terminated');
            resolve();
          });
        });
      });
    } else if (process.platform === 'darwin') {
      // On macOS, find and kill Ollama processes
      return new Promise<void>((resolve) => {
        exec('pgrep -f "ollama"', (error, stdout) => {
          if (error || !stdout.trim()) {
            console.log('[Ollama] No orphan processes found');
            resolve();
            return;
          }

          const pids = stdout
            .trim()
            .split('\n')
            .map((pid) => parseInt(pid, 10))
            .filter((pid) => !isNaN(pid));

          if (pids.length === 0) {
            console.log('[Ollama] No orphan processes found');
            resolve();
            return;
          }

          console.log(`[Ollama] Found ${pids.length} orphan Ollama process(es), terminating...`);

          // Kill all found processes
          const killPromises = pids.map((pid) => {
            return new Promise<void>((resolveKill) => {
              exec(`kill -9 ${pid}`, (killError) => {
                if (killError) {
                  console.error(`[Ollama] Failed to kill process ${pid}:`, killError);
                } else {
                  console.log(`[Ollama] Killed orphan process ${pid}`);
                }
                resolveKill();
              });
            });
          });

          Promise.all(killPromises).then(() => {
            console.log('[Ollama] All orphan processes terminated');
            resolve();
          });
        });
      });
    } else {
      console.log('[Ollama] Orphan process cleanup not implemented for this platform');
      return Promise.resolve();
    }
  }

  /**
   * Stop Ollama server process with force
   */
  async stop(): Promise<void> {
    if (!this.process) {
      console.log('[Ollama] No process to stop');
      return;
    }

    const pid = this.process.pid;
    console.log(`[Ollama] Stopping Ollama process (PID: ${pid})`);

    return new Promise<void>((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        console.warn('[Ollama] Process did not exit gracefully, forcing termination');

        // Force kill the process using platform-specific commands
        if (process.platform === 'win32' && pid) {
          // Use taskkill on Windows with /F flag for forceful termination
          exec(`taskkill /F /PID ${pid} /T`, (error) => {
            if (error) {
              console.error('[Ollama] Failed to force kill process:', error);
            }
            this.process = null;
            this.isServerRunning = false;
            resolve();
          });
        } else if (pid) {
          // Use SIGKILL on Unix-like systems
          try {
            process.kill(pid, 'SIGKILL');
          } catch (err) {
            console.error('[Ollama] Failed to send SIGKILL:', err);
          }
          this.process = null;
          this.isServerRunning = false;
          resolve();
        }
      }, 3000); // Wait 3 seconds for graceful shutdown

      this.process.once('exit', (code, signal) => {
        clearTimeout(timeout);
        console.log(`[Ollama] Process exited with code ${code} and signal ${signal}`);
        this.process = null;
        this.isServerRunning = false;
        resolve();
      });

      // Try graceful shutdown first
      try {
        if (process.platform === 'win32') {
          // On Windows, send SIGTERM (which is translated to a termination request)
          this.process.kill('SIGTERM');
        } else {
          // On Unix, send SIGTERM for graceful shutdown
          this.process.kill('SIGTERM');
        }
      } catch (err) {
        console.error('[Ollama] Failed to send termination signal:', err);
        clearTimeout(timeout);
        this.process = null;
        this.isServerRunning = false;
        resolve();
      }
    });
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
              httpAgent: new http.Agent({
                keepAlive: true,
                timeout: 60000, // 60 second socket timeout
              }),
              httpsAgent: new https.Agent({
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
                  } catch (_parseError) {
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

          console.error(`Pull model attempt ${attempt + 1} failed:`, errorCode, errorMessage);

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
   * Cancel the active chat request
   */
  cancelChat(): void {
    if (this.activeRequest) {
      console.log('[Ollama] Canceling active chat request');
      this.activeRequest.destroy();
      this.activeRequest = null;
    }
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
  async *chat(
    request: ChatRequest
  ): AsyncGenerator<string | { type: 'tool_calls'; tool_calls: any[] }> {
    await this.ensureRunning();

    try {
      let messages = [...request.messages];

      // If context is provided, prepend it to the first user message instead of using system role
      // This avoids Ollama 500 errors with llama3.2-vision when using system messages with streaming
      if (request.context) {
        const contextualSystem = this.buildContextualSystemPrompt('', request.context);

        if (contextualSystem) {
          // Find the first user message and prepend context
          const firstUserIndex = messages.findIndex((m) => m.role === 'user');
          if (firstUserIndex >= 0) {
            messages[firstUserIndex] = {
              ...messages[firstUserIndex],
              content: contextualSystem + '\n\n' + messages[firstUserIndex].content,
            };
          }
        }
      }

      // Build the request with enhanced messages
      const ollamaRequest: any = {
        model: request.model,
        messages: messages,
        stream: request.stream,
      };

      // Add tools if planning mode is enabled
      if (request.planningMode && request.tools && request.tools.length > 0) {
        ollamaRequest.tools = request.tools;
      }

      console.log('[Ollama] Sending chat request:', JSON.stringify(ollamaRequest, null, 2));

      // Check if any message has images to determine timeout
      const hasImages = messages.some((m: any) => m.images && m.images.length > 0);
      // Vision models with images can take 5+ minutes to process
      const requestTimeout = hasImages ? 300000 : 60000; // 5 minutes for images, 60 seconds for text

      console.log(`[Ollama] Using timeout: ${requestTimeout}ms (hasImages: ${hasImages})`);

      // Use native Node.js http instead of axios for streaming to match curl behavior
      const stream = await new Promise<any>((resolve, reject) => {
        const data = JSON.stringify(ollamaRequest);
        const options = {
          hostname: 'localhost',
          port: 11434,
          path: '/api/chat',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            Connection: 'keep-alive', // Keep connection alive for streaming
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
          },
          timeout: requestTimeout,
        };

        const req = http.request(options, (res) => {
          console.log('[Ollama] Got response:', res.statusCode, res.statusMessage);

          // Handle non-200 responses
          if (res.statusCode !== 200) {
            let errorBody = '';
            res.on('data', (chunk) => (errorBody += chunk));
            res.on('end', () => {
              this.activeRequest = null;
              reject(new Error(`HTTP ${res.statusCode}: ${errorBody}`));
            });
            return;
          }

          resolve(res);
        });

        req.on('error', (error) => {
          console.error('[Ollama] Request error:', error);
          this.activeRequest = null;
          reject(error);
        });

        req.on('timeout', () => {
          console.error('[Ollama] Request timeout');
          req.destroy();
          this.activeRequest = null;
          reject(new Error('Request timeout'));
        });

        // Store the request so it can be canceled
        this.activeRequest = req;

        req.write(data);
        req.end();
      });

      // Determine parsing strategy based on model
      const modelName = request.model.toLowerCase();
      const useAggressiveParsing = modelName.includes('qwen');

      let buffer = '';
      let chunkCount = 0;
      let tokenCount = 0;

      console.log(
        `[Ollama] Using ${useAggressiveParsing ? 'aggressive' : 'standard'} parsing for model: ${request.model}`
      );

      for await (const chunk of stream) {
        chunkCount++;
        const chunkStr = chunk.toString();

        buffer += chunkStr;

        // Aggressive parsing for models that concatenate JSON without newlines (e.g., Qwen)
        if (useAggressiveParsing) {
          let processedSomething = true;
          while (processedSomething && buffer.length > 0) {
            processedSomething = false;

            // Try to find concatenated JSON objects (}{)
            if (buffer.includes('}{')) {
              const parts = buffer.split(/(?<=\})(?=\{)/);
              if (parts.length > 1) {
                buffer = parts.pop() || '';

                for (const part of parts) {
                  if (part.trim()) {
                    try {
                      const data = JSON.parse(part);
                      processedSomething = true;

                      if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
                        yield { type: 'tool_calls', tool_calls: data.message.tool_calls };
                      }

                      if (data.message?.content) {
                        tokenCount++;
                        yield data.message.content;
                      }

                      if (data.done) {
                        console.log(
                          `[Ollama] Stream completed. Chunks: ${chunkCount}, Tokens: ${tokenCount}`
                        );
                        this.activeRequest = null;
                        return;
                      }
                    } catch (_e) {
                      // Invalid JSON, skip
                    }
                  }
                }
              }
            }

            // Also try line-based for Qwen (in case format changes)
            if (buffer.includes('\n')) {
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const data = JSON.parse(line);
                    processedSomething = true;

                    if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
                      yield { type: 'tool_calls', tool_calls: data.message.tool_calls };
                    }

                    if (data.message?.content) {
                      tokenCount++;
                      yield data.message.content;
                    }

                    if (data.done) {
                      console.log(
                        `[Ollama] Stream completed. Chunks: ${chunkCount}, Tokens: ${tokenCount}`
                      );
                      this.activeRequest = null;
                      return;
                    }
                  } catch (_e) {
                    // Invalid JSON, skip
                  }
                }
              }
            }
          }
        } else {
          // Standard line-based parsing for most models (LLaMA, Mistral, etc.)
          if (buffer.includes('\n')) {
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const data = JSON.parse(line);

                  if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
                    yield { type: 'tool_calls', tool_calls: data.message.tool_calls };
                  }

                  if (data.message?.content) {
                    tokenCount++;
                    yield data.message.content;
                  }

                  if (data.done) {
                    console.log(
                      `[Ollama] Stream completed. Chunks: ${chunkCount}, Tokens: ${tokenCount}`
                    );
                    this.activeRequest = null;
                    return;
                  }
                } catch (_e) {
                  console.warn('[Ollama] Failed to parse line:', line.substring(0, 50));
                }
              }
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
            yield { type: 'tool_calls', tool_calls: data.message.tool_calls };
          }
          if (data.message?.content) {
            tokenCount++;
            yield data.message.content;
          }
          if (data.done) {
            console.log(`[Ollama] Stream completed. Chunks: ${chunkCount}, Tokens: ${tokenCount}`);
            this.activeRequest = null;
          }
        } catch (_e) {
          // Ignore parse errors for final buffer
        }
      }
    } catch (error) {
      console.error('Failed to chat:', error);
      this.activeRequest = null;
      throw new Error('Failed to chat with Ollama');
    }
  }
}

// Export singleton instance
export const ollamaService = new OllamaService();

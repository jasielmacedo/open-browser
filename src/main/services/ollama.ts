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

export interface ProcessStats {
  pid: number;
  memory: {
    rss: number; // Resident Set Size in bytes
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpu: number; // CPU usage percentage
  uptime: number; // Process uptime in seconds
}

export interface OllamaServiceStatus {
  isRunning: boolean;
  processStats?: ProcessStats;
  error?: string;
}

export class OllamaService {
  private baseURL: string;
  private client: AxiosInstance;
  private process: ChildProcess | null = null;
  private isServerRunning = false;
  private activePulls: Map<string, boolean> = new Map();
  private activeRequest: http.ClientRequest | null = null;
  private processStartTime: number = 0;
  private isStarting = false;
  private isStopping = false;

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
    console.log('[Ollama] start() called, current state:', {
      isStarting: this.isStarting,
      isStopping: this.isStopping,
      hasProcess: !!this.process,
      processPid: this.process?.pid,
    });

    if (this.isStarting) {
      console.warn('[Ollama] Already starting, rejecting duplicate start');
      throw new Error('Ollama is already starting');
    }

    if (this.isStopping) {
      console.warn('[Ollama] Currently stopping, rejecting start');
      throw new Error('Ollama is currently stopping, please wait');
    }

    const isRunning = await this.isRunning();
    console.log('[Ollama] isRunning check:', isRunning);

    if (isRunning) {
      console.log('[Ollama] Server is already running, not starting new process');

      // If running but we don't have a process reference, try to find it
      if (!this.process) {
        console.log('[Ollama] No process reference, attempting to find existing Ollama PID');
        const existingPid = await this.findOllamaPid();
        if (existingPid) {
          console.log('[Ollama] Found existing Ollama process with PID:', existingPid);
          // We can't re-attach to the process, but at least we know it exists
        }
      }
      return;
    }

    this.isStarting = true;
    console.log('[Ollama] Starting new Ollama process...');

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
        // On Windows, we need special handling to ensure child processes are killed
        const spawnOptions: any = {
          stdio: 'pipe',
          env,
        };

        if (process.platform === 'win32') {
          // On Windows, DO NOT detach so it stays in the same process group
          // We'll use taskkill /T to kill the entire tree when stopping
          spawnOptions.detached = false;
          // Set the process to be killed when parent dies (Windows-specific)
          spawnOptions.windowsHide = true;
        } else {
          // On Unix, create a new process group so we can kill it and its children
          spawnOptions.detached = false;
        }

        this.process = spawn(ollamaPath, ['serve'], spawnOptions);

        // Track process start time
        this.processStartTime = Date.now();
        const startedPid = this.process.pid;
        console.log('[Ollama] Spawned process with PID:', startedPid);

        this.process.on('error', (error) => {
          console.error('[Ollama] Process error event:', error);
          this.processStartTime = 0;
          this.isStarting = false;
          reject(new Error('Failed to start Ollama. Please check the installation.'));
        });

        // Track unexpected exits
        this.process.on('exit', (code, signal) => {
          console.warn('[Ollama] Process exited unexpectedly!', {
            pid: startedPid,
            code,
            signal,
            wasExpected: this.isStopping,
          });
          // Only clean up if we're not already stopping (unexpected exit)
          if (!this.isStopping) {
            console.error('[Ollama] UNEXPECTED EXIT - process died without being stopped!');
            this.process = null;
            this.isServerRunning = false;
            this.processStartTime = 0;
          }
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
              this.isStarting = false;
              resolve();
            }
          } finally {
            isChecking = false;
          }
        }, 500);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          this.isStarting = false;
          reject(new Error('Ollama server failed to start within timeout'));
        }, 10000);
      } catch (error) {
        this.isStarting = false;
        reject(error);
      }
    });
  }

  /**
   * Ensure Ollama is running, start it if not
   */
  async ensureRunning(): Promise<void> {
    const isRunning = await this.isRunning();
    console.log('[Ollama] ensureRunning check:', isRunning);

    if (!isRunning) {
      console.log('[Ollama] Service not running, calling start()');
      await this.start();
    } else {
      console.log('[Ollama] Service already running, skipping start');
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
    if (this.isStopping) {
      throw new Error('Ollama is already stopping');
    }

    if (!this.process) {
      console.log('[Ollama] No process to stop');
      return;
    }

    this.isStopping = true;
    const pid = this.process.pid;
    console.log(`[Ollama] Stopping Ollama process (PID: ${pid})`);

    return new Promise<void>((resolve) => {
      if (!this.process) {
        this.isStopping = false;
        resolve();
        return;
      }

      // On Windows, Ollama spawns child processes (especially for vision models)
      // We need to kill ALL ollama.exe processes, not just the tree from our PID
      // This is because vision models may spawn detached worker processes
      if (process.platform === 'win32') {
        console.log('[Ollama] Killing all ollama.exe processes on Windows');
        exec('taskkill /F /IM ollama.exe /T', (error) => {
          if (error) {
            // This might error if no processes found, which is fine
            console.log('[Ollama] taskkill completed (may have been no processes)');
          } else {
            console.log('[Ollama] All ollama.exe processes killed successfully');
          }
          this.process = null;
          this.isServerRunning = false;
          this.processStartTime = 0;
          this.isStopping = false;
          resolve();
        });
        return;
      }

      // On Unix, try graceful shutdown first
      const timeout = setTimeout(() => {
        console.warn('[Ollama] Process did not exit gracefully, forcing termination');

        if (pid) {
          // Use SIGKILL on Unix-like systems
          try {
            process.kill(pid, 'SIGKILL');
          } catch (err) {
            console.error('[Ollama] Failed to send SIGKILL:', err);
          }
          this.process = null;
          this.isServerRunning = false;
          this.processStartTime = 0;
          this.isStopping = false;
          resolve();
        }
      }, 3000); // Wait 3 seconds for graceful shutdown

      this.process.once('exit', (code, signal) => {
        clearTimeout(timeout);
        console.log(`[Ollama] Process exited with code ${code} and signal ${signal}`);
        this.process = null;
        this.isServerRunning = false;
        this.processStartTime = 0;
        this.isStopping = false;
        resolve();
      });

      // Try graceful shutdown first on Unix
      try {
        this.process.kill('SIGTERM');
      } catch (err) {
        console.error('[Ollama] Failed to send termination signal:', err);
        clearTimeout(timeout);
        this.process = null;
        this.isServerRunning = false;
        this.processStartTime = 0;
        this.isStopping = false;
        resolve();
      }
    });
  }

  /**
   * Find the PID of a running Ollama process
   */
  private async findOllamaPid(): Promise<number | null> {
    return new Promise<number | null>((resolve) => {
      if (process.platform === 'win32') {
        exec(
          'tasklist /FI "IMAGENAME eq ollama.exe" /FO CSV /NH',
          { timeout: 3000 },
          (error, stdout) => {
            if (error || !stdout || stdout.includes('INFO: No tasks are running')) {
              resolve(null);
              return;
            }

            // Parse the first ollama.exe process found
            const match = stdout.match(/"ollama\.exe","(\d+)"/);
            if (match && match[1]) {
              resolve(parseInt(match[1], 10));
            } else {
              resolve(null);
            }
          }
        );
      } else {
        exec('pgrep -f "ollama"', { timeout: 3000 }, (error, stdout) => {
          if (error || !stdout.trim()) {
            resolve(null);
            return;
          }

          const pids = stdout.trim().split('\n');
          if (pids.length > 0 && pids[0]) {
            resolve(parseInt(pids[0], 10));
          } else {
            resolve(null);
          }
        });
      }
    });
  }

  /**
   * Get process statistics for the Ollama server
   */
  async getProcessStats(): Promise<ProcessStats | null> {
    let pid: number | undefined;

    // If we have a reference to the process, use its PID
    if (this.process && this.process.pid) {
      pid = this.process.pid;
    } else {
      // Otherwise, try to find the Ollama process by name
      pid = await this.findOllamaPid();
      if (!pid) {
        return null;
      }
    }

    return new Promise<ProcessStats | null>((resolve) => {
      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.warn('[Ollama] getProcessStats timeout');
        resolve(null);
      }, 5000);

      if (process.platform === 'win32') {
        // On Windows, use wmic to get process info
        exec(
          `wmic process where processid=${pid} get WorkingSetSize,KernelModeTime,UserModeTime /format:csv`,
          { timeout: 5000 },
          (error, stdout) => {
            clearTimeout(timeout);
            if (error) {
              console.error('[Ollama] Failed to get process stats:', error);
              resolve(null);
              return;
            }

            try {
              // Parse CSV output (skip header and node line)
              const lines = stdout
                .trim()
                .split('\n')
                .filter((line) => line.trim());
              if (lines.length < 2) {
                resolve(null);
                return;
              }

              const dataLine = lines[lines.length - 1];
              const parts = dataLine.split(',');

              if (parts.length >= 4) {
                const workingSetSize = parseInt(parts[3], 10); // Memory in bytes

                // Calculate uptime (0 if we don't have start time)
                const uptime =
                  this.processStartTime > 0
                    ? Math.floor((Date.now() - this.processStartTime) / 1000)
                    : 0;

                resolve({
                  pid,
                  memory: {
                    rss: workingSetSize || 0,
                    heapTotal: 0,
                    heapUsed: 0,
                    external: 0,
                  },
                  cpu: 0, // CPU calculation is complex on Windows, would need multiple samples
                  uptime,
                });
              } else {
                resolve(null);
              }
            } catch (parseError) {
              console.error('[Ollama] Failed to parse process stats:', parseError);
              resolve(null);
            }
          }
        );
      } else {
        // On Unix, use ps command
        exec(`ps -p ${pid} -o rss=,pcpu=`, { timeout: 5000 }, (error, stdout) => {
          clearTimeout(timeout);
          if (error) {
            console.error('[Ollama] Failed to get process stats:', error);
            resolve(null);
            return;
          }

          try {
            const output = stdout.trim().split(/\s+/);
            const rss = parseInt(output[0], 10) * 1024; // Convert KB to bytes
            const cpu = parseFloat(output[1]);

            const uptime =
              this.processStartTime > 0
                ? Math.floor((Date.now() - this.processStartTime) / 1000)
                : 0;

            resolve({
              pid,
              memory: {
                rss,
                heapTotal: 0,
                heapUsed: 0,
                external: 0,
              },
              cpu,
              uptime,
            });
          } catch (parseError) {
            console.error('[Ollama] Failed to parse process stats:', parseError);
            resolve(null);
          }
        });
      }
    });
  }

  /**
   * Get comprehensive service status including process stats
   */
  async getServiceStatus(): Promise<OllamaServiceStatus> {
    const isRunning = await this.isRunning();
    console.log('[Ollama] getServiceStatus - isRunning:', isRunning);

    if (!isRunning) {
      return {
        isRunning: false,
        error: 'Ollama service is not running',
      };
    }

    const processStats = await this.getProcessStats();
    console.log('[Ollama] getServiceStatus - processStats:', processStats);

    return {
      isRunning: true,
      processStats: processStats || undefined,
    };
  }

  /**
   * Restart the Ollama service
   */
  async restart(): Promise<void> {
    console.log('[Ollama] Restarting service...');

    // Stop the service and wait for it to fully stop
    await this.stop();

    // Wait for stop to complete (isStopping flag will be reset by stop())
    // Add extra delay to ensure cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Verify process is fully stopped before starting
    if (this.process) {
      throw new Error('Failed to stop Ollama completely before restart');
    }

    await this.start();
    console.log('[Ollama] Service restarted successfully');
  }

  /**
   * Force kill the Ollama process immediately
   */
  async forceKill(): Promise<void> {
    if (!this.process || !this.process.pid) {
      console.log('[Ollama] No process to kill');
      return;
    }

    if (this.isStopping) {
      throw new Error('Ollama is already stopping, use stop() instead');
    }

    const pid = this.process.pid;
    const processRef = this.process;
    console.log(`[Ollama] Force killing process (PID: ${pid})`);

    return new Promise<void>((resolve) => {
      // Set up exit listener before killing
      const exitHandler = () => {
        console.log('[Ollama] Process killed');
        this.process = null;
        this.isServerRunning = false;
        this.processStartTime = 0;
        this.isStopping = false;
        resolve();
      };

      // Add timeout in case exit event doesn't fire
      const timeout = setTimeout(() => {
        processRef.removeListener('exit', exitHandler);
        console.warn('[Ollama] Force kill timeout, cleaning up anyway');
        this.process = null;
        this.isServerRunning = false;
        this.processStartTime = 0;
        this.isStopping = false;
        resolve();
      }, 3000);

      processRef.once('exit', () => {
        clearTimeout(timeout);
        exitHandler();
      });

      if (process.platform === 'win32') {
        // Kill ALL ollama.exe processes to ensure vision model workers are killed too
        exec('taskkill /F /IM ollama.exe /T', (error) => {
          if (error) {
            console.error('[Ollama] Failed to force kill processes:', error);
          }
          // Always clean up our reference
          clearTimeout(timeout);
          processRef.removeListener('exit', exitHandler);
          this.process = null;
          this.isServerRunning = false;
          this.processStartTime = 0;
          this.isStopping = false;
          resolve();
        });
      } else {
        try {
          process.kill(pid, 'SIGKILL');
        } catch (err) {
          console.error('[Ollama] Failed to send SIGKILL:', err);
          clearTimeout(timeout);
          processRef.removeListener('exit', exitHandler);
          this.process = null;
          this.isServerRunning = false;
          this.processStartTime = 0;
          this.isStopping = false;
          resolve();
        }
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
      console.log('[Ollama] Waiting for stream data...');

      const streamStartTime = Date.now();
      let firstChunkTime: number | undefined;

      for await (const chunk of stream) {
        chunkCount++;

        // Track when first chunk arrives
        if (!firstChunkTime) {
          firstChunkTime = Date.now();
          const waitTime = firstChunkTime - streamStartTime;
          console.log(`[Ollama] First chunk received after ${waitTime}ms`);
        }

        const chunkStr = chunk.toString();
        buffer += chunkStr;

        // Log periodically to show stream is alive
        if (chunkCount % 100 === 0) {
          console.log(
            `[Ollama] Received ${chunkCount} chunks, ${tokenCount} tokens, buffer size: ${buffer.length}`
          );
          // Debug: Show buffer content if no tokens are being extracted
          if (tokenCount === 0 && chunkCount >= 100) {
            console.log('[Ollama] DEBUG - Buffer sample:', buffer.substring(0, 200));
          }
        }

        // Aggressive parsing for models that concatenate JSON without newlines (e.g., Qwen)
        if (useAggressiveParsing) {
          let processedSomething = true;
          while (processedSomething && buffer.length > 0) {
            processedSomething = false;

            // Strategy 1: Try to parse buffer as complete JSON (for small chunks)
            if (
              buffer.length < 500 &&
              buffer.trim().startsWith('{') &&
              buffer.trim().endsWith('}')
            ) {
              try {
                const data = JSON.parse(buffer);
                processedSomething = true;
                buffer = '';

                if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
                  yield { type: 'tool_calls', tool_calls: data.message.tool_calls };
                }

                // Qwen sends 'thinking' field (internal reasoning) - yield it separately from content
                if (data.message?.thinking) {
                  yield { type: 'thinking', content: data.message.thinking };
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
                continue; // Skip other strategies if this worked
              } catch (_e) {
                // Not valid JSON yet, try other strategies
              }
            }

            // Strategy 2: Try to find concatenated JSON objects (}{)
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

                      // Yield thinking separately from content
                      if (data.message?.thinking) {
                        yield { type: 'thinking', content: data.message.thinking };
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

            // Strategy 3: Line-based parsing (in case format changes)
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

                    // Yield thinking separately from content
                    if (data.message?.thinking) {
                      yield { type: 'thinking', content: data.message.thinking };
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

                  // Yield thinking separately from content
                  if (data.message?.thinking) {
                    yield { type: 'thinking', content: data.message.thinking };
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
          // Yield thinking separately from content
          if (data.message?.thinking) {
            yield { type: 'thinking', content: data.message.thinking };
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

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
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  images?: string[];
  stream?: boolean;
  system?: string;
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
}

export class OllamaService {
  private baseURL: string;
  private client: AxiosInstance;
  private process: ChildProcess | null = null;
  private isServerRunning = false;

  constructor(baseURL = 'http://localhost:11434') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 120000, // 2 minutes for model operations
    });
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
   * Pull/download a model from Ollama library
   * Returns an async generator for progress updates
   */
  async *pullModel(modelName: string): AsyncGenerator<PullProgress> {
    await this.ensureRunning();

    try {
      const response = await this.client.post(
        '/api/pull',
        { name: modelName },
        {
          responseType: 'stream',
          timeout: 0, // No timeout for downloads
        }
      );

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
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
                return;
              }
            } catch (_e) {
              console.warn('Failed to parse progress line:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to pull model:', error);
      throw new Error(`Failed to pull model ${modelName}`);
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
   * Generate text with optional vision input
   * Returns an async generator for streaming responses
   */
  async *generate(request: GenerateRequest): AsyncGenerator<string> {
    await this.ensureRunning();

    try {
      const response = await this.client.post('/api/generate', request, {
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
   * Chat completion with conversation history
   * Returns an async generator for streaming responses
   */
  async *chat(request: ChatRequest): AsyncGenerator<string> {
    await this.ensureRunning();

    try {
      const response = await this.client.post('/api/chat', request, {
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

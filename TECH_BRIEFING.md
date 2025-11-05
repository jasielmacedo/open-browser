# Browser-LLM Technical Briefing

## Project Overview

A Chromium-based browser with integrated local LLM capabilities, featuring multi-modal vision models for page analysis and interaction. Users can browse the web normally or engage with AI to analyze, summarize, and interact with web content using locally-run models.

## Architecture Philosophy

Inspired by OpenAI Atlas' OWL (OpenAI's Web Layer) architecture:
- **Separation of Concerns**: Browser rendering engine isolated from AI/UI layer
- **Process Isolation**: Chromium runs in separate process from main app
- **Async Operations**: LLM inference doesn't block browser functionality
- **Service Layer Pattern**: Ollama runs as independent service, managed by app

```
┌─────────────────────────────────────────────────────────────┐
│                  Electron Main Process                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Application Manager                     │   │
│  │  • Window lifecycle management                       │   │
│  │  • IPC message routing                               │   │
│  │  • Security & sandboxing                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Ollama Service Manager                     │   │
│  │  • Process spawning/monitoring                       │   │
│  │  • Health checks & auto-restart                      │   │
│  │  • HTTP API client (localhost:11434)                 │   │
│  │  • Model pull/push/list operations                   │   │
│  │  • Streaming response handling                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Model Management Service                  │   │
│  │  • Download queue with progress tracking             │   │
│  │  • SHA256 checksum verification                      │   │
│  │  • Storage management (disk space checks)            │   │
│  │  • Model registry (built-in + custom URLs)           │   │
│  │  • GGUF format validation                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Content Capture Service                     │   │
│  │  • Screenshot capture (webContents.capturePage)      │   │
│  │  • Image optimization (resize, compress)             │   │
│  │  • DOM extraction via executeJavaScript              │   │
│  │  • Mozilla Readability integration                   │   │
│  │  • Base64 encoding for API transport                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↕ IPC (contextBridge)
┌─────────────────────────────────────────────────────────────┐
│              Electron Renderer Process (React)              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Browser UI Layer                     │   │
│  │  • Navigation bar with URL input                     │   │
│  │  • Mode toggle: Browse ⟷ Chat (Cmd/Ctrl+K)          │   │
│  │  • Tab management (multi-tab support)                │   │
│  │  • WebView container (isolated browsing context)     │   │
│  │  • Browser controls (back, forward, refresh, home)   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                Chat Interface Layer                  │   │
│  │  • Home page: Chat-first experience                  │   │
│  │  • Message list with streaming support               │   │
│  │  • Model selector dropdown                           │   │
│  │  • Context menu: "Ask AI about this page"            │   │
│  │  • Conversation history (in-memory + optional save)  │   │
│  │  • Markdown rendering with syntax highlighting       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Settings & Model Manager UI               │   │
│  │  • Model list with download status                   │   │
│  │  • Progress bars for downloads                       │   │
│  │  • Custom URL input for manual models                │   │
│  │  • Storage location configuration                    │   │
│  │  • Disk space usage display                          │   │
│  │  • Model deletion/management                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Core Framework
- **Electron** `^28.0.0+`
  - Main Process: Node.js runtime for system operations
  - Renderer Process: Chromium for UI rendering
  - Context Isolation: Enabled for security
  - Node Integration: Disabled in renderer (use preload scripts)

### Frontend Stack
- **React** `^18.2.0+`
  - Functional components with Hooks
  - Concurrent rendering for smooth UI
  - Suspense for lazy loading
- **TypeScript** `^5.3.0+`
  - Strict mode enabled
  - Path aliases for clean imports
  - Shared types between main/renderer
- **Vite** `^5.0.0+`
  - Dev server with HMR
  - Fast builds with esbuild
  - Electron-vite for unified config

### UI/Styling
- **Tailwind CSS** `^3.4.0+`
  - Utility-first styling
  - Dark mode support
  - Custom theme tokens
- **shadcn/ui**
  - Accessible React components
  - Built on Radix UI primitives
  - Customizable with Tailwind

### State Management
- **Zustand** or **Jotai**
  - Lightweight (~1KB)
  - No boilerplate
  - TypeScript-first
  - Stores:
    - `browserStore`: Navigation state, tabs, mode
    - `chatStore`: Messages, active model, streaming state
    - `modelStore`: Available models, download progress

### LLM Integration
- **Ollama** (HTTP API)
  - Version: `0.1.0+`
  - Default Port: `11434`
  - API Endpoints:
    - `POST /api/generate` - Streaming inference
    - `POST /api/chat` - Chat completion
    - `POST /api/pull` - Download models
    - `GET /api/tags` - List installed models
    - `DELETE /api/delete` - Remove models
  - Model Format: GGUF (llama.cpp compatible)

### Additional Libraries
- **@mozilla/readability** - Article extraction from HTML
- **sharp** - Image processing/optimization (main process)
- **marked** - Markdown parsing for chat messages
- **highlight.js** - Code syntax highlighting
- **axios** - HTTP client for Ollama API
- **electron-store** - Persistent settings storage

## File Structure

```
browser-llm/
├── src/
│   ├── main/
│   │   ├── index.ts                      # Main process entry point
│   │   ├── preload.ts                    # Context bridge (IPC exposure)
│   │   ├── services/
│   │   │   ├── ollama.ts                 # Ollama API client & process mgmt
│   │   │   ├── model-manager.ts          # Model download/storage logic
│   │   │   ├── capture.ts                # Screenshot & DOM extraction
│   │   │   └── storage.ts                # File system operations
│   │   ├── ipc/
│   │   │   ├── handlers.ts               # IPC message handlers
│   │   │   └── types.ts                  # IPC message type definitions
│   │   └── utils/
│   │       ├── paths.ts                  # App data paths
│   │       └── logger.ts                 # Logging utility
│   │
│   ├── renderer/
│   │   ├── index.html                    # HTML entry point
│   │   ├── main.tsx                      # React root render
│   │   ├── App.tsx                       # Root component
│   │   ├── components/
│   │   │   ├── Browser/
│   │   │   │   ├── NavigationBar.tsx     # URL input + controls
│   │   │   │   ├── WebView.tsx           # Webview wrapper
│   │   │   │   ├── TabManager.tsx        # Tab bar + switching
│   │   │   │   └── ModeToggle.tsx        # Browse/Chat mode switch
│   │   │   ├── Chat/
│   │   │   │   ├── ChatInterface.tsx     # Main chat container
│   │   │   │   ├── MessageList.tsx       # Conversation display
│   │   │   │   ├── MessageInput.tsx      # User input field
│   │   │   │   ├── ModelSelector.tsx     # Dropdown for model selection
│   │   │   │   ├── StreamingMessage.tsx  # Real-time token display
│   │   │   │   └── HomePage.tsx          # Initial chat screen
│   │   │   ├── Settings/
│   │   │   │   ├── SettingsPanel.tsx     # Main settings container
│   │   │   │   ├── ModelManager.tsx      # Model list & actions
│   │   │   │   ├── ModelCard.tsx         # Individual model display
│   │   │   │   ├── DownloadProgress.tsx  # Progress bar component
│   │   │   │   └── CustomModelInput.tsx  # Manual URL entry
│   │   │   └── UI/
│   │   │       ├── Button.tsx            # shadcn button
│   │   │       ├── Input.tsx             # shadcn input
│   │   │       ├── Select.tsx            # shadcn select
│   │   │       └── Progress.tsx          # shadcn progress
│   │   ├── store/
│   │   │   ├── browser.ts                # Browser state (Zustand)
│   │   │   ├── chat.ts                   # Chat state (Zustand)
│   │   │   └── models.ts                 # Model state (Zustand)
│   │   ├── hooks/
│   │   │   ├── useIPC.ts                 # IPC communication hook
│   │   │   ├── useStreaming.ts           # Streaming message handler
│   │   │   └── useKeyboard.ts            # Keyboard shortcuts
│   │   ├── styles/
│   │   │   └── globals.css               # Tailwind + global styles
│   │   └── lib/
│   │       └── utils.ts                  # Shared utilities
│   │
│   └── shared/
│       ├── types.ts                      # Shared TypeScript types
│       ├── constants.ts                  # App-wide constants
│       └── models.json                   # Pre-configured model registry
│
├── resources/                            # App icons & assets
├── dist/                                 # Build output (gitignored)
├── node_modules/                         # Dependencies (gitignored)
│
├── package.json                          # Project dependencies
├── tsconfig.json                         # TypeScript config
├── tsconfig.node.json                    # TS config for Node (main)
├── vite.config.ts                        # Vite configuration
├── electron-builder.json                 # Build/packaging config
├── tailwind.config.js                    # Tailwind configuration
├── .eslintrc.json                        # ESLint rules
├── .prettierrc                           # Code formatting
├── .gitignore
└── README.md
```

## Model Registry Format

### Pre-configured Models (src/shared/models.json)

```json
{
  "models": [
    {
      "id": "moondream-2b-q4",
      "name": "Moondream 2B (Q4)",
      "size": "1.5GB",
      "parameters": "2B",
      "quantization": "Q4_K_M",
      "url": "https://huggingface.co/vikhyatk/moondream2/resolve/main/moondream-2b-q4_k_m.gguf",
      "sha256": "...",
      "description": "Fastest option. Tiny vision model optimized for speed.",
      "requirements": {
        "ram": "4GB",
        "vram": "2GB (optional)"
      },
      "capabilities": ["vision", "chat"],
      "recommended": true
    },
    {
      "id": "llava-phi-3b-q4",
      "name": "LLaVA-Phi 3B (Q4)",
      "size": "2GB",
      "parameters": "3B",
      "quantization": "Q4_K_M",
      "url": "https://huggingface.co/...",
      "sha256": "...",
      "description": "Balanced performance and quality for most tasks.",
      "requirements": {
        "ram": "6GB",
        "vram": "3GB (optional)"
      },
      "capabilities": ["vision", "chat"],
      "recommended": true
    },
    {
      "id": "bakllava-7b-q4",
      "name": "BakLLaVA 7B (Q4)",
      "size": "4GB",
      "parameters": "7B",
      "quantization": "Q4_K_M",
      "url": "https://huggingface.co/...",
      "sha256": "...",
      "description": "High quality vision understanding. Best for detailed analysis.",
      "requirements": {
        "ram": "8GB",
        "vram": "4GB (optional)"
      },
      "capabilities": ["vision", "chat"],
      "recommended": true
    },
    {
      "id": "llava-v1.6-mistral-7b-q5",
      "name": "LLaVA 1.6 Mistral 7B (Q5)",
      "size": "5.5GB",
      "parameters": "7B",
      "quantization": "Q5_K_M",
      "url": "https://huggingface.co/...",
      "sha256": "...",
      "description": "Higher precision, better quality than Q4. Slower inference.",
      "requirements": {
        "ram": "10GB",
        "vram": "6GB (optional)"
      },
      "capabilities": ["vision", "chat"],
      "recommended": false
    }
  ]
}
```

### Custom Model Schema
Users can add models via URL with automatic schema detection:
```json
{
  "id": "custom-model-uuid",
  "name": "User-provided name",
  "isCustom": true,
  "url": "https://...",
  "addedAt": "2025-01-15T10:30:00Z"
}
```

## Storage Architecture

### Directory Structure
```
User Data Directory (app.getPath('userData'))
├── models/                           # Ollama model storage (symlink/config)
├── settings.json                     # App configuration (electron-store)
├── conversations/                    # Saved chat history (optional)
│   ├── 2025-01-15-conversation.json
│   └── ...
└── logs/                             # Application logs
    ├── main.log
    └── renderer.log

Ollama Directory (platform-dependent)
Windows: %USERPROFILE%\.ollama\models\
macOS:   ~/.ollama/models/
Linux:   ~/.ollama/models/
├── manifests/                        # Model metadata
├── blobs/                            # Content-addressed model files
└── registry.ollama.ai/               # Registry cache
```

### Model Storage Flow
1. User requests model download
2. App calls Ollama API: `POST /api/pull`
3. Ollama downloads to its own directory (`.ollama/models`)
4. App tracks progress via streaming response
5. Model available for inference via `POST /api/generate`

## API Integration Patterns

### Ollama Service Management

```typescript
// main/services/ollama.ts
class OllamaService {
  private process: ChildProcess | null = null;
  private baseURL = 'http://localhost:11434';

  async start(): Promise<void> {
    // Spawn ollama serve process
    this.process = spawn('ollama', ['serve']);
    await this.waitForReady();
  }

  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseURL}/api/version`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async ensureRunning(): Promise<void> {
    if (!(await this.isRunning())) {
      await this.start();
    }
  }

  async pullModel(modelName: string): AsyncGenerator<PullProgress> {
    const response = await fetch(`${this.baseURL}/api/pull`, {
      method: 'POST',
      body: JSON.stringify({ name: modelName }),
      headers: { 'Content-Type': 'application/json' }
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const line = decoder.decode(value);
      const data = JSON.parse(line);
      yield data; // { status, completed, total }
    }
  }

  async generateWithVision(
    model: string,
    prompt: string,
    imageBase64: string
  ): AsyncGenerator<string> {
    const response = await fetch(`${this.baseURL}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt,
        images: [imageBase64],
        stream: true
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const line = decoder.decode(value);
      const data = JSON.parse(line);
      if (data.response) {
        yield data.response; // Yield tokens as they arrive
      }
    }
  }
}
```

### Content Capture

```typescript
// main/services/capture.ts
class CaptureService {
  async capturePageScreenshot(
    webContents: Electron.WebContents
  ): Promise<Buffer> {
    const image = await webContents.capturePage();

    // Optimize for LLM input
    return sharp(image.toPNG())
      .resize(448, 448, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  async extractPageText(
    webContents: Electron.WebContents
  ): Promise<string> {
    const result = await webContents.executeJavaScript(`
      (function() {
        const { Readability } = require('@mozilla/readability');
        const article = new Readability(document).parse();
        return {
          title: document.title,
          text: article ? article.textContent : document.body.innerText,
          url: window.location.href
        };
      })();
    `);

    return `Title: ${result.title}\nURL: ${result.url}\n\n${result.text.slice(0, 2000)}`;
  }

  async captureForLLM(
    webContents: Electron.WebContents
  ): Promise<{ image: string; context: string }> {
    const [screenshot, text] = await Promise.all([
      this.capturePageScreenshot(webContents),
      this.extractPageText(webContents)
    ]);

    return {
      image: screenshot.toString('base64'),
      context: text
    };
  }
}
```

### IPC Communication

```typescript
// main/ipc/handlers.ts
export function registerIPCHandlers(
  ollamaService: OllamaService,
  captureService: CaptureService
) {
  // Model management
  ipcMain.handle('models:list', async () => {
    return await ollamaService.listModels();
  });

  ipcMain.handle('models:pull', async (event, modelName: string) => {
    const generator = ollamaService.pullModel(modelName);

    for await (const progress of generator) {
      event.sender.send('models:pull-progress', progress);
    }

    return { success: true };
  });

  // Chat inference
  ipcMain.handle('chat:send', async (event, payload) => {
    const { model, prompt, includePageContext } = payload;

    let imageBase64: string | undefined;
    let context: string | undefined;

    if (includePageContext) {
      const captured = await captureService.captureForLLM(event.sender);
      imageBase64 = captured.image;
      context = captured.context;
    }

    const fullPrompt = context
      ? `${prompt}\n\nPage context:\n${context}`
      : prompt;

    const generator = ollamaService.generateWithVision(
      model,
      fullPrompt,
      imageBase64
    );

    for await (const token of generator) {
      event.sender.send('chat:token', token);
    }

    return { success: true };
  });

  // Browser actions
  ipcMain.handle('browser:capture-screenshot', async (event) => {
    return await captureService.capturePageScreenshot(event.sender);
  });
}
```

```typescript
// renderer/hooks/useIPC.ts
export function useIPC() {
  return {
    listModels: () => window.electron.invoke('models:list'),
    pullModel: (name: string) => window.electron.invoke('models:pull', name),
    sendChat: (payload: ChatPayload) => window.electron.invoke('chat:send', payload),
    onPullProgress: (callback: (progress: PullProgress) => void) => {
      window.electron.on('models:pull-progress', callback);
    },
    onChatToken: (callback: (token: string) => void) => {
      window.electron.on('chat:token', callback);
    }
  };
}
```

## UI/UX Patterns

### Mode Toggle Behavior
- **Browse Mode**: URL bar accepts URLs, navigation works normally
- **Chat Mode**: URL bar becomes prompt input, triggers LLM inference
- **Toggle**: Keyboard shortcut (Cmd/Ctrl+K) or button click
- **Visual Indicator**: Icon badge, color change, or label showing active mode

### Home Page (Initial State)
- Chat interface front and center
- Model selector prominent
- Quick actions: "Analyze this page", "Summarize", "Answer question"
- Recent conversations (optional)

### Context Menu Integration
Right-click on page:
- "Ask AI about this page"
- "Explain selected text"
- "Summarize page"
- Triggers capture + chat in sidebar/overlay

### Streaming Response Display
```
User: What's on this page?
Assistant: ▊                    <- Cursor blinks while streaming
Assistant: This page contains... ▊
Assistant: This page contains an article about...▊
```

## Performance Considerations

### Image Optimization
- Resize to model's input resolution (typically 336x336 or 448x448)
- Compress to JPEG at 85% quality
- Remove alpha channel (convert RGBA → RGB)
- Target: <200KB per image

### Memory Management
```
Component Memory Budget:
- Electron base: ~150MB
- React app: ~50-100MB
- Ollama (idle): ~100MB
- Loaded 7B model: ~4-5GB
- Inference overhead: +1-2GB (KV cache)
- Image processing: ~200MB peak

Total for 7B model: ~6-7GB RAM
```

### Inference Performance
```
CPU (Apple M1/M2, AMD Ryzen 7+):
- 7B Q4: ~3-5 tokens/sec
- 3B Q4: ~8-12 tokens/sec

GPU (NVIDIA RTX 3060+, Apple M-series):
- 7B Q4: ~20-40 tokens/sec
- 3B Q4: ~40-80 tokens/sec

Latency targets:
- Time to first token: <2s
- Streaming: Real-time display (<100ms buffering)
```

### Optimization Strategies
1. **Lazy Load Models**: Download on first use, not at startup
2. **Background Downloads**: Non-blocking model pulls
3. **Image Caching**: Reuse screenshots for follow-up questions
4. **Context Pruning**: Truncate DOM text to fit context window
5. **GPU Acceleration**: Auto-detect and use CUDA/Metal when available

## Security Considerations

### Electron Security Best Practices
```typescript
// main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,           // Disable Node in renderer
    contextIsolation: true,            // Isolate preload context
    sandbox: true,                     // Enable sandbox
    webSecurity: true,                 // Enforce same-origin
    preload: path.join(__dirname, 'preload.js')
  }
});

// Content Security Policy
mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' http://localhost:11434"
      ]
    }
  });
});
```

### WebView Isolation
```typescript
// renderer/components/Browser/WebView.tsx
<webview
  src={url}
  partition="persist:main"           // Separate session
  webpreferences="nodeIntegration=false,contextIsolation=true"
  allowpopups="false"
/>
```

### Model Download Verification
```typescript
async function verifyModelChecksum(filePath: string, expectedSHA256: string): Promise<boolean> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest('hex') === expectedSHA256;
}
```

## Build & Distribution

### Development
```bash
pnpm install
pnpm dev          # Start dev server with hot reload
```

### Production Build
```bash
pnpm build        # Compile TypeScript + bundle
pnpm package      # Create distributable (dmg/exe/AppImage)
```

### electron-builder Configuration
```json
{
  "appId": "com.browserllm.app",
  "productName": "Browser-LLM",
  "directories": {
    "output": "dist"
  },
  "files": [
    "build/**/*",
    "node_modules/**/*",
    "package.json"
  ],
  "mac": {
    "target": ["dmg", "zip"],
    "category": "public.app-category.productivity",
    "hardenedRuntime": true,
    "entitlements": "build/entitlements.mac.plist"
  },
  "win": {
    "target": ["nsis", "portable"],
    "icon": "resources/icon.ico"
  },
  "linux": {
    "target": ["AppImage", "deb"],
    "category": "Network"
  }
}
```

## Environment Requirements

### Development
- Node.js 18+ (LTS recommended)
- pnpm 8+ (or npm/yarn)
- Ollama installed and in PATH
- 8GB+ RAM (for running models during dev)
- TypeScript 5.3+

### User System Requirements
**Minimum (Moondream 2B)**:
- OS: Windows 10+, macOS 11+, Ubuntu 20.04+
- RAM: 4GB
- Storage: 5GB free space
- CPU: Dual-core 2GHz+

**Recommended (BakLLaVA 7B)**:
- OS: Windows 11, macOS 12+, Ubuntu 22.04+
- RAM: 8GB+
- Storage: 10GB free space
- CPU: Quad-core 2.5GHz+
- GPU: Optional but recommended (NVIDIA, AMD, or Apple Silicon)

## Key Differentiators

### vs Traditional Browsers
- Local AI integration (no cloud dependency)
- Privacy-first (all inference happens locally)
- Chat-first interface option

### vs Cloud AI Browsers (Arc, Atlas)
- No API costs
- Offline capable (once models downloaded)
- Full data privacy
- Unlimited queries

### vs LLM Clients (LM Studio, Jan.ai)
- Integrated browsing (not just chat)
- Vision models see actual pages
- Direct web interaction

## Future Extensibility

### Potential Enhancements
- [ ] Multi-modal output (TTS for responses)
- [ ] Page automation via LLM (playwright integration)
- [ ] Local embeddings for semantic search across history
- [ ] Plugin system for custom tools/models
- [ ] Collaborative features (share conversations)
- [ ] Advanced context: PDFs, videos, code repos
- [ ] Fine-tuning interface for custom models
- [ ] RAG (Retrieval-Augmented Generation) for personal knowledge

### Architecture Scalability
- Service-based design allows swapping Ollama for alternatives
- IPC layer abstracts communication (easy to add new features)
- React component architecture supports theming/customization
- Model registry extensible to multiple sources

## References & Resources

### Documentation
- Electron: https://www.electronjs.org/docs
- Ollama API: https://github.com/ollama/ollama/blob/main/docs/api.md
- llama.cpp: https://github.com/ggerganov/llama.cpp
- GGUF format: https://github.com/ggerganov/ggml/blob/master/docs/gguf.md

### Model Sources
- Hugging Face: https://huggingface.co/models?library=gguf
- Ollama Library: https://ollama.ai/library
- LM Studio Community: https://lmstudio.ai/models

### Inspiration
- OpenAI Atlas: https://openai.com/index/introducing-chatgpt-atlas/
- Arc Browser: https://arc.net
- LM Studio: https://lmstudio.ai
- Jan.ai: https://jan.ai

---

**Document Version**: 1.0
**Last Updated**: 2025-01-15
**Status**: Initial specification

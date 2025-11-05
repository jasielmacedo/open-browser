# Open Browser

A Chromium-based browser with integrated local LLM capabilities for intelligent web interaction.

## Features

### Currently Available
- 🌐 Full-featured Chromium browser with multi-tab support
- 📑 Tab management with keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+Tab)
- 🔍 Navigation controls (back, forward, reload, home)
- 📚 History tracking with searchable sidebar
- ⭐ Bookmarks management system
- 🎯 Context menus with right-click support
- ⚙️ Tab suspension for better memory management
- 🔐 Comprehensive security hardening
- 🛠️ Developer tools integration (F12)
- 📄 Page printing and source viewing
- 🔎 Zoom controls (Ctrl +/-/0)
- 🤖 Ollama/LLM integration with streaming inference
- 💬 Chat sidebar for AI conversations
- ⚡ Real-time model management (list, download, delete)

### Planned Features
- 🖼️ Vision model integration for screenshot analysis
- 📊 AI-powered page summarization and content extraction
- 📥 Model management UI with progress tracking
- 🏷️ Smart bookmarking with AI categorization
- 🔍 Semantic search across browsing history

## Tech Stack

- **Electron** - Desktop app framework with embedded Chromium
- **React + TypeScript** - UI components with modern hooks
- **Vite** - Fast build tool with Hot Module Replacement
- **Tailwind CSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **Better-SQLite3** - Local database for history and bookmarks
- **Axios** - HTTP client for Ollama API communication
- **ESLint + Prettier** - Code quality and formatting
- **Husky** - Git hooks for pre-commit checks
- **Ollama** - Local LLM inference engine

## Development

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or pnpm
- Ollama installed ([ollama.com](https://ollama.com)) - Required for AI features

### Getting Started

```bash
# Install dependencies
npm install

# Start Ollama (required for AI features)
ollama serve

# Pull a model (optional, for testing AI features)
ollama pull llama2

# Start development server
npm run dev

# Build for production
npm run build

# Package as distributable
npm run package
```

## Project Structure

```
open-browser/
├── src/
│   ├── main/              # Electron main process
│   │   ├── ipc/          # IPC handlers for renderer communication
│   │   ├── services/     # Backend services (database, ollama)
│   │   └── utils/        # Validation and utilities
│   ├── renderer/          # React UI
│   │   ├── components/   # React components (Browser, Chat, etc.)
│   │   ├── store/        # Zustand state management (browser, chat, models)
│   │   └── services/     # Frontend services
│   └── shared/           # Shared types and utilities
├── .github/              # GitHub configuration and workflows
└── TECH_BRIEFING.md     # Comprehensive technical documentation
```

## Documentation

See [TECH_BRIEFING.md](./TECH_BRIEFING.md) for comprehensive technical documentation including:
- Architecture diagrams
- API integration patterns
- Model registry format
- Security considerations
- Performance optimization

## Current Status

🚀 **Active Development** - Core browser features implemented, AI integration in progress

### Completed
- [x] Electron + React + TypeScript setup
- [x] Vite build configuration with HMR
- [x] Security hardening implementation
- [x] Browser UI with navigation and multi-tab support
- [x] Tab management (create, close, switch, suspend)
- [x] History tracking and searchable sidebar
- [x] Bookmarks management system
- [x] SQLite database integration
- [x] Context menus and keyboard shortcuts
- [x] Code quality tooling (ESLint, Prettier, Husky)
- [x] CI/CD with GitHub Actions
- [x] Ollama service integration with auto-start capability
- [x] Chat interface with streaming message support
- [x] Model management (list, pull, delete via API)
- [x] IPC handlers for secure LLM operations
- [x] Chat and Model state management with Zustand

### In Progress / Planned
- [ ] Model management UI with download progress tracking
- [ ] Vision model integration for screenshot analysis
- [ ] Content capture service for page context extraction
- [ ] AI-powered page summarization with readability
- [ ] Smart bookmarking with AI categorization
- [ ] Model registry with pre-configured models

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + T` | New tab |
| `Ctrl/Cmd + W` | Close current tab |
| `Ctrl + Tab` | Switch to next tab |
| `Ctrl + Shift + Tab` | Switch to previous tab |
| `Ctrl/Cmd + R` or `F5` | Reload page |
| `Ctrl/Cmd + H` | Toggle history sidebar |
| `Ctrl/Cmd + B` | Toggle bookmarks sidebar |
| `Alt + Left` | Go back |
| `Alt + Right` | Go forward |
| `Ctrl/Cmd + Plus` | Zoom in |
| `Ctrl/Cmd + Minus` | Zoom out |
| `Ctrl/Cmd + 0` | Reset zoom |
| `Ctrl/Cmd + P` | Print page |
| `Ctrl/Cmd + U` | View page source |
| `F12` | Open developer tools |
| `Escape` | Stop page loading |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting and formatting: `npm run lint:fix && npm run format`
5. Commit your changes with a descriptive message
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

The project uses:
- **ESLint** for code linting
- **Prettier** for code formatting
- **Husky** for pre-commit hooks
- **lint-staged** for running checks on staged files

All PRs must pass the automated checks before merging.

## License

MIT

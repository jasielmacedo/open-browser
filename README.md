# Open Browser

A Chromium-based browser with integrated local LLM capabilities for intelligent web interaction.

## Features (Planned)

- 🌐 Full-featured Chromium browser
- 🤖 Local multi-modal vision LLMs (no cloud dependency)
- 💬 Chat interface for page analysis and interaction
- 📥 Model management with downloads from Hugging Face
- 🔒 Privacy-first (all inference happens locally)
- ⚡ Powered by Ollama for efficient inference

## Tech Stack

- **Electron** - Desktop app framework with embedded Chromium
- **React + TypeScript** - UI components
- **Vite** - Fast build tool with HMR
- **Tailwind CSS** - Utility-first styling
- **Ollama** - Local LLM inference engine

## Development

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or pnpm
- Ollama installed ([ollama.com](https://ollama.com))

### Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Package as distributable
npm run package
```

## Project Structure

```
browser-llm/
├── src/
│   ├── main/          # Electron main process (Node.js)
│   ├── renderer/      # React UI (Chromium renderer)
│   └── shared/        # Shared types and utilities
├── resources/         # App icons and assets
└── TECH_BRIEFING.md  # Comprehensive technical documentation
```

## Documentation

See [TECH_BRIEFING.md](./TECH_BRIEFING.md) for comprehensive technical documentation including:
- Architecture diagrams
- API integration patterns
- Model registry format
- Security considerations
- Performance optimization

## Current Status

🚧 **In Development** - Initial project setup complete

- [x] Electron + React + TypeScript setup
- [x] Vite build configuration
- [x] Basic window with security hardening
- [ ] Browser UI (navigation, tabs)
- [ ] Ollama integration
- [ ] Model management system
- [ ] Chat interface
- [ ] Vision model integration

## License

MIT

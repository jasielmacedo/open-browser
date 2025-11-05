# Scripts

This directory contains utility scripts for the Browser-LLM project.

## download-ollama.js

Downloads and extracts Ollama binaries for bundling with the application.

### Usage

```bash
# Automatically run during npm install
npm install

# Manually run the script
npm run setup:ollama

# Or directly
node scripts/download-ollama.js
```

### What it does

1. Downloads Ollama v0.12.9 binaries from GitHub releases
2. Extracts them to `resources/bin/win32/` and `resources/bin/darwin/`
3. Cleans up downloaded zip archives
4. Skips download if binaries already exist

### Downloaded Files

**Windows (x64):**

- `resources/bin/win32/ollama.exe` - Main executable (33 MB)
- `resources/bin/win32/lib/ollama/` - Required DLLs and CUDA libraries

**macOS (Universal):**

- `resources/bin/darwin/Ollama.app/` - Application bundle (59 MB)
- Supports both Intel and Apple Silicon

### Total Size

- Windows: ~1.8 GB (includes CUDA 12/13, ROCm support)
- macOS: ~46 MB

### Updating Ollama

To update to a newer version:

1. Edit `download-ollama.js` and change `OLLAMA_VERSION` constant
2. Delete `resources/bin/` directory
3. Run `npm run setup:ollama`

### Troubleshooting

**Download fails:**

- Check internet connection
- Verify GitHub releases URL is accessible
- Try again - the script will resume from where it left off

**Extract fails:**

- Windows: Ensure PowerShell is available
- macOS/Linux: Ensure `unzip` command is installed

**Permission errors:**

- Run with appropriate permissions to create directories
- Check that `resources/` directory is writable

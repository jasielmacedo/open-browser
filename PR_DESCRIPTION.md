# Pull Request: Add Download Manager with Save Image As Feature

## Description

This PR implements a comprehensive download manager system for user-initiated file downloads, completely separate from the existing model download functionality. Users can now download files, manage their downloads, and save images with a "Save As" dialog.

## Type of Change

- [x] New feature (non-breaking change that adds functionality)

## Changes Made

### Core Download Infrastructure
- **Download Service** (`src/main/services/download.ts`): New service to handle all download operations including pause, resume, cancel, and file management
- **Database Schema**: Added `downloads` table to SQLite database to track download history and state
- **Download Settings**: Added settings for default download folder and download preferences

### Download Manager Window
- **Standalone Window**: Created a dedicated download manager window that opens independently of the main browser window
- **Download Manager UI** (`src/renderer/components/Downloads/DownloadManager.tsx`): Full-featured interface showing:
  - All downloads (active, completed, failed, cancelled)
  - Real-time progress bars for active downloads
  - Pause/Resume/Cancel controls for in-progress downloads
  - Open file and show in folder actions for completed downloads
  - Filter tabs (All, Active, Completed)
  - Settings to choose default download folder

### User Interface Integration
- **Three-Dot Menu**: Added "Downloads" option to the main navigation menu to open the download manager
- **Image Context Menu**: Added "Save Image As..." and "Copy Image" options when right-clicking on images in webviews
- **Route Handling**: Updated App.tsx to support hash-based routing for the download manager window

### IPC Communication
- **16 New IPC Handlers**: Added handlers for all download operations:
  - `download:getAll`, `download:getActive`
  - `download:pause`, `download:resume`, `download:cancel`
  - `download:open`, `download:showInFolder`, `download:delete`
  - `download:clear`, `download:getDefaultFolder`, `download:chooseFolder`
  - `download:chooseSaveLocation`, `download:openManager`, `download:saveImage`
- **Real-time Updates**: Download progress and completion events are broadcast to all windows

### Features
- **Persistent Downloads**: Downloads continue even if the main window is closed
- **Progress Tracking**: Real-time progress updates with bytes downloaded and percentage
- **State Management**: Tracks download state (in_progress, completed, paused, cancelled, failed)
- **File Management**: Open files, show in folder, and delete from history
- **Security**: Filename sanitization and URL validation for all downloads
- **Settings**: Configurable default download folder with folder picker dialog

## Testing

- [x] Tested locally in development mode
- [x] Manually tested affected features:
  - Opening download manager from menu
  - Downloading files from web pages
  - Save Image As functionality
  - Pause/Resume/Cancel operations
  - Changing default download folder
  - Downloads persisting after window close

## Checklist

- [x] My code follows the project's code style (ESLint and Prettier)
- [x] I have performed a self-review of my code
- [x] I have commented my code where necessary
- [x] My changes generate no new warnings or errors
- [x] I have tested my changes locally

## Additional Notes

### Architecture Decisions
- **Separation of Concerns**: The download manager is completely separate from the model download system to avoid conflicts and maintain clarity
- **Database Integration**: Uses the existing SQLite database service for persistence
- **Window Management**: Download manager runs in its own window to allow users to manage downloads while browsing

### Files Modified
- `src/main/index.ts`: Added download service integration and download manager window creation (lines 8, 19, 160-210, 451-487)
- `src/main/services/database.ts`: Added Download interface and database operations (35-47, 168-186, 581-685)
- `src/main/ipc/handlers.ts`: Added 16 new IPC handlers for download operations (3, 12-13, 931-1106)
- `src/main/preload.ts`: Exposed download APIs to renderer process (50-63, 78-79)
- `src/renderer/App.tsx`: Added routing for download manager (1-3, 5-23)
- `src/renderer/components/Browser/NavigationBar.tsx`: Added Downloads menu item (483-502)

### Files Created
- `src/main/services/download.ts`: Complete download service implementation (260 lines)
- `src/renderer/components/Downloads/DownloadManager.tsx`: Full download manager UI (500+ lines)

### Key Features Summary
1. ✅ Separate download system (not interfering with model downloads)
2. ✅ Standalone download manager window
3. ✅ Save Image As functionality in context menus
4. ✅ Persistent downloads (continue when window closes)
5. ✅ Configurable default download folder
6. ✅ Real-time progress tracking
7. ✅ Pause/Resume/Cancel operations
8. ✅ SQLite database integration for settings and history

### Future Enhancements
- Download queue management
- Download speed throttling
- Batch download operations
- Download history search and filtering
- Keyboard shortcuts for download manager

---

**PR Link**: https://github.com/jasielmacedo/open-browser/pull/new/claude/add-download-manager-window-011CUqpC5zYtPzuRoq7kPTA1

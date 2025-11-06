import { app, BrowserWindow, dialog, DownloadItem } from 'electron';
import path from 'path';
import fs from 'fs';
import { databaseService, Download } from './database';

class DownloadService {
  private activeDownloads: Map<number, DownloadItem> = new Map();
  private downloadIdCounter = 0;

  /**
   * Get the default download folder
   */
  getDefaultDownloadFolder(): string {
    const savedFolder = databaseService.getSetting('default-download-folder');
    if (savedFolder && fs.existsSync(savedFolder)) {
      return savedFolder;
    }
    return app.getPath('downloads');
  }

  /**
   * Set the default download folder
   */
  setDefaultDownloadFolder(folder: string): void {
    if (!fs.existsSync(folder)) {
      throw new Error('Folder does not exist');
    }
    databaseService.setSetting('default-download-folder', folder);
  }

  /**
   * Choose a download folder using dialog
   */
  async chooseDownloadFolder(window: BrowserWindow | null): Promise<string | null> {
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Download Folder',
      defaultPath: this.getDefaultDownloadFolder(),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }

  /**
   * Choose save location for a specific file
   */
  async chooseSaveLocation(
    window: BrowserWindow | null,
    defaultFilename: string
  ): Promise<string | null> {
    if (!window) return null;

    const result = await dialog.showSaveDialog(window, {
      title: 'Save As',
      defaultPath: path.join(this.getDefaultDownloadFolder(), defaultFilename),
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  }

  /**
   * Sanitize filename to prevent security issues
   */
  sanitizeFilename(filename: string): string {
    // Remove path separators and dangerous characters
    // eslint-disable-next-line no-control-regex
    let sanitized = path.basename(filename).replace(/[<>:"|?*\x00-\x1F]/g, '_');

    // Prevent hidden files and ensure filename is not empty
    if (!sanitized || sanitized.startsWith('.')) {
      sanitized = 'download_' + Date.now();
    }

    // Limit filename length to prevent issues
    if (sanitized.length > 255) {
      const ext = path.extname(sanitized);
      sanitized = sanitized.substring(0, 255 - ext.length) + ext;
    }

    return sanitized;
  }

  /**
   * Get unique filename if file already exists
   */
  getUniqueFilename(directory: string, filename: string): string {
    let finalPath = path.join(directory, filename);
    let counter = 1;
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);

    while (fs.existsSync(finalPath)) {
      const newFilename = `${base} (${counter})${ext}`;
      finalPath = path.join(directory, newFilename);
      counter++;
    }

    return finalPath;
  }

  /**
   * Handle download item and save to database
   */
  handleDownload(item: DownloadItem, savePath: string, webContents: Electron.WebContents): number {
    const filename = path.basename(savePath);
    const downloadId = ++this.downloadIdCounter;

    // Create download record in database
    const dbId = databaseService.addDownload({
      url: item.getURL(),
      filename,
      savePath,
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'in_progress',
      mimeType: item.getMimeType(),
      startTime: Date.now(),
    });

    this.activeDownloads.set(dbId, item);

    // Set the save path
    item.setSavePath(savePath);

    // Track progress
    item.on('updated', (_event, state) => {
      const updates: Partial<Download> = {
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      };

      if (state === 'interrupted') {
        updates.state = 'paused';
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          updates.state = 'paused';
        } else {
          updates.state = 'in_progress';
        }
      }

      databaseService.updateDownload(dbId, updates);

      // Send progress to all windows
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('download:progress', {
          id: dbId,
          filename,
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
          state: updates.state,
        });
      });
    });

    // Handle completion
    item.once('done', (_event, state) => {
      const updates: Partial<Download> = {
        endTime: Date.now(),
      };

      if (state === 'completed') {
        updates.state = 'completed';
        updates.receivedBytes = item.getTotalBytes();
      } else if (state === 'cancelled') {
        updates.state = 'cancelled';
      } else if (state === 'interrupted') {
        updates.state = 'failed';
        updates.error = 'Download was interrupted';
      }

      databaseService.updateDownload(dbId, updates);
      this.activeDownloads.delete(dbId);

      // Send completion to all windows
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('download:complete', {
          id: dbId,
          filename,
          savePath,
          state: updates.state,
        });
      });
    });

    return dbId;
  }

  /**
   * Pause a download
   */
  pauseDownload(id: number): boolean {
    const item = this.activeDownloads.get(id);
    if (item && item.canResume()) {
      item.pause();
      databaseService.updateDownload(id, { state: 'paused' });
      return true;
    }
    return false;
  }

  /**
   * Resume a download
   */
  resumeDownload(id: number): boolean {
    const item = this.activeDownloads.get(id);
    if (item && item.canResume()) {
      item.resume();
      databaseService.updateDownload(id, { state: 'in_progress' });
      return true;
    }
    return false;
  }

  /**
   * Cancel a download
   */
  cancelDownload(id: number): boolean {
    const item = this.activeDownloads.get(id);
    if (item) {
      item.cancel();
      databaseService.updateDownload(id, { state: 'cancelled', endTime: Date.now() });
      this.activeDownloads.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Open download in system file explorer
   */
  openDownload(id: number): boolean {
    const download = databaseService.getDownloads(100).find((d) => d.id === id);
    if (download && download.state === 'completed' && fs.existsSync(download.savePath)) {
      shell.openPath(download.savePath);
      return true;
    }
    return false;
  }

  /**
   * Show download in folder
   */
  showInFolder(id: number): boolean {
    const download = databaseService.getDownloads(100).find((d) => d.id === id);
    if (download && fs.existsSync(download.savePath)) {
      shell.showItemInFolder(download.savePath);
      return true;
    }
    return false;
  }

  /**
   * Get all downloads
   */
  getDownloads(limit = 100, offset = 0): Download[] {
    return databaseService.getDownloads(limit, offset);
  }

  /**
   * Get active downloads
   */
  getActiveDownloads(): Download[] {
    return databaseService.getActiveDownloads();
  }

  /**
   * Delete download record (not the file)
   */
  deleteDownload(id: number): void {
    this.activeDownloads.delete(id);
    databaseService.deleteDownload(id);
  }

  /**
   * Clear completed downloads
   */
  clearDownloads(olderThan?: number): void {
    databaseService.clearDownloads(olderThan);
  }
}

export const downloadService = new DownloadService();
export { shell };

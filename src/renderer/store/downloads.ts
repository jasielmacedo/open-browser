import { create } from 'zustand';
import type { PullProgress } from '../../shared/types';

export interface DownloadLayer {
  digest: string;
  status: string;
  completed: number;
  total: number;
  progressPercent: number;
}

export interface ModelDownload {
  modelName: string;
  overallStatus: string;
  overallProgress: number;
  layers: Map<string, DownloadLayer>;
  error?: string;
  isPaused: boolean;
  startedAt: number;
  completedAt?: number;
}

interface DownloadState {
  downloads: Map<string, ModelDownload>;
  modelsFolder: string | null;
  addDownload: (modelName: string) => void;
  updateDownload: (modelName: string, progress: PullProgress) => void;
  pauseDownload: (modelName: string) => void;
  resumeDownload: (modelName: string) => void;
  cancelDownload: (modelName: string) => void;
  removeDownload: (modelName: string) => void;
  setModelsFolder: (folder: string) => void;
  getActiveDownloads: () => ModelDownload[];
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: new Map(),
  modelsFolder: null,

  addDownload: (modelName: string) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      newDownloads.set(modelName, {
        modelName,
        overallStatus: 'starting',
        overallProgress: 0,
        layers: new Map(),
        isPaused: false,
        startedAt: Date.now(),
      });
      return { downloads: newDownloads };
    });
  },

  updateDownload: (modelName: string, progress: PullProgress) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      const download = newDownloads.get(modelName);

      if (!download) {
        // Create download if it doesn't exist
        const newDownload: ModelDownload = {
          modelName,
          overallStatus: progress.status,
          overallProgress: 0,
          layers: new Map(),
          isPaused: false,
          startedAt: Date.now(),
        };
        newDownloads.set(modelName, newDownload);
        return { downloads: newDownloads };
      }

      // Update layer if digest is present
      if (progress.digest) {
        const layers = new Map(download.layers);
        const progressPercent = progress.total
          ? Math.round(((progress.completed || 0) / progress.total) * 100)
          : 0;

        layers.set(progress.digest, {
          digest: progress.digest,
          status: progress.status,
          completed: progress.completed || 0,
          total: progress.total || 0,
          progressPercent,
        });

        // Calculate overall progress from all layers
        let totalBytes = 0;
        let completedBytes = 0;
        layers.forEach((layer) => {
          totalBytes += layer.total;
          completedBytes += layer.completed;
        });

        const overallProgress =
          totalBytes > 0 ? Math.round((completedBytes / totalBytes) * 100) : 0;

        download.layers = layers;
        download.overallProgress = overallProgress;
      }

      // Update status
      download.overallStatus = progress.status;

      // Handle completion
      if (progress.status === 'success' || progress.status === 'complete') {
        download.overallProgress = 100;
        download.completedAt = Date.now();
      }

      // Handle error
      if (progress.error) {
        download.error = progress.error;
      }

      newDownloads.set(modelName, download);
      return { downloads: newDownloads };
    });
  },

  pauseDownload: (modelName: string) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      const download = newDownloads.get(modelName);
      if (download) {
        download.isPaused = true;
        newDownloads.set(modelName, download);
      }
      return { downloads: newDownloads };
    });
  },

  resumeDownload: (modelName: string) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      const download = newDownloads.get(modelName);
      if (download) {
        download.isPaused = false;
        newDownloads.set(modelName, download);
      }
      return { downloads: newDownloads };
    });
  },

  cancelDownload: (modelName: string) => {
    // Note: This will need to call an IPC handler to actually cancel the download
    set((state) => {
      const newDownloads = new Map(state.downloads);
      newDownloads.delete(modelName);
      return { downloads: newDownloads };
    });
  },

  removeDownload: (modelName: string) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      newDownloads.delete(modelName);
      return { downloads: newDownloads };
    });
  },

  setModelsFolder: (folder: string) => {
    set({ modelsFolder: folder });
  },

  getActiveDownloads: () => {
    const downloads = get().downloads;
    return Array.from(downloads.values()).filter(
      (d) => d.overallStatus !== 'success' && d.overallStatus !== 'complete'
    );
  },
}));

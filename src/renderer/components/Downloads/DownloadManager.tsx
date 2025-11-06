import React, { useState, useEffect } from 'react';

interface Download {
  id: number;
  url: string;
  filename: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'in_progress' | 'completed' | 'paused' | 'cancelled' | 'failed';
  mimeType?: string;
  startTime: number;
  endTime?: number;
  error?: string;
}

export const DownloadManager: React.FC = () => {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [defaultFolder, setDefaultFolder] = useState<string>('');

  // Load downloads
  const loadDownloads = async () => {
    try {
      const allDownloads = await window.electron.invoke('download:getAll', 100, 0);
      setDownloads(allDownloads);
    } catch (error) {
      console.error('Failed to load downloads:', error);
    }
  };

  // Load default folder
  const loadDefaultFolder = async () => {
    try {
      const folder = await window.electron.invoke('download:getDefaultFolder');
      setDefaultFolder(folder);
    } catch (error) {
      console.error('Failed to load default folder:', error);
    }
  };

  useEffect(() => {
    loadDownloads();
    loadDefaultFolder();

    // Listen for download progress
    const unsubProgress = window.electron.on('download:progress', () => {
      loadDownloads();
    });

    // Listen for download completion
    const unsubComplete = window.electron.on('download:complete', () => {
      loadDownloads();
    });

    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, []);

  // Filter downloads
  const filteredDownloads = downloads.filter((download) => {
    if (filter === 'active') {
      return download.state === 'in_progress' || download.state === 'paused';
    } else if (filter === 'completed') {
      return download.state === 'completed';
    }
    return true;
  });

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Format time
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  // Calculate progress percentage
  const getProgress = (download: Download): number => {
    if (download.totalBytes === 0) return 0;
    return Math.round((download.receivedBytes / download.totalBytes) * 100);
  };

  // Handle pause/resume
  const handlePauseResume = async (download: Download) => {
    try {
      if (download.state === 'in_progress') {
        await window.electron.invoke('download:pause', download.id);
      } else if (download.state === 'paused') {
        await window.electron.invoke('download:resume', download.id);
      }
      loadDownloads();
    } catch (error) {
      console.error('Failed to pause/resume download:', error);
    }
  };

  // Handle cancel
  const handleCancel = async (id: number) => {
    try {
      await window.electron.invoke('download:cancel', id);
      loadDownloads();
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  };

  // Handle open
  const handleOpen = async (id: number) => {
    try {
      await window.electron.invoke('download:open', id);
    } catch (error) {
      console.error('Failed to open download:', error);
    }
  };

  // Handle show in folder
  const handleShowInFolder = async (id: number) => {
    try {
      await window.electron.invoke('download:showInFolder', id);
    } catch (error) {
      console.error('Failed to show in folder:', error);
    }
  };

  // Handle delete
  const handleDelete = async (id: number) => {
    try {
      await window.electron.invoke('download:delete', id);
      loadDownloads();
    } catch (error) {
      console.error('Failed to delete download:', error);
    }
  };

  // Handle clear completed
  const handleClearCompleted = async () => {
    try {
      await window.electron.invoke('download:clear');
      loadDownloads();
    } catch (error) {
      console.error('Failed to clear downloads:', error);
    }
  };

  // Handle choose folder
  const handleChooseFolder = async () => {
    try {
      const folder = await window.electron.invoke('download:chooseFolder');
      if (folder) {
        setDefaultFolder(folder);
      }
    } catch (error) {
      console.error('Failed to choose folder:', error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h1 className="text-2xl font-bold">Download Manager</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearCompleted}
            className="px-3 py-1.5 text-sm rounded bg-accent hover:bg-accent/80 transition-colors"
          >
            Clear Completed
          </button>
        </div>
      </div>

      {/* Settings */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Default folder:</span>
            <span className="text-sm font-mono">{defaultFolder}</span>
          </div>
          <button
            onClick={handleChooseFolder}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Change Folder
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 p-4 border-b border-border">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded transition-colors ${
            filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
          }`}
        >
          All ({downloads.length})
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 rounded transition-colors ${
            filter === 'active' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
          }`}
        >
          Active (
          {downloads.filter((d) => d.state === 'in_progress' || d.state === 'paused').length})
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded transition-colors ${
            filter === 'completed'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80'
          }`}
        >
          Completed ({downloads.filter((d) => d.state === 'completed').length})
        </button>
      </div>

      {/* Downloads list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredDownloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
              />
            </svg>
            <p className="text-lg">No downloads</p>
            <p className="text-sm mt-1">
              {filter === 'all'
                ? 'Start downloading files to see them here'
                : filter === 'active'
                ? 'No active downloads'
                : 'No completed downloads'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDownloads.map((download) => (
              <div
                key={download.id}
                className="p-4 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium truncate">{download.filename}</h3>
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          download.state === 'completed'
                            ? 'bg-green-500/20 text-green-400'
                            : download.state === 'in_progress'
                            ? 'bg-blue-500/20 text-blue-400'
                            : download.state === 'paused'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : download.state === 'failed'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {download.state}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {download.savePath}
                    </p>
                    {download.error && (
                      <p className="text-xs text-red-400 mt-1">{download.error}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {download.state === 'in_progress' || download.state === 'paused' ? (
                      <>
                        <button
                          onClick={() => handlePauseResume(download)}
                          className="p-2 rounded hover:bg-accent transition-colors"
                          title={download.state === 'paused' ? 'Resume' : 'Pause'}
                        >
                          {download.state === 'paused' ? (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleCancel(download.id!)}
                          className="p-2 rounded hover:bg-accent transition-colors"
                          title="Cancel"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </>
                    ) : download.state === 'completed' ? (
                      <>
                        <button
                          onClick={() => handleOpen(download.id!)}
                          className="p-2 rounded hover:bg-accent transition-colors"
                          title="Open"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleShowInFolder(download.id!)}
                          className="p-2 rounded hover:bg-accent transition-colors"
                          title="Show in folder"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                            />
                          </svg>
                        </button>
                      </>
                    ) : null}
                    <button
                      onClick={() => handleDelete(download.id!)}
                      className="p-2 rounded hover:bg-accent transition-colors text-red-400 hover:text-red-300"
                      title="Remove from list"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {(download.state === 'in_progress' || download.state === 'paused') && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>
                        {formatBytes(download.receivedBytes)} / {formatBytes(download.totalBytes)}
                      </span>
                      <span>{getProgress(download)}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          download.state === 'paused' ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${getProgress(download)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="mt-2 text-xs text-muted-foreground">
                  <span>Started: {formatTime(download.startTime)}</span>
                  {download.endTime && (
                    <span className="ml-4">Completed: {formatTime(download.endTime)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';

export interface Download {
  id: number;
  filename: string;
  url: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'in_progress' | 'completed' | 'cancelled' | 'interrupted';
  savePath: string;
  startTime: number;
  endTime?: number;
}

interface DownloadDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
}

export const DownloadDropdown: React.FC<DownloadDropdownProps> = ({
  isOpen,
  onClose,
  anchorRef,
}) => {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load downloads
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      loadDownloads();
      // Poll for updates every 2 seconds when open (less aggressive)
      const interval = setInterval(loadDownloads, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const loadDownloads = async () => {
    try {
      const result = await window.electron.invoke('download:getAll', 10, 0);
      console.log('Downloads loaded:', result);
      setDownloads(result || []);
    } catch (error) {
      console.error('Failed to load downloads:', error);
      setDownloads([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose, anchorRef]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatSpeed = (bytes: number, startTime: number): string => {
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    if (elapsed === 0) return '0 B/s';
    const speed = bytes / elapsed;
    return `${formatBytes(speed)}/s`;
  };

  const getProgress = (download: Download): number => {
    if (download.totalBytes === 0) return 0;
    return (download.receivedBytes / download.totalBytes) * 100;
  };

  const handleOpenFile = async (download: Download) => {
    try {
      await window.electron.invoke('download:open', download.id);
    } catch (error) {
      console.error('Failed to open download:', error);
    }
  };

  const handleShowInFolder = async (download: Download) => {
    try {
      await window.electron.invoke('download:showInFolder', download.id);
    } catch (error) {
      console.error('Failed to show in folder:', error);
    }
  };

  const handleOpenDownloadManager = () => {
    window.location.hash = '#downloads';
    onClose();
  };

  if (!isOpen) return null;

  // Calculate dropdown position
  const anchorRect = anchorRef.current?.getBoundingClientRect();
  const dropdownStyle: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        top: anchorRect.bottom + 8,
        right: window.innerWidth - anchorRect.right,
        zIndex: 1000,
      }
    : {};

  return (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="w-96 bg-card border border-border rounded-lg shadow-xl animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">Downloads</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-accent rounded transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Downloads List */}
      <div className="max-h-96 overflow-y-auto">
        {loading && downloads.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
            Loading...
          </div>
        ) : downloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <svg
              className="w-12 h-12 text-muted-foreground mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
              />
            </svg>
            <p className="text-sm text-muted-foreground">No downloads yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Downloads will appear here when you download files
            </p>
          </div>
        ) : (
          downloads.map((download) => (
            <div
              key={download.id}
              className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* File Icon */}
                <div className="flex-shrink-0 mt-1">
                  <svg
                    className="w-8 h-8 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </div>

                {/* Download Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" title={download.filename}>
                    {download.filename}
                  </div>

                  {download.state === 'in_progress' && (
                    <>
                      {/* Progress Bar */}
                      <div className="mt-2 mb-1">
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${getProgress(download)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                        <span>
                          {formatBytes(download.receivedBytes)} / {formatBytes(download.totalBytes)}
                        </span>
                        <span>{formatSpeed(download.receivedBytes, download.startTime)}</span>
                      </div>
                    </>
                  )}

                  {download.state === 'completed' && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-green-600 dark:text-green-400">
                        ✓ Complete · {formatBytes(download.totalBytes)}
                      </span>
                    </div>
                  )}

                  {(download.state === 'cancelled' || download.state === 'interrupted') && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      ✗ {download.state === 'cancelled' ? 'Cancelled' : 'Failed'}
                    </div>
                  )}

                  {/* Actions */}
                  {download.state === 'completed' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleOpenFile(download)}
                        className="text-xs text-primary hover:underline"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleShowInFolder(download)}
                        className="text-xs text-primary hover:underline"
                      >
                        Show in folder
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {downloads.length > 0 && (
        <div className="px-4 py-3 border-t border-border">
          <button
            onClick={handleOpenDownloadManager}
            className="w-full text-sm text-primary hover:underline text-center"
          >
            Show all downloads
          </button>
        </div>
      )}
    </div>
  );
};

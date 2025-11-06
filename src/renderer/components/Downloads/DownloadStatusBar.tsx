import React, { useState } from 'react';
import { useDownloadStore, type ModelDownload } from '../../store/downloads';

export const DownloadStatusBar: React.FC = () => {
  const { downloads, cancelDownload, modelsFolder } = useDownloadStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const activeDownloads = Array.from(downloads.values()).filter(
    (d) => d.overallStatus !== 'success' && d.overallStatus !== 'complete'
  );

  if (activeDownloads.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-40">
      {/* Collapsed View */}
      {!isExpanded && (
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-primary animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span className="text-sm font-medium">
                Downloading {activeDownloads.length} model{activeDownloads.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* First download progress */}
            {activeDownloads[0] && (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-muted-foreground truncate">
                  {activeDownloads[0].modelName}
                </span>
                <div className="flex-1 max-w-xs bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary h-full transition-all duration-300 rounded-full"
                    style={{ width: `${activeDownloads[0].overallProgress}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {activeDownloads[0].overallProgress}%
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsExpanded(true)}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="Expand"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div className="max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-accent/50">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span className="text-sm font-medium">Active Downloads</span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Collapse"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>

          <div className="divide-y divide-border">
            {activeDownloads.map((download) => (
              <DownloadItem
                key={download.modelName}
                download={download}
                onCancel={() => cancelDownload(download.modelName)}
              />
            ))}
          </div>

          {/* Folder info */}
          {modelsFolder && (
            <div className="px-4 py-2 bg-accent/30 border-t border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Installing to: <span className="font-mono">{modelsFolder}</span>
                </span>
                <button
                  onClick={async () => {
                    await window.electron.invoke('models:openFolder', modelsFolder);
                  }}
                  className="text-primary hover:underline"
                >
                  Open Folder
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface DownloadItemProps {
  download: ModelDownload;
  onCancel: () => void;
}

const DownloadItem: React.FC<DownloadItemProps> = ({ download, onCancel }) => {
  const [showLayers, setShowLayers] = useState(false);
  const layers = Array.from(download.layers.values());

  const handleCancel = async () => {
    try {
      await window.electron.invoke('ollama:cancelPull', download.modelName);
      onCancel();
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium truncate">{download.modelName}</span>
            <span className="text-xs text-muted-foreground">{download.overallStatus}</span>
            {download.error && (
              <span className="text-xs text-red-500" title={download.error}>
                Error
              </span>
            )}
          </div>

          {/* Overall progress */}
          <div className="space-y-1 mb-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Overall Progress</span>
              <span>{download.overallProgress}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${download.overallProgress}%` }}
              />
            </div>
          </div>

          {/* Layer toggle */}
          {layers.length > 0 && (
            <button
              onClick={() => setShowLayers(!showLayers)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showLayers ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              {showLayers ? 'Hide' : 'Show'} {layers.length} layer{layers.length > 1 ? 's' : ''}
            </button>
          )}

          {/* Layers list */}
          {showLayers && layers.length > 0 && (
            <div className="mt-2 space-y-2 pl-4 border-l-2 border-border">
              {layers.map((layer, index) => (
                <div key={layer.digest} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Layer {index + 1} - {layer.status}
                    </span>
                    <span className="text-muted-foreground">{layer.progressPercent}%</span>
                  </div>
                  <div className="w-full bg-secondary/50 rounded-full h-1">
                    <div
                      className="bg-primary/70 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${layer.progressPercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1">
          {download.isPaused ? (
            <button
              onClick={() => {
                // Resume functionality - would need IPC handler
              }}
              className="p-1.5 hover:bg-accent rounded transition-colors"
              title="Resume"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => {
                // Pause functionality - would need IPC handler
              }}
              className="p-1.5 hover:bg-accent rounded transition-colors"
              title="Pause"
              disabled
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 9v6m4-6v6"
                />
              </svg>
            </button>
          )}
          <button
            onClick={handleCancel}
            className="p-1.5 hover:bg-accent rounded transition-colors text-red-500"
            title="Cancel"
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
      </div>
    </div>
  );
};

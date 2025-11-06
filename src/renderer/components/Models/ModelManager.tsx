import React, { useState, useEffect } from 'react';
import { useModelStore } from '../../store/models';
import { useDownloadStore } from '../../store/downloads';
import { InstalledModels } from './InstalledModels';
import { AvailableModels } from './AvailableModels';

interface OllamaServiceStatus {
  isRunning: boolean;
  processStats?: {
    pid: number;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    cpu: number;
    uptime: number;
  };
  error?: string;
}

export const ModelManager: React.FC = () => {
  const { isModelManagerOpen, setIsModelManagerOpen, refreshModels, isOllamaRunning } =
    useModelStore();
  const { modelsFolder, setModelsFolder } = useDownloadStore();
  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('installed');
  const [serviceStatus, setServiceStatus] = useState<OllamaServiceStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [showServiceDetails, setShowServiceDetails] = useState(false);

  const loadModelsFolder = React.useCallback(async () => {
    try {
      const folder = await window.electron.invoke('models:getFolder');
      setModelsFolder(folder);
    } catch (error) {
      console.error('Failed to get models folder:', error);
    }
  }, [setModelsFolder]);

  const loadServiceStatus = React.useCallback(async () => {
    try {
      setIsLoadingStatus(true);
      const status = await window.electron.invoke('ollama:getStatus');
      console.log('[ModelManager] Service status:', status);
      setServiceStatus(status);
    } catch (error) {
      console.error('Failed to get service status:', error);
      setServiceStatus(null);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (isModelManagerOpen) {
      refreshModels();
      // Load models folder location
      loadModelsFolder();
      // Load service status
      loadServiceStatus();

      // Poll service status every 5 seconds
      const interval = setInterval(loadServiceStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [isModelManagerOpen, refreshModels, loadModelsFolder, loadServiceStatus]);

  const handleSelectFolder = async () => {
    try {
      const folder = await window.electron.invoke('models:selectFolder');
      if (folder) {
        setModelsFolder(folder);
        // Note: User would need to restart Ollama with OLLAMA_MODELS env var
        // or we'd need to implement a way to restart with new path
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await window.electron.invoke('models:openFolder', modelsFolder || undefined);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  const handleRestartService = async () => {
    try {
      await window.electron.invoke('ollama:restart');
      // Refresh status after a delay
      setTimeout(() => {
        loadServiceStatus();
        refreshModels();
      }, 2000);
    } catch (error) {
      console.error('Failed to restart service:', error);
    }
  };

  const handleStopService = async () => {
    try {
      await window.electron.invoke('ollama:stop');
      setTimeout(loadServiceStatus, 1000);
    } catch (error) {
      console.error('Failed to stop service:', error);
    }
  };

  const handleStartService = async () => {
    try {
      await window.electron.invoke('ollama:start');
      setTimeout(() => {
        loadServiceStatus();
        refreshModels();
      }, 2000);
    } catch (error) {
      console.error('Failed to start service:', error);
    }
  };

  const handleForceKill = async () => {
    if (!confirm('Are you sure you want to force kill the Ollama process? This may cause data loss.')) {
      return;
    }
    try {
      await window.electron.invoke('ollama:forceKill');
      setTimeout(loadServiceStatus, 1000);
    } catch (error) {
      console.error('Failed to force kill:', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (!isModelManagerOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg shadow-2xl w-[90vw] h-[85vh] max-w-6xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold">Model Manager</h2>
              <p className="text-sm text-muted-foreground">
                {isOllamaRunning ? 'Manage your local AI models' : 'Ollama is not running'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsModelManagerOpen(false)}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('installed')}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'installed'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Installed Models
            {activeTab === 'installed' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('available')}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'available'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Available Models
            {activeTab === 'available' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'installed' ? <InstalledModels /> : <AvailableModels />}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          {/* Service Status Section */}
          <div className="mb-3 p-3 bg-accent/30 rounded-lg border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${serviceStatus?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
                />
                <span className="text-sm font-medium">
                  Ollama Service {serviceStatus?.isRunning ? 'Running' : 'Stopped'}
                </span>
                {isLoadingStatus && (
                  <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                )}
              </div>
              <div className="flex gap-1">
                {serviceStatus?.isRunning ? (
                  <>
                    <button
                      onClick={handleRestartService}
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                      title="Restart service"
                    >
                      Restart
                    </button>
                    <button
                      onClick={handleStopService}
                      className="px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
                      title="Stop service"
                    >
                      Stop
                    </button>
                    <button
                      onClick={handleForceKill}
                      className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                      title="Force kill (dangerous)"
                    >
                      Force Kill
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleStartService}
                    className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                    title="Start service"
                  >
                    Start
                  </button>
                )}
                <button
                  onClick={() => setShowServiceDetails(!showServiceDetails)}
                  className="px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded transition-colors"
                  title={showServiceDetails ? 'Hide details' : 'Show details'}
                >
                  {showServiceDetails ? '▲' : '▼'}
                </button>
              </div>
            </div>

            {/* Service Details */}
            {showServiceDetails && (
              <div className="mt-2 pt-2 border-t border-border/50">
                {serviceStatus?.processStats ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">PID:</span>
                      <span className="font-mono">{serviceStatus.processStats.pid}</span>
                    </div>
                    {serviceStatus.processStats.uptime > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Uptime:</span>
                        <span className="font-mono">{formatUptime(serviceStatus.processStats.uptime)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Memory:</span>
                      <span className="font-mono">{formatBytes(serviceStatus.processStats.memory.rss)}</span>
                    </div>
                    {serviceStatus.processStats.cpu > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">CPU:</span>
                        <span className="font-mono">{serviceStatus.processStats.cpu.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                ) : serviceStatus?.isRunning ? (
                  <p className="text-xs text-muted-foreground">
                    Service is running but process details unavailable
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Service is not running
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-muted-foreground">
              Manage your local AI models
            </div>
            <button
              onClick={() => setIsModelManagerOpen(false)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>

          {/* Models Folder Location */}
          {modelsFolder && (
            <div className="flex items-center gap-2 p-2 bg-accent/50 rounded-lg">
              <svg
                className="w-4 h-4 text-muted-foreground flex-shrink-0"
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
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Models folder:</p>
                <p className="text-xs font-mono truncate" title={modelsFolder}>
                  {modelsFolder}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={handleOpenFolder}
                  className="p-1.5 text-xs bg-secondary hover:bg-secondary/80 rounded transition-colors"
                  title="Open folder"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </button>
                <button
                  onClick={handleSelectFolder}
                  className="p-1.5 text-xs bg-secondary hover:bg-secondary/80 rounded transition-colors"
                  title="Change folder (requires restart)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

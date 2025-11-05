import React, { useState, useEffect } from 'react';
import { useModelStore } from '../../store/models';
import { InstalledModels } from './InstalledModels';
import { AvailableModels } from './AvailableModels';

export const ModelManager: React.FC = () => {
  const { isModelManagerOpen, setIsModelManagerOpen, refreshModels, isOllamaRunning } =
    useModelStore();
  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('installed');

  useEffect(() => {
    if (isModelManagerOpen) {
      refreshModels();
    }
  }, [isModelManagerOpen, refreshModels]);

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
        <div className="p-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div
              className={`w-2 h-2 rounded-full ${isOllamaRunning ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span>{isOllamaRunning ? 'Ollama is running' : 'Ollama is not running'}</span>
          </div>
          <button
            onClick={() => setIsModelManagerOpen(false)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

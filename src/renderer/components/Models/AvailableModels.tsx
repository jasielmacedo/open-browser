import React, { useState, useEffect } from 'react';
import { useModelStore } from '../../store/models';
import { getAvailableModels, getCapabilityBadges } from '../../../shared/modelRegistry';
import type { ModelMetadata } from '../../../shared/types';

export const AvailableModels: React.FC = () => {
  const { models, pullProgress, isPulling, setIsPulling, setPullProgress, clearPullProgress, refreshModels } = useModelStore();
  const [availableModels, setAvailableModels] = useState<ModelMetadata[]>([]);
  const [filter, setFilter] = useState<'all' | 'vision' | 'text'>('all');

  useEffect(() => {
    const available = getAvailableModels(models);
    setAvailableModels(available);
  }, [models]);

  const handlePull = async (modelName: string) => {
    setIsPulling(true);

    try {
      // Set up progress listener
      const unsubscribe = window.electron.on('ollama:pullProgress', (progress: any) => {
        setPullProgress(modelName, progress);

        // If pull completed, refresh models and clear progress
        if (progress.status === 'success' || progress.status === 'complete') {
          setTimeout(async () => {
            await refreshModels();
            clearPullProgress(modelName);
          }, 1000);
        }
      });

      // Start pull
      await window.electron.invoke('ollama:pullModel', modelName);

      // Cleanup
      unsubscribe();
    } catch (error: any) {
      console.error('Failed to pull model:', error);
      alert(`Failed to download model: ${error.message}`);
      clearPullProgress(modelName);
    } finally {
      setIsPulling(false);
    }
  };

  const filteredModels = availableModels.filter((model) => {
    if (filter === 'all') return true;
    if (filter === 'vision') return model.capabilities.vision;
    if (filter === 'text') return !model.capabilities.vision;
    return true;
  });

  const recommendedModels = filteredModels.filter((m) => m.recommended);
  const otherModels = filteredModels.filter((m) => !m.recommended);

  return (
    <div className="h-full overflow-y-auto">
      {/* Filter Tabs */}
      <div className="sticky top-0 bg-card border-b border-border px-6 py-3 flex items-center gap-2 z-10">
        <span className="text-sm text-muted-foreground mr-2">Filter:</span>
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-sm rounded transition-colors ${
            filter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary hover:bg-secondary/80'
          }`}
        >
          All Models
        </button>
        <button
          onClick={() => setFilter('vision')}
          className={`px-3 py-1.5 text-sm rounded transition-colors ${
            filter === 'vision'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary hover:bg-secondary/80'
          }`}
        >
          Vision Models
        </button>
        <button
          onClick={() => setFilter('text')}
          className={`px-3 py-1.5 text-sm rounded transition-colors ${
            filter === 'text'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary hover:bg-secondary/80'
          }`}
        >
          Text-Only Models
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Recommended Models */}
        {recommendedModels.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Recommended Models
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {recommendedModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  onPull={handlePull}
                  isPulling={isPulling}
                  progress={pullProgress.get(model.name)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Other Models */}
        {otherModels.length > 0 && (
          <div>
            {recommendedModels.length > 0 && (
              <h3 className="text-lg font-semibold mb-4">Other Models</h3>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {otherModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  onPull={handlePull}
                  isPulling={isPulling}
                  progress={pullProgress.get(model.name)}
                />
              ))}
            </div>
          </div>
        )}

        {filteredModels.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No models available with current filter</p>
          </div>
        )}
      </div>
    </div>
  );
};

interface ModelCardProps {
  model: ModelMetadata;
  onPull: (modelName: string) => void;
  isPulling: boolean;
  progress?: any;
}

const ModelCard: React.FC<ModelCardProps> = ({ model, onPull, isPulling, progress }) => {
  const badges = getCapabilityBadges(model);
  const isDownloading = progress && progress.status !== 'success';
  const progressPercent =
    progress && progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="p-4 rounded-lg border border-border bg-card hover:border-border/80 transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold mb-1 truncate">{model.displayName}</h4>
          <p className="text-xs text-muted-foreground font-mono mb-2">{model.name}</p>
        </div>
        {model.capabilities.vision && (
          <div className="flex-shrink-0" title="Supports vision">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </div>
        )}
      </div>

      <p className="text-sm text-foreground mb-3 line-clamp-2">{model.description}</p>

      {/* Metadata */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
        {model.size && <span className="px-2 py-0.5 bg-secondary rounded">{model.size}</span>}
        {model.parameters && (
          <span className="px-2 py-0.5 bg-secondary rounded">{model.parameters}</span>
        )}
        {model.minRAM && (
          <span className="px-2 py-0.5 bg-secondary rounded">{model.minRAM} RAM</span>
        )}
      </div>

      {/* Capability Badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {badges.map((badge) => (
            <span
              key={badge}
              className="px-2 py-0.5 text-xs font-medium rounded bg-primary/10 text-primary"
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      {/* Download Button or Progress */}
      {isDownloading ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.status}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={() => onPull(model.name)}
          disabled={isPulling}
          className="w-full px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Download Model
        </button>
      )}
    </div>
  );
};

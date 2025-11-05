import React, { useState } from 'react';
import { useModelStore } from '../../store/models';
import { formatModelSize, getCapabilityBadges } from '../../../shared/modelRegistry';

export const InstalledModels: React.FC = () => {
  const { models, defaultModel, setDefaultModel, refreshModels, isLoading } = useModelStore();
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

  const handleSetDefault = (modelName: string) => {
    setDefaultModel(modelName);
  };

  const handleDelete = async (modelName: string) => {
    // Simple confirmation - consider replacing with a proper modal in the future
    const confirmed = window.confirm(
      `Are you sure you want to delete "${modelName}"?\n\nThis will remove the model from your system.`
    );

    if (!confirmed) return;

    setDeletingModel(modelName);
    try {
      await window.electron.invoke('ollama:deleteModel', modelName);
      await refreshModels();
    } catch (error: any) {
      console.error('Failed to delete model:', error);
      // TODO: Replace with toast notification
      window.alert(`Failed to delete model: ${error.message}`);
    } finally {
      setDeletingModel(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading models...</p>
        </div>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3 max-w-md px-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
            <svg
              className="w-8 h-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-1">No Models Installed</h3>
            <p className="text-sm text-muted-foreground">
              Download models from the &quot;Available Models&quot; tab to get started with AI features.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-4 max-w-5xl mx-auto">
        {models.map((model) => {
          const isDefault = model.name === defaultModel;
          const badges = getCapabilityBadges(model.metadata);
          const isDeleting = deletingModel === model.name;

          return (
            <div
              key={model.name}
              className={`p-5 rounded-lg border-2 transition-all ${
                isDefault
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-border/80'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Model Name and Badges */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg truncate">
                      {model.metadata?.displayName || model.name}
                    </h3>
                    {isDefault && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded">
                        DEFAULT
                      </span>
                    )}
                  </div>

                  {/* Model ID */}
                  <p className="text-sm text-muted-foreground mb-3 font-mono">{model.name}</p>

                  {/* Description */}
                  {model.metadata?.description && (
                    <p className="text-sm text-foreground mb-3">{model.metadata.description}</p>
                  )}

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                        />
                      </svg>
                      <span>{formatModelSize(model.size)}</span>
                    </div>

                    {model.metadata?.parameters && (
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                          />
                        </svg>
                        <span>{model.metadata.parameters}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Capability Badges */}
                  {badges.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {badges.map((badge) => (
                        <span
                          key={badge}
                          className="px-2 py-1 text-xs font-medium rounded bg-secondary text-secondary-foreground"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  {!isDefault && (
                    <button
                      onClick={() => handleSetDefault(model.name)}
                      className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors whitespace-nowrap"
                      title="Set as default model"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(model.name)}
                    disabled={isDeleting}
                    className="px-4 py-2 text-sm bg-red-500/10 text-red-600 dark:text-red-400 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                    title="Delete this model"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

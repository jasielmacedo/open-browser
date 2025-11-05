import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InstalledModelInfo, PullProgress } from '../../shared/types';
import { enrichInstalledModels } from '../../shared/modelRegistry';

interface ModelState {
  models: InstalledModelInfo[];
  defaultModel: string | null;
  isLoading: boolean;
  error: string | null;
  pullProgress: Map<string, PullProgress>;
  isPulling: boolean;
  isOllamaRunning: boolean;
  isModelManagerOpen: boolean;
  setModels: (models: InstalledModelInfo[]) => void;
  setDefaultModel: (modelName: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPullProgress: (modelName: string, progress: PullProgress) => void;
  setIsPulling: (pulling: boolean) => void;
  setIsOllamaRunning: (running: boolean) => void;
  setIsModelManagerOpen: (open: boolean) => void;
  clearPullProgress: (modelName: string) => void;
  refreshModels: () => Promise<void>;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      models: [],
      defaultModel: null,
      isLoading: false,
      error: null,
      pullProgress: new Map(),
      isPulling: false,
      isOllamaRunning: false,
      isModelManagerOpen: false,

      setModels: (models) => set({ models }),

      setDefaultModel: (modelName) => {
        set({ defaultModel: modelName });
        // Also mark the model as default in the models list
        set((state) => ({
          models: state.models.map((m) => ({
            ...m,
            isDefault: m.name === modelName,
          })),
        }));
      },

      setIsLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      setPullProgress: (modelName, progress) =>
        set((state) => {
          const newProgress = new Map(state.pullProgress);
          newProgress.set(modelName, progress);
          return { pullProgress: newProgress };
        }),

      setIsPulling: (pulling) => set({ isPulling: pulling }),

      setIsOllamaRunning: (running) => set({ isOllamaRunning: running }),

      setIsModelManagerOpen: (open) => set({ isModelManagerOpen: open }),

      clearPullProgress: (modelName) =>
        set((state) => {
          const newProgress = new Map(state.pullProgress);
          newProgress.delete(modelName);
          return { pullProgress: newProgress };
        }),

      refreshModels: async () => {
        try {
          set({ isLoading: true, error: null });
          const running = await window.electron.invoke('ollama:isRunning');
          set({ isOllamaRunning: running });

          if (running) {
            const rawModels = await window.electron.invoke('ollama:listModels');
            const enrichedModels = enrichInstalledModels(rawModels);

            // Mark default model
            const { defaultModel } = get();
            const modelsWithDefault = enrichedModels.map((m) => ({
              ...m,
              isDefault: m.name === defaultModel,
            }));

            set({ models: modelsWithDefault });

            // Auto-set first model as default if none set
            if (!defaultModel && modelsWithDefault.length > 0) {
              set({ defaultModel: modelsWithDefault[0].name });
            }
          }
        } catch (error: any) {
          console.error('Failed to refresh models:', error);
          set({ error: error.message || 'Failed to load models' });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'model-settings',
      partialize: (state) => ({
        defaultModel: state.defaultModel,
      }),
    }
  )
);

import { create } from 'zustand';
import type { OllamaModel, PullProgress } from '../../shared/types';

interface ModelState {
  models: OllamaModel[];
  isLoading: boolean;
  error: string | null;
  pullProgress: Map<string, PullProgress>;
  isPulling: boolean;
  isOllamaRunning: boolean;
  setModels: (models: OllamaModel[]) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPullProgress: (modelName: string, progress: PullProgress) => void;
  setIsPulling: (pulling: boolean) => void;
  setIsOllamaRunning: (running: boolean) => void;
  clearPullProgress: (modelName: string) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  models: [],
  isLoading: false,
  error: null,
  pullProgress: new Map(),
  isPulling: false,
  isOllamaRunning: false,

  setModels: (models) => set({ models }),

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

  clearPullProgress: (modelName) =>
    set((state) => {
      const newProgress = new Map(state.pullProgress);
      newProgress.delete(modelName);
      return { pullProgress: newProgress };
    }),
}));

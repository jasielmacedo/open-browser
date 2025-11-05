import type { ModelMetadata, ModelRegistry, OllamaModel, InstalledModelInfo } from './types';
import modelRegistryData from './modelRegistry.json';

/**
 * Get all models from the registry
 */
export function getAllModelsFromRegistry(): ModelMetadata[] {
  return (modelRegistryData as ModelRegistry).models;
}

/**
 * Get recommended models from the registry
 */
export function getRecommendedModels(): ModelMetadata[] {
  return getAllModelsFromRegistry().filter((model) => model.recommended);
}

/**
 * Get models by capability
 */
export function getModelsByCapability(
  capability: 'vision' | 'chat' | 'completion'
): ModelMetadata[] {
  return getAllModelsFromRegistry().filter((model) => model.capabilities[capability]);
}

/**
 * Get vision-capable models
 */
export function getVisionModels(): ModelMetadata[] {
  return getModelsByCapability('vision');
}

/**
 * Get text-only models
 */
export function getTextOnlyModels(): ModelMetadata[] {
  return getAllModelsFromRegistry().filter((model) => !model.capabilities.vision);
}

/**
 * Find model metadata by name (supports partial matching)
 */
export function findModelMetadata(modelName: string): ModelMetadata | undefined {
  const registry = getAllModelsFromRegistry();

  // Exact match first
  let metadata = registry.find((m) => m.name === modelName);
  if (metadata) return metadata;

  // Try exact ID match
  metadata = registry.find((m) => m.id === modelName);
  if (metadata) return metadata;

  // Try base name match (without tag)
  const baseName = modelName.split(':')[0];
  metadata = registry.find((m) => m.name.split(':')[0] === baseName);
  if (metadata) return metadata;

  // Try family match
  metadata = registry.find((m) => m.family && modelName.toLowerCase().includes(m.family));

  return metadata;
}

/**
 * Check if a model supports vision
 */
export function supportsVision(modelName: string): boolean {
  const metadata = findModelMetadata(modelName);
  return metadata?.capabilities.vision ?? false;
}

/**
 * Enrich installed models with metadata from registry
 */
export function enrichInstalledModels(installedModels: OllamaModel[]): InstalledModelInfo[] {
  return installedModels.map((model) => ({
    ...model,
    metadata: findModelMetadata(model.name),
  }));
}

/**
 * Get models available for download (not yet installed)
 */
export function getAvailableModels(installedModels: OllamaModel[]): ModelMetadata[] {
  const installedNames = new Set(installedModels.map((m) => m.name));
  const installedBaseNames = new Set(installedModels.map((m) => m.name.split(':')[0]));

  return getAllModelsFromRegistry().filter((model) => {
    // Check if exact name is installed
    if (installedNames.has(model.name)) return false;

    // Check if base name is installed
    const baseName = model.name.split(':')[0];
    if (installedBaseNames.has(baseName)) return false;

    return true;
  });
}

/**
 * Format model size for display
 */
export function formatModelSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

/**
 * Get capability badges for a model
 */
export function getCapabilityBadges(metadata?: ModelMetadata): string[] {
  if (!metadata) return [];

  const badges: string[] = [];
  if (metadata.capabilities.vision) badges.push('Vision');
  if (metadata.capabilities.chat) badges.push('Chat');
  if (metadata.capabilities.completion) badges.push('Completion');
  if (metadata.capabilities.embedding) badges.push('Embeddings');

  return badges;
}

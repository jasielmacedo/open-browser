import React, { useState, useEffect } from 'react';
import type { PersonalitiesConfig, Personality } from '../../../shared/types';

interface PersonalitySelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PersonalitySelector: React.FC<PersonalitySelectorProps> = ({ isOpen, onClose }) => {
  const [personalitiesConfig, setPersonalitiesConfig] = useState<PersonalitiesConfig | null>(null);
  const [currentPersonality, setCurrentPersonality] = useState<Personality | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('friend');
  const [isLoading, setIsLoading] = useState(true);

  // Load personalities and current selection
  useEffect(() => {
    if (isOpen) {
      loadPersonalities();
      // Hide the active tab view so modal is interactive
      window.electron.invoke('tabWindow:setActiveVisible', false).catch(console.error);
    } else {
      // Show the active tab view when modal closes
      window.electron.invoke('tabWindow:setActiveVisible', true).catch(console.error);
    }
  }, [isOpen]);

  const loadPersonalities = async () => {
    try {
      setIsLoading(true);
      const [config, current] = await Promise.all([
        window.electron.invoke('personalities:getAll'),
        window.electron.invoke('personalities:getCurrent'),
      ]);

      setPersonalitiesConfig(config);
      setCurrentPersonality(current);

      // Set default category if we have one
      if (config && Object.keys(config.categories).length > 0) {
        // Try to set category based on current personality
        if (current) {
          for (const [categoryKey, category] of Object.entries(config.categories)) {
            if (category.personalities.some((p) => p.id === current.id)) {
              setSelectedCategory(categoryKey);
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load personalities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPersonality = async (personality: Personality) => {
    try {
      await window.electron.invoke('personalities:select', personality.id);
      setCurrentPersonality(personality);
      onClose();
    } catch (error) {
      console.error('Failed to select personality:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-2xl font-semibold">Choose Your AI Personality</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select a personality to customize how your AI assistant interacts with you
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground">Loading personalities...</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Category Sidebar */}
            <div className="w-64 border-r border-border p-4 overflow-y-auto">
              <div className="space-y-1">
                {personalitiesConfig &&
                  Object.entries(personalitiesConfig.categories).map(([key, category]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                        selectedCategory === key
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <div className="font-medium">{category.name}</div>
                      <div
                        className={`text-xs mt-1 ${
                          selectedCategory === key
                            ? 'text-primary-foreground/80'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {category.personalities.length} personalities
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            {/* Personalities Grid */}
            <div className="flex-1 p-6 overflow-y-auto">
              {personalitiesConfig && personalitiesConfig.categories[selectedCategory] && (
                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-medium">
                      {personalitiesConfig.categories[selectedCategory].name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {personalitiesConfig.categories[selectedCategory].description}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {personalitiesConfig.categories[selectedCategory].personalities.map(
                      (personality) => {
                        const isSelected = currentPersonality?.id === personality.id;

                        return (
                          <button
                            key={personality.id}
                            onClick={() => handleSelectPersonality(personality)}
                            className={`text-left p-4 rounded-lg border-2 transition-all ${
                              isSelected
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50 hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Icon placeholder - will be replaced with actual icons later */}
                              <div
                                className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0 ${
                                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                                }`}
                              >
                                {getIconEmoji(personality.icon)}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold">{personality.personName}</h4>
                                  {isSelected && (
                                    <span className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground/80">
                                  {personality.name}
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {personality.description}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {personality.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border p-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {currentPersonality && (
              <span>
                Currently active:{' '}
                <span className="font-medium text-foreground">{currentPersonality.personName}</span>{' '}
                ({currentPersonality.name})
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper function to get emoji for icon names
function getIconEmoji(iconName: string): string {
  const iconMap: Record<string, string> = {
    briefcase: '💼',
    code: '💻',
    target: '🎯',
    calendar: '📅',
    book: '📚',
    users: '👥',
    'book-open': '📖',
    zap: '⚡',
    palette: '🎨',
    gamepad: '🎮',
    smile: '😄',
    'message-circle': '💬',
    image: '🖼️',
    coffee: '☕',
    theater: '🎭',
    heart: '❤️',
    compass: '🧭',
    'book-heart': '📚',
    'shield-heart': '🛡️',
    sparkles: '✨',
  };

  return iconMap[iconName] || '🤖';
}

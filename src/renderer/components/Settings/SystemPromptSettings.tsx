import React, { useState, useEffect } from 'react';
import { PersonalitySelector } from './PersonalitySelector';
import type { Personality } from '../../../shared/types';
import { refreshThinkingMode } from '../../store/chat';

interface SystemPromptSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemPromptSettings: React.FC<SystemPromptSettingsProps> = ({ isOpen, onClose }) => {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userInfo, setUserInfo] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [thinkingMode, setThinkingMode] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPersonalitySelectorOpen, setIsPersonalitySelectorOpen] = useState(false);
  const [currentPersonality, setCurrentPersonality] = useState<Personality | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const [prompt, info, instructions, personality, thinking] = await Promise.all([
        window.electron.invoke('settings:get', 'system-prompt'),
        window.electron.invoke('settings:get', 'user-info'),
        window.electron.invoke('settings:get', 'custom-instructions'),
        window.electron.invoke('personalities:getCurrent'),
        window.electron.invoke('settings:get', 'thinking-mode'),
      ]);

      setSystemPrompt(prompt || '');
      setUserInfo(info || '');
      setCustomInstructions(instructions || '');
      setCurrentPersonality(personality);
      setThinkingMode(thinking !== false); // Default to true if not set
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        window.electron.invoke('settings:set', 'system-prompt', systemPrompt),
        window.electron.invoke('settings:set', 'user-info', userInfo),
        window.electron.invoke('settings:set', 'custom-instructions', customInstructions),
        window.electron.invoke('settings:set', 'thinking-mode', thinkingMode),
      ]);
      // Refresh thinking mode in chat store
      await refreshThinkingMode();
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (
      confirm(
        'Are you sure you want to clear all custom settings? The base system prompt will remain active.'
      )
    ) {
      setSystemPrompt('');
      setUserInfo('');
      setCustomInstructions('');
      setThinkingMode(true); // Reset to default (enabled)
    }
  };

  const handlePersonalitySelectorClose = () => {
    setIsPersonalitySelectorOpen(false);
    // Reload personality after selection
    loadSettings();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-xl font-semibold">System Prompt Settings</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent rounded transition-colors"
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

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Info Banner */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-400">
                <strong>Note:</strong> A comprehensive base system prompt is always active. Your
                customizations below are <strong>added to</strong> the base prompt, not replacing
                it.
              </p>
            </div>

            {/* AI Personality Section */}
            <div className="p-4 bg-accent/30 border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">AI Personality</label>
                <button
                  onClick={() => setIsPersonalitySelectorOpen(true)}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                >
                  Change Personality
                </button>
              </div>
              {currentPersonality ? (
                <div className="flex items-start gap-3 mt-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl flex-shrink-0">
                    {getIconEmoji(currentPersonality.icon)}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">{currentPersonality.personName}</h4>
                    <p className="text-xs text-muted-foreground/80">{currentPersonality.name}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {currentPersonality.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {currentPersonality.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 text-xs bg-muted rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No personality selected</p>
              )}
            </div>

            {/* Thinking Mode Toggle */}
            <div className="p-4 bg-accent/30 border border-border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Thinking Mode</label>
                  <p className="text-xs text-muted-foreground">
                    Enable advanced reasoning and tool calling for complex tasks. Disable for faster,
                    direct responses to simple questions.
                  </p>
                </div>
                <button
                  onClick={() => setThinkingMode(!thinkingMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    thinkingMode ? 'bg-primary' : 'bg-muted'
                  }`}
                  role="switch"
                  aria-checked={thinkingMode}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      thinkingMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <div className="mt-3 text-xs">
                <p className="text-muted-foreground">
                  {thinkingMode ? (
                    <>
                      <span className="text-green-400">✓ Enabled</span> - AI can use tools like web
                      search, analyze pages, and access history for comprehensive answers
                    </>
                  ) : (
                    <>
                      <span className="text-orange-400">○ Disabled</span> - AI will provide quick,
                      direct responses without tool calling or planning
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* System Prompt */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Additional Instructions
                <span className="text-muted-foreground ml-2 font-normal">
                  (Add to base prompt - optional)
                </span>
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Add any additional instructions or modify the AI's behavior here..."
                className="w-full h-32 px-3 py-2 bg-secondary border border-input rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                These instructions will be added to the comprehensive base prompt that explains the
                AI's capabilities and environment.
              </p>
            </div>

            {/* User Info */}
            <div>
              <label className="block text-sm font-medium mb-2">
                User Information
                <span className="text-muted-foreground ml-2 font-normal">
                  (Optional context about you)
                </span>
              </label>
              <textarea
                value={userInfo}
                onChange={(e) => setUserInfo(e.target.value)}
                placeholder="e.g., Name: John Doe, Occupation: Software Developer, Interests: Web development, AI..."
                className="w-full h-24 px-3 py-2 bg-secondary border border-input rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Provide information about yourself to help the AI personalize responses.
              </p>
            </div>

            {/* Custom Instructions */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Custom Instructions
                <span className="text-muted-foreground ml-2 font-normal">
                  (Additional preferences)
                </span>
              </label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g., Always provide code examples when relevant, Prefer concise responses, Use metric units..."
                className="w-full h-24 px-3 py-2 bg-secondary border border-input rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Add any specific preferences or instructions for how the AI should respond.
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-accent/50 border border-border rounded-lg p-4">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-primary flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="text-sm space-y-1">
                  <p className="font-medium">Context Information</p>
                  <p className="text-muted-foreground">
                    The AI will automatically receive the current date and time with each message.
                    These settings will be included in all conversations to provide personalized
                    assistance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border bg-secondary/30">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm hover:bg-accent rounded transition-colors"
            >
              Reset to Default
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm hover:bg-accent rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Personality Selector Modal */}
      <PersonalitySelector
        isOpen={isPersonalitySelectorOpen}
        onClose={handlePersonalitySelectorClose}
      />
    </>
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

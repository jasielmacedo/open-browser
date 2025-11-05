# Implementation Issues Found

## Critical Issues

### 1. AvailableModels: Premature Listener Cleanup
**Location**: `src/renderer/components/Models/AvailableModels.tsx:36-37`

**Problem**: The `unsubscribe()` is called immediately after `invoke()`, but the pull operation is asynchronous and streaming. This means progress updates will not be received.

```typescript
// WRONG - unsubscribe called too early
await window.electron.invoke('ollama:pullModel', modelName);
unsubscribe(); // Progress events still coming!
```

**Fix**: Move unsubscribe to a cleanup mechanism or keep it registered.

### 2. Missing Tailwind CSS Classes
**Location**: `src/renderer/components/Models/InstalledModels.tsx:93`

**Problem**: Uses `bg-destructive/10 text-destructive` but these color classes don't exist in globals.css

**Fix**: Add destructive color to Tailwind config or use existing colors like `bg-red-500/10 text-red-500`

### 3. ChatSidebar: Missing useEffect Dependencies
**Location**: `src/renderer/components/Chat/ChatSidebar.tsx:62`

**Problem**: useEffect has incomplete dependency array:
- Uses: `refreshModels`, `currentModel`, `defaultModel`, `models`, `setCurrentModel`, `setIsOllamaRunning`
- Only declares: `isChatOpen`

This causes:
- React ESLint warnings
- Stale closure bugs
- Potential infinite loops if all deps added

**Fix**: Either:
  - Add all dependencies (may cause re-render issues)
  - Use useCallback for functions
  - Restructure logic to avoid dependencies

## Moderate Issues

### 4. Type Safety: Any Types
**Locations**: Multiple files using `progress: any`

**Problem**: Loses type safety for progress objects

**Fix**: Use proper `PullProgress` type

### 5. Alert() Usage
**Location**: `AvailableModels.tsx:40`, `InstalledModels.tsx:25`

**Problem**: Using browser alert() instead of proper UI notifications

**Fix**: Implement toast notifications or inline error messages

### 6. Confirm() Usage
**Location**: `InstalledModels.tsx:20`

**Problem**: Using browser confirm() instead of proper modal

**Fix**: Implement confirmation modal component

## Minor Issues

### 7. Hardcoded Timeout in AvailableModels
**Location**: `AvailableModels.tsx:26`

**Problem**: `setTimeout(..., 1000)` is arbitrary

**Fix**: Remove timeout or make it configurable

### 8. Missing Error Boundaries
**Problem**: No error boundaries around new components

**Fix**: Add error boundaries for model management UI

### 9. No Loading States for Model Operations
**Problem**: Delete operation doesn't show loading state

**Fix**: Add loading indicators

## Recommendations

1. **Fix Critical Issues First**: Especially the listener cleanup bug
2. **Add Proper Types**: Replace `any` types
3. **Improve UX**: Replace alert/confirm with proper UI components
4. **Add Tests**: Unit tests for model registry utilities
5. **Error Handling**: Better error messages and recovery

# Security Measures

This document outlines the security measures implemented in the Browser-LLM application.

## Overview

Browser-LLM is an Electron-based browser application with integrated LLM capabilities. As it handles web content and user data, security is a top priority. This document details the security controls in place.

## Security Controls

### 1. IPC Channel Whitelisting

**Location**: `src/main/preload.ts`

**Implementation**:
- Strict whitelist of allowed IPC channels for both invoke and listen operations
- Any attempt to use non-whitelisted channels is rejected with an error
- Prevents malicious renderer code from accessing unauthorized main process functionality

**Channels Allowed**:
- History operations: `history:add`, `history:search`, `history:get`, `history:delete`, `history:clear`
- Bookmark operations: `bookmark:add`, `bookmark:get`, `bookmark:search`, `bookmark:isBookmarked`, `bookmark:delete`, `bookmark:deleteByUrl`, `bookmark:update`
- Browsing context: `browsing:getContext`
- Tab management: `tabs:save`, `tabs:load`, `tabs:clear`
- Webview controls: `webview:openDevTools`, `webview:print`, `webview:viewSource`

### 2. Content Security Policy (CSP)

**Location**: `src/renderer/index.html`

**Policy**:
```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' http://localhost:* ws://localhost:* https:;
font-src 'self' data:;
webview-src https: http:;
```

**Protection**:
- Prevents XSS attacks by restricting script sources
- Controls resource loading to trusted sources only
- Allows necessary functionality for development (localhost) and production

### 3. URL Validation

**Location**: `src/main/utils/validation.ts`

**Implementation**:
- All URLs are validated before storage or navigation
- Only safe protocols are allowed: `http:`, `https:`, `view-source:`
- Dangerous protocols are blocked: `javascript:`, `data:`, `file:`, etc.
- Applied to:
  - History entries
  - Bookmarks
  - Tab URLs
  - Navigation requests

**Functions**:
- `isUrlSafe(url)`: Validates URL safety
- `validateUrl(url, context)`: Throws error for unsafe URLs

### 4. Input Validation

**Location**: `src/main/ipc/handlers.ts`, `src/main/utils/validation.ts`

**Implementation**:
- All IPC handler inputs are validated before processing
- Type checking for strings, numbers, booleans
- Length limits to prevent DoS attacks
- Array validation for batch operations

**Validation Functions**:
- `validateString(value, fieldName, maxLength)`: String validation with length limits
- `validatePositiveInteger(value, fieldName)`: Non-negative integer validation
- `validateBoolean(value, fieldName)`: Boolean validation

**Limits**:
- URLs: 2048 characters
- Titles: 1024 characters
- Search queries: 1024 characters
- Tab IDs: 256 characters

### 5. Download Path Sanitization

**Location**: `src/main/index.ts`

**Implementation**:
- Download filenames are sanitized to prevent path traversal attacks
- Removes dangerous characters: `< > : " | ? * \x00-\x1F`
- Prevents hidden files (starting with `.`)
- Limits filename length to 255 characters
- Uses `path.basename()` to strip directory components

**Protection Against**:
- Path traversal attacks (`../../etc/passwd`)
- Writing to unauthorized directories
- Overwriting system files

### 6. SQL Injection Prevention

**Location**: `src/main/services/database.ts`

**Implementation**:
- Uses parameterized queries with `?` placeholders
- Whitelisted field names for dynamic UPDATE queries
- FTS5 query escaping for full-text search
- No direct string interpolation in SQL queries

**Key Patterns**:
- All user input passed as parameters, not concatenated
- Field names validated against whitelist before use
- Quote escaping for FTS5 search terms

### 7. Navigation Guards

**Location**: `src/main/index.ts` (web-contents-created handler)

**Implementation**:
- Monitors all navigation attempts in webviews and main window
- Blocks dangerous protocols (javascript:, data:, file:)
- Allows only HTTP(S) and view-source in webviews
- Blocks all navigation in main renderer window
- Denies all new window/popup requests

**Protection Against**:
- Protocol handler attacks
- Malicious redirects
- Popup spam
- Phishing via new windows

### 8. Webview Sandboxing

**Location**: `src/renderer/components/Browser/MultiWebViewContainer.tsx`, `src/main/index.ts`

**Implementation**:
- Webviews use `sandbox=true` in webpreferences
- Context isolation enabled for webviews
- Popups disabled via `allowpopups="false"`
- Persistent partition for session isolation

**Note**: Main window has `sandbox: false` to support webview functionality, but this is mitigated by:
- Strict IPC whitelisting
- Context isolation
- No node integration
- Navigation guards
- URL validation

### 9. Context Isolation

**Location**: `src/main/index.ts`

**Implementation**:
- `contextIsolation: true` for main window and webviews
- Separates preload context from renderer context
- Prevents renderer from accessing Electron/Node.js APIs directly
- All main process access goes through validated IPC channels

### 10. Node Integration Disabled

**Location**: `src/main/index.ts`

**Implementation**:
- `nodeIntegration: false` for all windows
- Renderer processes cannot require Node.js modules
- Prevents direct access to filesystem and system APIs
- All privileged operations must go through IPC handlers

## Security Best Practices

### For Developers

1. **Never bypass validation**: All user input must be validated
2. **Use whitelists**: Prefer whitelists over blacklists for allowed values
3. **Validate at boundaries**: Validate data at IPC boundaries and database boundaries
4. **Escape special characters**: Always escape FTS5 queries and filenames
5. **Use parameterized queries**: Never concatenate user input into SQL
6. **Log security events**: Log blocked navigations and validation failures
7. **Keep dependencies updated**: Regularly update Electron and dependencies

### For Security Audits

When auditing this application, pay special attention to:

1. IPC channel additions (must be added to whitelist)
2. New database operations (must use parameterized queries)
3. URL handling (must validate with `validateUrl`)
4. File operations (must sanitize paths)
5. Navigation handlers (must block dangerous protocols)
6. New webview configurations (must maintain security settings)

## Known Limitations

1. **Sandbox Disabled**: Main window has sandbox disabled for webview support. This is partially mitigated but reduces defense-in-depth.

2. **Webview Deprecation**: Electron's webview tag is deprecated. Consider migrating to BrowserView in the future.

3. **CSP Unsafe-Inline**: CSP allows `unsafe-inline` for scripts and styles due to build tooling. Consider implementing nonces for better security.

4. **No HTTPS Enforcement**: Application allows HTTP content. Consider warning users or enforcing HTTPS-only mode.

## Incident Response

If you discover a security vulnerability:

1. Do not publicly disclose the vulnerability
2. Contact the maintainers privately
3. Provide detailed reproduction steps
4. Allow time for a fix to be developed and deployed

## Security Updates

This document should be updated whenever:
- New security features are added
- Security configurations change
- New attack vectors are identified
- Dependencies are updated with security fixes

---

**Last Updated**: 2025-11-05
**Version**: 0.1.0

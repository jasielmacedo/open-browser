/**
 * Security validation utilities
 */

/**
 * Validates if a URL is safe to load/store
 * Blocks dangerous protocols that could execute scripts or access local files
 */
export function isUrlSafe(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();

    // Allow only safe protocols
    const allowedProtocols = [
      'http:',
      'https:',
      'view-source:', // Used for viewing page source
    ];

    return allowedProtocols.includes(protocol);
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Validates and sanitizes a URL, throwing an error if unsafe
 */
export function validateUrl(url: string, context: string = 'URL'): string {
  if (!isUrlSafe(url)) {
    throw new Error(
      `${context} validation failed: URL '${url}' uses an unsafe or invalid protocol. ` +
        'Only http://, https://, and view-source: URLs are allowed.'
    );
  }
  return url;
}

/**
 * Validates that a value is a non-negative integer
 */
export function validatePositiveInteger(value: any, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value;
}

/**
 * Validates that a value is a string and optionally checks length
 */
export function validateString(value: any, fieldName: string, maxLength?: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  if (maxLength && value.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`);
  }

  return value;
}

/**
 * Validates that a value is a boolean
 */
export function validateBoolean(value: any, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`);
  }
  return value;
}

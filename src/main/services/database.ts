import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import { validateUrl } from '../utils/validation';

export interface HistoryEntry {
  id?: number;
  url: string;
  title: string;
  visitTime: number;
  visitCount?: number;
  favicon?: string;
}

export interface Bookmark {
  id?: number;
  url: string;
  title: string;
  favicon?: string;
  tags?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isActive: boolean;
  position: number;
}

export interface Download {
  id?: number;
  url: string;
  filename: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'in_progress' | 'completed' | 'paused' | 'cancelled' | 'failed';
  mimeType?: string;
  startTime: number;
  endTime?: number;
  error?: string;
}

class DatabaseService {
  private db: Database.Database | null = null;

  initialize() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'browser-data.db');

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance

    this.createTables();
  }

  private createTables() {
    if (!this.db) return;

    // History table with full-text search
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        visit_time INTEGER NOT NULL,
        visit_count INTEGER DEFAULT 1,
        favicon TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_history_url ON history(url);
      CREATE INDEX IF NOT EXISTS idx_history_visit_time ON history(visit_time DESC);

      -- Full-text search virtual table for history
      CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
        url,
        title,
        content='history',
        content_rowid='id'
      );

      -- Triggers to keep FTS table in sync
      CREATE TRIGGER IF NOT EXISTS history_fts_insert AFTER INSERT ON history BEGIN
        INSERT INTO history_fts(rowid, url, title) VALUES (new.id, new.url, new.title);
      END;

      CREATE TRIGGER IF NOT EXISTS history_fts_delete AFTER DELETE ON history BEGIN
        DELETE FROM history_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS history_fts_update AFTER UPDATE ON history BEGIN
        UPDATE history_fts SET url = new.url, title = new.title WHERE rowid = new.id;
      END;
    `);

    // Bookmarks table with full-text search
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        favicon TEXT,
        tags TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON bookmarks(url);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(created_at DESC);

      -- Full-text search for bookmarks
      CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
        url,
        title,
        tags,
        notes,
        content='bookmarks',
        content_rowid='id'
      );

      -- Triggers for bookmarks FTS
      CREATE TRIGGER IF NOT EXISTS bookmarks_fts_insert AFTER INSERT ON bookmarks BEGIN
        INSERT INTO bookmarks_fts(rowid, url, title, tags, notes)
        VALUES (new.id, new.url, new.title, new.tags, new.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS bookmarks_fts_delete AFTER DELETE ON bookmarks BEGIN
        DELETE FROM bookmarks_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS bookmarks_fts_update AFTER UPDATE ON bookmarks BEGIN
        UPDATE bookmarks_fts
        SET url = new.url, title = new.title, tags = new.tags, notes = new.notes
        WHERE rowid = new.id;
      END;
    `);

    // Tabs session table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tabs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        favicon TEXT,
        is_active INTEGER DEFAULT 0,
        position INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tabs_position ON tabs(position);
    `);

    // Settings table for app preferences (window state, etc.)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Downloads table for user downloads (separate from model downloads)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        save_path TEXT NOT NULL,
        total_bytes INTEGER NOT NULL,
        received_bytes INTEGER NOT NULL,
        state TEXT NOT NULL,
        mime_type TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_downloads_start_time ON downloads(start_time DESC);
      CREATE INDEX IF NOT EXISTS idx_downloads_state ON downloads(state);
    `);

    // Zoom preferences table (per-domain zoom levels like Chrome)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS zoom_preferences (
        origin TEXT PRIMARY KEY,
        zoom_level REAL NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_zoom_updated ON zoom_preferences(updated_at DESC);
    `);

    // Initialize default system prompt if not exists
    const systemPrompt = this.getSetting('system-prompt');
    if (!systemPrompt) {
      this.setSetting(
        'system-prompt',
        'You are a helpful AI assistant integrated into a web browser. Provide clear, concise, and accurate responses.'
      );
    }

    const userInfo = this.getSetting('user-info');
    if (!userInfo) {
      this.setSetting('user-info', '');
    }

    const customInstructions = this.getSetting('custom-instructions');
    if (!customInstructions) {
      this.setSetting('custom-instructions', '');
    }

    // Initialize default personality if not exists
    const selectedPersonality = this.getSetting('selected-personality');
    if (!selectedPersonality) {
      this.setSetting('selected-personality', 'best-friend');
    }

    // Initialize default download settings if not exists
    const defaultDownloadFolder = this.getSetting('default-download-folder');
    if (!defaultDownloadFolder) {
      // Will be set to user's Downloads folder on first use
      this.setSetting('default-download-folder', '');
    }

    const askDownloadLocation = this.getSetting('ask-download-location');
    if (!askDownloadLocation) {
      this.setSetting('ask-download-location', 'false');
    }
  }

  // History operations
  addHistory(entry: HistoryEntry): number {
    if (!this.db) throw new Error('Database not initialized');

    // Validate URL for security
    validateUrl(entry.url, 'History entry URL');

    // Check if URL was visited recently (within last 30 minutes)
    const recentVisit = this.db
      .prepare(
        `
      SELECT id, visit_count FROM history
      WHERE url = ? AND visit_time > ?
      ORDER BY visit_time DESC LIMIT 1
    `
      )
      .get(entry.url, Date.now() - 30 * 60 * 1000) as
      | { id: number; visit_count: number }
      | undefined;

    if (recentVisit) {
      // Update existing entry
      this.db
        .prepare(
          `
        UPDATE history
        SET visit_count = ?, visit_time = ?, title = ?, favicon = ?
        WHERE id = ?
      `
        )
        .run(
          recentVisit.visit_count + 1,
          entry.visitTime,
          entry.title,
          entry.favicon || null,
          recentVisit.id
        );
      return recentVisit.id;
    } else {
      // Insert new entry
      const result = this.db
        .prepare(
          `
        INSERT INTO history (url, title, visit_time, favicon, visit_count)
        VALUES (?, ?, ?, ?, 1)
      `
        )
        .run(entry.url, entry.title, entry.visitTime, entry.favicon || null);
      return result.lastInsertRowid as number;
    }
  }

  searchHistory(query: string, limit = 50): HistoryEntry[] {
    if (!this.db) throw new Error('Database not initialized');

    if (!query.trim()) {
      // Return recent history - group by URL to avoid duplicates
      return this.db
        .prepare(
          `
        SELECT MAX(id) as id, url,
               MAX(title) as title,
               MAX(visit_time) as visitTime,
               SUM(visit_count) as visitCount,
               MAX(favicon) as favicon
        FROM history
        GROUP BY url
        ORDER BY MAX(visit_time) DESC
        LIMIT ?
      `
        )
        .all(limit) as HistoryEntry[];
    }

    // Escape FTS5 special characters and quote the query
    // This prevents syntax errors from special chars like . : / etc
    const escapedQuery = '"' + query.replace(/"/g, '""') + '"';

    // Full-text search - group by URL to avoid duplicates
    return this.db
      .prepare(
        `
      SELECT h.id, h.url, h.title, h.visit_time as visitTime,
             h.visit_count as visitCount, h.favicon
      FROM (
        SELECT h.url, MAX(h.id) as max_id
        FROM history_fts fts
        JOIN history h ON h.id = fts.rowid
        WHERE history_fts MATCH ?
        GROUP BY h.url
      ) grouped
      JOIN history h ON h.id = grouped.max_id
      ORDER BY h.visit_time DESC
      LIMIT ?
    `
      )
      .all(escapedQuery, limit) as HistoryEntry[];
  }

  getHistory(limit = 100, offset = 0): HistoryEntry[] {
    if (!this.db) throw new Error('Database not initialized');

    return this.db
      .prepare(
        `
      SELECT id, url, title, visit_time as visitTime, visit_count as visitCount, favicon
      FROM history
      ORDER BY visit_time DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(limit, offset) as HistoryEntry[];
  }

  deleteHistory(id: number): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM history WHERE id = ?').run(id);
  }

  clearHistory(olderThan?: number): void {
    if (!this.db) throw new Error('Database not initialized');

    if (olderThan) {
      this.db.prepare('DELETE FROM history WHERE visit_time < ?').run(olderThan);
    } else {
      this.db.prepare('DELETE FROM history').run();
    }
  }

  // Bookmark operations
  addBookmark(bookmark: Bookmark): number {
    if (!this.db) throw new Error('Database not initialized');

    // Validate URL for security
    validateUrl(bookmark.url, 'Bookmark URL');

    const now = Date.now();
    try {
      const result = this.db
        .prepare(
          `
        INSERT INTO bookmarks (url, title, favicon, tags, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          bookmark.url,
          bookmark.title,
          bookmark.favicon || null,
          bookmark.tags || null,
          bookmark.notes || null,
          bookmark.createdAt || now,
          bookmark.updatedAt || now
        );
      return result.lastInsertRowid as number;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        // Update existing bookmark
        this.db
          .prepare(
            `
          UPDATE bookmarks
          SET title = ?, favicon = ?, tags = ?, notes = ?, updated_at = ?
          WHERE url = ?
        `
          )
          .run(
            bookmark.title,
            bookmark.favicon || null,
            bookmark.tags || null,
            bookmark.notes || null,
            now,
            bookmark.url
          );
        const existing = this.db
          .prepare('SELECT id FROM bookmarks WHERE url = ?')
          .get(bookmark.url) as { id: number };
        return existing.id;
      }
      throw error;
    }
  }

  getBookmarks(limit = 100, offset = 0): Bookmark[] {
    if (!this.db) throw new Error('Database not initialized');

    return this.db
      .prepare(
        `
      SELECT id, url, title, favicon, tags, notes, created_at as createdAt, updated_at as updatedAt
      FROM bookmarks
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(limit, offset) as Bookmark[];
  }

  searchBookmarks(query: string, limit = 50): Bookmark[] {
    if (!this.db) throw new Error('Database not initialized');

    if (!query.trim()) {
      return this.getBookmarks(limit);
    }

    // Escape FTS5 special characters and quote the query
    const escapedQuery = '"' + query.replace(/"/g, '""') + '"';

    return this.db
      .prepare(
        `
      SELECT b.id, b.url, b.title, b.favicon, b.tags, b.notes, b.created_at as createdAt, b.updated_at as updatedAt
      FROM bookmarks_fts fts
      JOIN bookmarks b ON b.id = fts.rowid
      WHERE bookmarks_fts MATCH ?
      ORDER BY b.created_at DESC
      LIMIT ?
    `
      )
      .all(escapedQuery, limit) as Bookmark[];
  }

  isBookmarked(url: string): boolean {
    if (!this.db) throw new Error('Database not initialized');

    // Validate URL for security
    validateUrl(url, 'Bookmark lookup URL');

    const result = this.db.prepare('SELECT id FROM bookmarks WHERE url = ?').get(url);
    return !!result;
  }

  deleteBookmark(id: number): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  }

  deleteBookmarkByUrl(url: string): void {
    if (!this.db) throw new Error('Database not initialized');

    // Validate URL for security
    validateUrl(url, 'Bookmark deletion URL');

    this.db.prepare('DELETE FROM bookmarks WHERE url = ?').run(url);
  }

  updateBookmark(id: number, updates: Partial<Bookmark>): void {
    if (!this.db) throw new Error('Database not initialized');

    // Use a whitelist approach for allowed fields to prevent SQL injection
    const allowedFields = ['title', 'favicon', 'tags', 'notes', 'url'] as const;

    const fields: string[] = [];
    const values: any[] = [];

    // Only process fields that are in the whitelist
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    if (fields.length === 0) return;

    // Always update the updated_at timestamp
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    // Build the query safely - fields array only contains whitelisted field names
    const query = `UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(query).run(...values);
  }

  // Tab session operations
  saveTabs(tabs: Tab[]): void {
    if (!this.db) throw new Error('Database not initialized');

    // Validate all tab URLs for security
    for (const tab of tabs) {
      if (tab.url) {
        validateUrl(tab.url, 'Tab URL');
      }
    }

    // Clear existing tabs and save new ones
    this.db.prepare('DELETE FROM tabs').run();

    const insertStmt = this.db.prepare(`
      INSERT INTO tabs (id, url, title, favicon, is_active, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    for (const tab of tabs) {
      insertStmt.run(
        tab.id,
        tab.url,
        tab.title,
        tab.favicon || null,
        tab.isActive ? 1 : 0,
        tab.position,
        now
      );
    }
  }

  loadTabs(): Tab[] {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare(
        `
      SELECT id, url, title, favicon, is_active, position
      FROM tabs
      ORDER BY position ASC
    `
      )
      .all() as any[];

    // Convert is_active (INTEGER 0/1) to boolean
    return rows.map((row) => ({
      id: row.id,
      url: row.url,
      title: row.title,
      favicon: row.favicon,
      isActive: Boolean(row.is_active),
      position: row.position,
    }));
  }

  clearTabs(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM tabs').run();
  }

  // AI-friendly: Get browsing context
  getBrowsingContext(limit = 100): { history: HistoryEntry[]; bookmarks: Bookmark[] } {
    return {
      history: this.getHistory(limit),
      bookmarks: this.getBookmarks(limit),
    };
  }

  // Settings operations
  getSetting(key: string): string | null {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;

    return row ? row.value : null;
  }

  setSetting(key: string, value: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db
      .prepare(
        `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `
      )
      .run(key, value, Date.now());
  }

  // Download operations
  addDownload(download: Download): number {
    if (!this.db) throw new Error('Database not initialized');

    // Validate URL for security
    validateUrl(download.url, 'Download URL');

    const result = this.db
      .prepare(
        `
        INSERT INTO downloads (url, filename, save_path, total_bytes, received_bytes, state, mime_type, start_time, end_time, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        download.url,
        download.filename,
        download.savePath,
        download.totalBytes,
        download.receivedBytes,
        download.state,
        download.mimeType || null,
        download.startTime,
        download.endTime || null,
        download.error || null
      );
    return result.lastInsertRowid as number;
  }

  updateDownload(id: number, updates: Partial<Download>): void {
    if (!this.db) throw new Error('Database not initialized');

    const allowedFields = ['received_bytes', 'state', 'end_time', 'error', 'total_bytes'] as const;

    const fields: string[] = [];
    const values: any[] = [];

    for (const field of allowedFields) {
      if (updates[field as keyof Download] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field as keyof Download]);
      }
    }

    if (fields.length === 0) return;

    values.push(id);
    const query = `UPDATE downloads SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(query).run(...values);
  }

  getDownload(id: number): Download | null {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db
      .prepare(
        `
      SELECT id, url, filename, save_path as savePath, total_bytes as totalBytes,
             received_bytes as receivedBytes, state, mime_type as mimeType,
             start_time as startTime, end_time as endTime, error
      FROM downloads
      WHERE id = ?
    `
      )
      .get(id) as Download | undefined;

    return result || null;
  }

  getDownloads(limit = 100, offset = 0): Download[] {
    if (!this.db) throw new Error('Database not initialized');

    return this.db
      .prepare(
        `
      SELECT id, url, filename, save_path as savePath, total_bytes as totalBytes,
             received_bytes as receivedBytes, state, mime_type as mimeType,
             start_time as startTime, end_time as endTime, error
      FROM downloads
      ORDER BY start_time DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(limit, offset) as Download[];
  }

  getActiveDownloads(): Download[] {
    if (!this.db) throw new Error('Database not initialized');

    return this.db
      .prepare(
        `
      SELECT id, url, filename, save_path as savePath, total_bytes as totalBytes,
             received_bytes as receivedBytes, state, mime_type as mimeType,
             start_time as startTime, end_time as endTime, error
      FROM downloads
      WHERE state = 'in_progress' OR state = 'paused'
      ORDER BY start_time DESC
    `
      )
      .all() as Download[];
  }

  deleteDownload(id: number): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM downloads WHERE id = ?').run(id);
  }

  clearDownloads(olderThan?: number): void {
    if (!this.db) throw new Error('Database not initialized');

    if (olderThan) {
      this.db.prepare('DELETE FROM downloads WHERE start_time < ?').run(olderThan);
    } else {
      this.db.prepare('DELETE FROM downloads WHERE state != "in_progress"').run();
    }
  }

  // Zoom preferences operations (per-origin like Chrome)
  getZoomLevel(origin: string): number | null {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db
      .prepare('SELECT zoom_level FROM zoom_preferences WHERE origin = ?')
      .get(origin) as { zoom_level: number } | undefined;

    return result ? result.zoom_level : null;
  }

  setZoomLevel(origin: string, zoomLevel: number): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db
      .prepare(
        `
      INSERT INTO zoom_preferences (origin, zoom_level, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(origin) DO UPDATE SET
        zoom_level = excluded.zoom_level,
        updated_at = excluded.updated_at
    `
      )
      .run(origin, zoomLevel, Date.now());
  }

  deleteZoomLevel(origin: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM zoom_preferences WHERE origin = ?').run(origin);
  }

  clearZoomPreferences(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM zoom_preferences').run();
  }

  close() {
    this.db?.close();
  }
}

export const databaseService = new DatabaseService();

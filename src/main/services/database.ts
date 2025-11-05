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
      // Return recent history
      return this.db
        .prepare(
          `
        SELECT id, url, title, visit_time as visitTime, visit_count as visitCount, favicon
        FROM history
        ORDER BY visit_time DESC
        LIMIT ?
      `
        )
        .all(limit) as HistoryEntry[];
    }

    // Escape FTS5 special characters and quote the query
    // This prevents syntax errors from special chars like . : / etc
    const escapedQuery = '"' + query.replace(/"/g, '""') + '"';

    // Full-text search
    return this.db
      .prepare(
        `
      SELECT h.id, h.url, h.title, h.visit_time as visitTime, h.visit_count as visitCount, h.favicon
      FROM history_fts fts
      JOIN history h ON h.id = fts.rowid
      WHERE history_fts MATCH ?
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

    return this.db
      .prepare(
        `
      SELECT id, url, title, favicon, is_active as isActive, position
      FROM tabs
      ORDER BY position ASC
    `
      )
      .all() as Tab[];
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

  close() {
    this.db?.close();
  }
}

export const databaseService = new DatabaseService();

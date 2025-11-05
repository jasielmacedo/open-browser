import React, { useState, useEffect } from 'react';
import { useBrowserStore } from '../../store/browser';
import { browserDataService } from '../../services/browserData';
import type { Bookmark } from '../../../shared/types';

export const BookmarksSidebar: React.FC = () => {
  const { showBookmarks, setShowBookmarks, setCurrentUrl } = useBrowserStore();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);

  // Load bookmarks when sidebar opens
  useEffect(() => {
    if (showBookmarks) {
      loadBookmarks();
    }
  }, [showBookmarks]);

  // Search when query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      setIsSearching(true);
      browserDataService.searchBookmarks(searchQuery, 100)
        .then(setBookmarks)
        .catch(err => console.error('Failed to search bookmarks:', err))
        .finally(() => setIsSearching(false));
    } else if (showBookmarks) {
      loadBookmarks();
    }
  }, [searchQuery, showBookmarks]);

  const loadBookmarks = () => {
    setIsSearching(true);
    browserDataService.getBookmarks(100)
      .then(setBookmarks)
      .catch(err => console.error('Failed to load bookmarks:', err))
      .finally(() => setIsSearching(false));
  };

  const handleNavigate = (url: string) => {
    setCurrentUrl(url);
    setShowBookmarks(false);
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this bookmark?')) return;
    try {
      await browserDataService.deleteBookmark(id);
      setBookmarks(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Failed to delete bookmark:', err);
    }
  };

  const handleEdit = (bookmark: Bookmark, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBookmark(bookmark);
  };

  const handleSaveEdit = async () => {
    if (!editingBookmark || !editingBookmark.id) return;
    try {
      await browserDataService.updateBookmark(editingBookmark.id, {
        title: editingBookmark.title,
        tags: editingBookmark.tags,
        notes: editingBookmark.notes,
      });
      setBookmarks(prev =>
        prev.map(b => (b.id === editingBookmark.id ? editingBookmark : b))
      );
      setEditingBookmark(null);
    } catch (err) {
      console.error('Failed to update bookmark:', err);
    }
  };

  const handleCancelEdit = () => {
    setEditingBookmark(null);
  };

  if (!showBookmarks) return null;

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Bookmarks</h2>
        <button
          onClick={() => setShowBookmarks(false)}
          className="p-1 rounded hover:bg-accent transition-colors"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg border border-input focus-within:border-primary transition-colors">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bookmarks..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 hover:bg-accent rounded transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Bookmarks List */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            Loading...
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p>{searchQuery ? 'No bookmarks found' : 'No bookmarks yet'}</p>
            <p className="text-xs mt-1">Click the star icon to bookmark pages</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {bookmarks.map(bookmark => (
              <div
                key={bookmark.id}
                onClick={() => !editingBookmark && handleNavigate(bookmark.url)}
                className={`group flex items-start gap-2 px-2 py-2 rounded transition-colors ${
                  editingBookmark?.id === bookmark.id
                    ? 'bg-accent'
                    : 'hover:bg-accent cursor-pointer'
                }`}
              >
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-500" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <div className="flex-1 min-w-0">
                  {editingBookmark?.id === bookmark.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editingBookmark.title}
                        onChange={(e) =>
                          setEditingBookmark({ ...editingBookmark, title: e.target.value })
                        }
                        className="w-full px-2 py-1 text-sm bg-secondary rounded border border-input"
                        placeholder="Title"
                      />
                      <input
                        type="text"
                        value={editingBookmark.tags || ''}
                        onChange={(e) =>
                          setEditingBookmark({ ...editingBookmark, tags: e.target.value })
                        }
                        className="w-full px-2 py-1 text-xs bg-secondary rounded border border-input"
                        placeholder="Tags (comma-separated)"
                      />
                      <textarea
                        value={editingBookmark.notes || ''}
                        onChange={(e) =>
                          setEditingBookmark({ ...editingBookmark, notes: e.target.value })
                        }
                        className="w-full px-2 py-1 text-xs bg-secondary rounded border border-input resize-none"
                        rows={2}
                        placeholder="Notes"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="flex-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="flex-1 px-2 py-1 text-xs bg-secondary rounded hover:bg-accent"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-medium truncate">{bookmark.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{bookmark.url}</div>
                      {bookmark.tags && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {bookmark.tags.split(',').map((tag, i) => (
                            <span key={i} className="inline-block px-1.5 py-0.5 mr-1 bg-secondary rounded">
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                      {bookmark.notes && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {bookmark.notes}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {!editingBookmark && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleEdit(bookmark, e)}
                      className="p-1 rounded hover:bg-accent transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => handleDelete(bookmark.id!, e)}
                      className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

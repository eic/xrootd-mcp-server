import { DirectoryEntry } from './xrootd.js';

interface CacheEntry {
  entries: DirectoryEntry[];
  cachedAt: Date;
}

export class DirectoryCache {
  private cache: Map<string, CacheEntry>;
  private cacheTTL: number; // milliseconds
  private maxSize: number;

  constructor(cacheTTLMinutes: number = 60, maxSize: number = 1000) {
    this.cache = new Map();
    this.cacheTTL = cacheTTLMinutes * 60 * 1000;
    this.maxSize = maxSize;
  }

  get(path: string): DirectoryEntry[] | null {
    const entry = this.cache.get(path);
    
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.cachedAt.getTime();
    
    if (age > this.cacheTTL) {
      // Expired
      this.cache.delete(path);
      return null;
    }

    return entry.entries;
  }

  set(path: string, entries: DirectoryEntry[]): void {
    // LRU eviction: if cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.findOldestEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(path, {
      entries,
      cachedAt: new Date(),
    });
  }

  invalidate(path: string): void {
    this.cache.delete(path);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size,
    };
  }

  private findOldestEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of Array.from(this.cache.entries())) {
      const time = entry.cachedAt.getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  // Cleanup expired entries periodically
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of Array.from(this.cache.entries())) {
      const age = now - entry.cachedAt.getTime();
      if (age > this.cacheTTL) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

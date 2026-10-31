import * as fs from 'fs/promises';
import * as path from 'path';
import { TemplateReferenceTree } from '../types/templateReference';

export interface CacheEntry {
  data: TemplateReferenceTree;
  timestamp: number;
  accessedAt: number;
  hitCount: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  maxSize: number;
  currentSize: number;
}

export class CachingRegistry {
  private cache: Map<string, CacheEntry>;
  private readonly maxSize: number;
  private readonly cachePath: string;
  private readonly cacheFileName: string;
  private metrics: CacheMetrics;
  private readonly accessLog: string[];

  constructor(
    cachePath: string,
    maxEntries: number = 1000,
    enabled: boolean = true
  ) {
    this.cachePath = cachePath;
    this.cacheFileName = 'ado-cache.json';
    this.maxSize = maxEntries;
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0,
      maxSize: maxEntries,
      currentSize: 0,
    };
    this.accessLog = [];
    this.cache = new Map<string, CacheEntry>();

    // Ensure cache directory exists
    if (enabled) {
      fs.mkdir(this.cachePath, { recursive: true }).catch(() => {
        console.warn(`[ADO Inspector] Could not create cache directory: ${this.cachePath}`);
      });
    }

    // Restore cache from disk if enabled
    this.restoreFromDisk();
  }

  /**
   * Get a cached entry, updating the access timestamp and hit count.
   * If not found, returns null.
   */
  private getCached(fileUri: string): CacheEntry | undefined {
    const entry = this.cache.get(fileUri);
    if (entry) {
      entry.accessedAt = Date.now();
      entry.hitCount++;
      this.metrics.hits++;
      this.metrics.totalRequests++;
      this.logAccess(fileUri, 'HIT');
      return entry;
    }
    return undefined;
  }

  /**
   * Get or build a cached entry. If not in cache, invokes the build function.
   */
  async getOrBuild(
    fileUri: string,
    build: () => Promise<TemplateReferenceTree>
  ): Promise<TemplateReferenceTree> {
    this.metrics.totalRequests++;
    const existing = this.getCached(fileUri);
    if (existing) {
      return existing.data;
    }

    // Cache miss
    this.metrics.misses++;
    const result = await build();
    this.cache.set(fileUri, {
      data: result,
      timestamp: Date.now(),
      accessedAt: Date.now(),
      hitCount: 0,
    });
    this.metrics.currentSize = this.cache.size;

    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }

    this.logAccess(fileUri, 'BUILD');
    return result;
  }

  /**
   * Evict the least recently used entry.
   */
  private evictOldest(): void {
    let oldestFileUri: string | null = null;
    let oldestTime = Number.MAX_SAFE_INTEGER;

    for (const [fileUri, entry] of this.cache.entries()) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestFileUri = fileUri;
      }
    }

    if (oldestFileUri) {
      const removed = this.cache.delete(oldestFileUri);
      if (removed) {
        this.metrics.evictions++;
        console.log(
          `[ADO Inspector] Evicted LRU entry: ${oldestFileUri}`
        );
      }
    }
  }

  /**
   * Log an access event.
   */
  private logAccess(fileUri: string, type: 'HIT' | 'BUILD' | 'MISS'): void {
    const logEntry = `${new Date().toISOString()} | ${fileUri} | ${type}`;
    this.accessLog.push(logEntry);
    if (this.accessLog.length > 1000) {
      this.accessLog.shift();
    }
  }

  /**
   * Save the cache to disk.
   */
  async persist(): Promise<void> {
    const cacheData = Array.from(this.cache.entries()).map(
      ([fileUri, entry]) => ({
        fileUri,
        data: entry.data,
        timestamp: entry.timestamp,
        accessedAt: entry.accessedAt,
        hitCount: entry.hitCount,
      })
    );

    const cacheDir = path.dirname(this.cachePath);
    await fs.mkdir(cacheDir, { recursive: true });

    await fs.writeFile(
      path.join(this.cachePath, this.cacheFileName),
      JSON.stringify(cacheData, null, 2),
      'utf-8'
    );

    console.log(
      `[ADO Inspector] Cache persisted: ${this.cache.size} entries`
    );
  }

  /**
   * Restore the cache from disk.
   */
  async restoreFromDisk(): Promise<void> {
    if (!fs.existsSync(this.cachePath)) {
      return;
    }

    try {
      const cacheData = await fs.readFile(
        path.join(this.cachePath, this.cacheFileName),
        'utf-8'
      );
      const entries: CacheEntry[] = JSON.parse(cacheData);

      for (const entry of entries) {
        this.cache.set(entry.fileUri, entry);
      }

      this.metrics.currentSize = this.cache.size;
      console.log(
        `[ADO Inspector] Cache restored: ${this.cache.size} entries`
      );
    } catch (error) {
      console.warn(
        `[ADO Inspector] Could not restore cache: ${error}`
      );
    }
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0,
      maxSize: this.maxSize,
      currentSize: 0,
    };
    console.log(`[ADO Inspector] Cache cleared`);
  }

  /**
   * Get cache metrics.
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if a file is in the cache.
   */
  has(fileUri: string): boolean {
    return this.cache.has(fileUri);
  }

  /**
   * Get the number of entries in the cache.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all cached file URIs.
   */
  getAllKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all cached entries.
   */
  getAllEntries(): Map<string, CacheEntry> {
    return new Map(this.cache);
  }
}

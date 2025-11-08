import { exec } from 'child_process';
import { promisify } from 'util';
import { DirectoryCache } from './cache.js';

const execAsync = promisify(exec);

export interface FileInfo {
  path: string;
  size: number;
  modificationTime: Date;
  isDirectory: boolean;
  permissions?: string;
}

export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
  modificationTime?: Date;
}

export interface SearchResult {
  path: string;
  size: number;
  modificationTime: Date;
  isDirectory: boolean;
}

export interface DirectoryStatistics {
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  sizeByExtension: Record<string, { count: number; size: number }>;
  oldestFile?: { path: string; mtime: Date };
  newestFile?: { path: string; mtime: Date };
  largestFile?: { path: string; size: number };
}

export interface FileFilter {
  extension?: string;
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: Date;
  modifiedBefore?: Date;
  namePattern?: string;
}

export interface Campaign {
  name: string;
  path: string;
  modificationTime?: Date;
}

export interface Dataset {
  name: string;
  path: string;
  fileCount?: number;
  totalSize?: number;
}

export class XRootDClient {
  private serverUrl: string;
  private baseDirectory: string;
  private cache: DirectoryCache;

  constructor(serverUrl: string, baseDirectory: string = '/', enableCache: boolean = true, cacheTTLMinutes: number = 60) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.baseDirectory = baseDirectory.replace(/\/$/, '') || '/';
    this.cache = new DirectoryCache(cacheTTLMinutes);
    
    if (enableCache) {
      // Run cleanup every 15 minutes
      setInterval(() => this.cache.cleanup(), 15 * 60 * 1000);
    }
  }

  private resolvePath(path: string): string {
    // If path is absolute, ensure it's within base directory
    if (path.startsWith('/')) {
      if (!path.startsWith(this.baseDirectory)) {
        throw new Error(`Access denied: Path ${path} is outside base directory ${this.baseDirectory}`);
      }
      return path;
    }
    
    // Relative path - resolve relative to base directory
    const resolved = `${this.baseDirectory}/${path}`.replace(/\/+/g, '/');
    
    // Normalize path to remove .. and .
    const parts = resolved.split('/').filter(p => p && p !== '.');
    const normalized: string[] = [];
    for (const part of parts) {
      if (part === '..') {
        normalized.pop();
      } else {
        normalized.push(part);
      }
    }
    const normalizedPath = '/' + normalized.join('/');
    
    // Ensure resolved path is still within base directory
    if (!normalizedPath.startsWith(this.baseDirectory)) {
      throw new Error(`Access denied: Path ${path} resolves outside base directory ${this.baseDirectory}`);
    }
    
    return normalizedPath;
  }

  private getFullPath(path: string): string {
    const resolvedPath = this.resolvePath(path);
    return `${this.serverUrl}${resolvedPath}`;
  }

  async listDirectory(path: string, useCache: boolean = true): Promise<DirectoryEntry[]> {
    const resolvedPath = this.resolvePath(path);
    
    // Check cache first
    if (useCache) {
      const cached = this.cache.get(resolvedPath);
      if (cached) {
        return cached;
      }
    }
    
    // Cache miss - fetch from server
    try {
      const { stdout } = await execAsync(`xrdfs ${this.serverUrl} ls -l ${resolvedPath}`, {
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large directories
      });
      const entries: DirectoryEntry[] = [];
      
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      for (const line of lines) {
        // Format: drwxrwxr-x owner group size date time path
        const match = line.match(/^([-d])([rwx-]{9})\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/);
        if (match) {
          const [, type, perms, owner, group, size, dateStr, fullPath] = match;
          const name = fullPath.trim().split('/').pop() || fullPath.trim();
          entries.push({
            name,
            isDirectory: type === 'd',
            size: parseInt(size, 10),
            modificationTime: new Date(dateStr)
          });
        } else {
          const fullPath = line.split(/\s+/).pop()?.trim();
          if (fullPath) {
            const name = fullPath.split('/').pop() || fullPath;
            entries.push({
              name,
              isDirectory: false
            });
          }
        }
      }
      
      // Store in cache
      if (useCache) {
        this.cache.set(resolvedPath, entries);
      }
      
      return entries;
    } catch (error: any) {
      throw new Error(`Failed to list directory ${path}: ${error.message}`);
    }
  }
  
  getCacheStats(): { size: number; hitRate?: number } {
    return this.cache.getStats();
  }
  
  clearCache(): void {
    this.cache.clear();
  }

  async getFileInfo(path: string): Promise<FileInfo> {
    const resolvedPath = this.resolvePath(path);
    try {
      const { stdout } = await execAsync(`xrdfs ${this.serverUrl} stat ${resolvedPath}`);
      
      const sizeMatch = stdout.match(/Size:\s+(\d+)/);
      const modTimeMatch = stdout.match(/ModTime:\s+(.+)/);
      const isDirectoryMatch = stdout.match(/IsDir:\s+(true|false)/i);
      
      return {
        path: resolvedPath,
        size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
        modificationTime: modTimeMatch ? new Date(modTimeMatch[1]) : new Date(),
        isDirectory: isDirectoryMatch ? isDirectoryMatch[1].toLowerCase() === 'true' : false
      };
    } catch (error: any) {
      throw new Error(`Failed to get file info for ${path}: ${error.message}`);
    }
  }

  async readFile(path: string, start?: number, end?: number): Promise<Buffer> {
    const fullPath = this.getFullPath(path);
    
    try {
      let command = `xrdcp ${fullPath} -`;
      
      if (start !== undefined || end !== undefined) {
        const rangeStart = start ?? 0;
        const rangeEnd = end ?? '';
        command = `xrdcp --range ${rangeStart}:${rangeEnd} ${fullPath} -`;
      }
      
      const { stdout } = await execAsync(command, { 
        encoding: 'buffer',
        maxBuffer: 100 * 1024 * 1024 // 100MB max
      });
      
      return stdout as unknown as Buffer;
    } catch (error: any) {
      throw new Error(`Failed to read file ${path}: ${error.message}`);
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await this.getFileInfo(path);
      return true;
    } catch {
      return false;
    }
  }

  async getDirectorySize(path: string): Promise<number> {
    try {
      const entries = await this.listDirectory(path);
      let totalSize = 0;
      
      for (const entry of entries) {
        const fullPath = `${path}/${entry.name}`.replace(/\/+/g, '/');
        if (entry.isDirectory) {
          totalSize += await this.getDirectorySize(fullPath);
        } else {
          totalSize += entry.size ?? 0;
        }
      }
      
      return totalSize;
    } catch (error: any) {
      throw new Error(`Failed to calculate directory size for ${path}: ${error.message}`);
    }
  }

  // Search for files by pattern (glob or regex)
  async searchFiles(pattern: string, basePath: string = '.', recursive: boolean = true, useRegex: boolean = false): Promise<SearchResult[]> {
    const resolvedPath = this.resolvePath(basePath);
    const results: SearchResult[] = [];

    try {
      if (!useRegex) {
        // Use xrdfs find with glob pattern
        const findCommand = recursive 
          ? `xrdfs ${this.serverUrl} find ${resolvedPath} -name '${pattern}'`
          : `xrdfs ${this.serverUrl} ls ${resolvedPath}`;
        
        const { stdout } = await execAsync(findCommand);
        const paths = stdout.trim().split('\n').filter(p => p.trim());
        
        // Get info for each file
        for (const path of paths) {
          if (!path.trim()) continue;
          
          // For non-recursive, filter by pattern
          if (!recursive && pattern !== '*') {
            const fileName = path.split('/').pop() || '';
            const globRegex = this.globToRegex(pattern);
            if (!globRegex.test(fileName)) continue;
          }
          
          try {
            const info = await this.getFileInfo(path);
            results.push({
              path,
              size: info.size,
              modificationTime: info.modificationTime,
              isDirectory: info.isDirectory,
            });
          } catch {
            // Skip files we can't stat
          }
        }
      } else {
        // Regex search - need to list and filter
        const regex = new RegExp(pattern);
        await this.searchFilesRecursive(resolvedPath, regex, results, recursive);
      }

      return results;
    } catch (error: any) {
      throw new Error(`Failed to search files: ${error.message}`);
    }
  }

  private async searchFilesRecursive(path: string, regex: RegExp, results: SearchResult[], recursive: boolean): Promise<void> {
    const entries = await this.listDirectory(path, false); // Don't use cache for searches
    
    for (const entry of entries) {
      const fullPath = `${path}/${entry.name}`.replace(/\/+/g, '/');
      
      if (regex.test(entry.name)) {
        results.push({
          path: fullPath,
          size: entry.size ?? 0,
          modificationTime: entry.modificationTime ?? new Date(),
          isDirectory: entry.isDirectory,
        });
      }
      
      if (recursive && entry.isDirectory) {
        await this.searchFilesRecursive(fullPath, regex, results, recursive);
      }
    }
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  // Get directory statistics
  async getStatistics(path: string, recursive: boolean = true): Promise<DirectoryStatistics> {
    const resolvedPath = this.resolvePath(path);
    
    const stats: DirectoryStatistics = {
      totalFiles: 0,
      totalDirectories: 0,
      totalSize: 0,
      sizeByExtension: {},
    };

    await this.collectStatistics(resolvedPath, stats, recursive);
    return stats;
  }

  private async collectStatistics(path: string, stats: DirectoryStatistics, recursive: boolean): Promise<void> {
    const entries = await this.listDirectory(path, false);
    
    for (const entry of entries) {
      const fullPath = `${path}/${entry.name}`.replace(/\/+/g, '/');
      
      if (entry.isDirectory) {
        stats.totalDirectories++;
        if (recursive) {
          await this.collectStatistics(fullPath, stats, recursive);
        }
      } else {
        stats.totalFiles++;
        const size = entry.size ?? 0;
        stats.totalSize += size;
        
        // Track by extension
        const ext = entry.name.includes('.') ? entry.name.split('.').pop()! : 'no-extension';
        if (!stats.sizeByExtension[ext]) {
          stats.sizeByExtension[ext] = { count: 0, size: 0 };
        }
        stats.sizeByExtension[ext].count++;
        stats.sizeByExtension[ext].size += size;
        
        // Track oldest/newest/largest
        const mtime = entry.modificationTime ?? new Date(0);
        if (!stats.oldestFile || mtime < stats.oldestFile.mtime) {
          stats.oldestFile = { path: fullPath, mtime };
        }
        if (!stats.newestFile || mtime > stats.newestFile.mtime) {
          stats.newestFile = { path: fullPath, mtime };
        }
        if (!stats.largestFile || size > stats.largestFile.size) {
          stats.largestFile = { path: fullPath, size };
        }
      }
    }
  }

  // List directory with filters
  async listDirectoryFiltered(path: string, filter: FileFilter): Promise<DirectoryEntry[]> {
    const entries = await this.listDirectory(path);
    
    return entries.filter(entry => {
      // Extension filter
      if (filter.extension && !entry.name.endsWith(filter.extension)) {
        return false;
      }
      
      // Size filters
      if (filter.minSize !== undefined && (entry.size ?? 0) < filter.minSize) {
        return false;
      }
      if (filter.maxSize !== undefined && (entry.size ?? 0) > filter.maxSize) {
        return false;
      }
      
      // Time filters
      if (filter.modifiedAfter && entry.modificationTime && entry.modificationTime < filter.modifiedAfter) {
        return false;
      }
      if (filter.modifiedBefore && entry.modificationTime && entry.modificationTime > filter.modifiedBefore) {
        return false;
      }
      
      // Name pattern filter
      if (filter.namePattern) {
        const regex = this.globToRegex(filter.namePattern);
        if (!regex.test(entry.name)) {
          return false;
        }
      }
      
      return true;
    });
  }

  // Find files modified in time period
  async findRecentFiles(path: string, hours: number = 24, recursive: boolean = true): Promise<SearchResult[]> {
    const resolvedPath = this.resolvePath(path);
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const results: SearchResult[] = [];

    await this.findRecentFilesRecursive(resolvedPath, cutoffTime, results, recursive);
    return results;
  }

  private async findRecentFilesRecursive(path: string, cutoffTime: Date, results: SearchResult[], recursive: boolean): Promise<void> {
    const entries = await this.listDirectory(path, false);
    
    for (const entry of entries) {
      const fullPath = `${path}/${entry.name}`.replace(/\/+/g, '/');
      
      if (entry.isDirectory) {
        if (recursive) {
          await this.findRecentFilesRecursive(fullPath, cutoffTime, results, recursive);
        }
      } else {
        const mtime = entry.modificationTime ?? new Date(0);
        if (mtime >= cutoffTime) {
          results.push({
            path: fullPath,
            size: entry.size ?? 0,
            modificationTime: mtime,
            isDirectory: false,
          });
        }
      }
    }
  }

  // Campaign/Dataset discovery for EIC structure
  async listCampaigns(recoPath: string = 'RECO'): Promise<Campaign[]> {
    const resolvedPath = this.resolvePath(recoPath);
    const entries = await this.listDirectory(resolvedPath);
    
    return entries
      .filter(e => e.isDirectory)
      .map(e => ({
        name: e.name,
        path: `${resolvedPath}/${e.name}`.replace(/\/+/g, '/'),
        modificationTime: e.modificationTime,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listDatasets(campaign: string, recoPath: string = 'RECO'): Promise<Dataset[]> {
    const campaignPath = this.resolvePath(`${recoPath}/${campaign}`);
    const datasets: Dataset[] = [];

    // Navigate campaign structure: campaign/detector/process_type/process
    try {
      const detectors = await this.listDirectory(campaignPath);
      
      for (const detector of detectors.filter(e => e.isDirectory)) {
        const detectorPath = `${campaignPath}/${detector.name}`;
        const processTypes = await this.listDirectory(detectorPath);
        
        for (const processType of processTypes.filter(e => e.isDirectory)) {
          const processTypePath = `${detectorPath}/${processType.name}`;
          const processes = await this.listDirectory(processTypePath);
          
          for (const process of processes.filter(e => e.isDirectory)) {
            const processPath = `${processTypePath}/${process.name}`;
            const datasetName = `${detector.name}/${processType.name}/${process.name}`;
            
            datasets.push({
              name: datasetName,
              path: processPath,
            });
          }
        }
      }
    } catch (error: any) {
      // If structure doesn't match expected, just return top-level directories
      const entries = await this.listDirectory(campaignPath);
      return entries
        .filter(e => e.isDirectory)
        .map(e => ({
          name: e.name,
          path: `${campaignPath}/${e.name}`,
        }));
    }

    return datasets;
  }

  // Summarize files added in time period
  async summarizeRecentChanges(path: string, hours: number = 24): Promise<{
    totalFilesAdded: number;
    totalSizeAdded: number;
    filesByExtension: Record<string, number>;
    sizeByExtension: Record<string, number>;
    filesByDirectory: Record<string, number>;
    recentFiles: SearchResult[];
  }> {
    const recentFiles = await this.findRecentFiles(path, hours, true);
    
    const summary = {
      totalFilesAdded: recentFiles.length,
      totalSizeAdded: 0,
      filesByExtension: {} as Record<string, number>,
      sizeByExtension: {} as Record<string, number>,
      filesByDirectory: {} as Record<string, number>,
      recentFiles: recentFiles.sort((a, b) => 
        b.modificationTime.getTime() - a.modificationTime.getTime()
      ),
    };

    for (const file of recentFiles) {
      summary.totalSizeAdded += file.size;
      
      // By extension
      const ext = file.path.includes('.') ? file.path.split('.').pop()! : 'no-extension';
      summary.filesByExtension[ext] = (summary.filesByExtension[ext] || 0) + 1;
      summary.sizeByExtension[ext] = (summary.sizeByExtension[ext] || 0) + file.size;
      
      // By directory
      const dir = file.path.substring(0, file.path.lastIndexOf('/'));
      summary.filesByDirectory[dir] = (summary.filesByDirectory[dir] || 0) + 1;
    }

    return summary;
  }
}

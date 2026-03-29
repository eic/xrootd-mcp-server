import { openFile, treeDraw } from 'jsroot';
import { XRootDClient } from './xrootd.js';

/**
 * Thrown when HTTP access to a ROOT file fails and allowCopy is false.
 * The client should retry with allow_copy: true to permit the file copy via xrdcp.
 */
export class CopyRequiredError extends Error {
  constructor(
    public readonly remotePath: string,
    public readonly httpUrl: string,
    httpError: string,
  ) {
    super(
      `HTTP access failed for ${remotePath} (tried ${httpUrl}): ${httpError}. ` +
      `Analyzing this file requires copying it via xrdcp. ` +
      `Retry with allow_copy: true to permit the file copy.`
    );
    this.name = 'CopyRequiredError';
  }
}

export interface ROOTFileStructure {
  path: string;
  size: number;
  keys: ROOTKey[];
  trees: ROOTTreeInfo[];
  directories: string[];
}

export interface ROOTKey {
  name: string;
  className: string;
  cycle: number;
  title: string;
}

export interface ROOTTreeInfo {
  name: string;
  entries: number;
  branches: ROOTBranchInfo[];
  totalSize: number;
  zipBytes: number;
}

export interface ROOTBranchInfo {
  name: string;
  entries: number;
  totalSize: number;
  zipBytes: number;
  compressionFactor: number;
}

export interface PodioMetadata {
  [key: string]: any;
}

export interface EventStatistics {
  totalEvents: number;
  collectionStats: Record<string, CollectionStatistics>;
}

export interface CollectionStatistics {
  name: string;
  entries: number;
  totalSize: number;
  zipBytes: number;
  compressionFactor: number;
  averageSizePerEvent: number;
}

export interface DatasetEventStatistics {
  datasetPath: string;
  files: FileEventStatistics[];
  totalEvents: number;
  totalSize: number;
  totalZipBytes: number;
  averageEventsPerFile: number;
  collectionAggregates: Record<string, AggregatedCollectionStats>;
}

export interface FileEventStatistics {
  path: string;
  events: number;
  size: number;
  zipBytes: number;
  collections: Record<string, CollectionStatistics>;
}

export interface AggregatedCollectionStats {
  name: string;
  totalEntries: number;
  totalSize: number;
  totalZipBytes: number;
  averageCompressionFactor: number;
  filesContaining: number;
}

export interface HistogramResult {
  file: string;
  tree: string;
  branch: string;
  cut?: string;
  bins: number;
  xmin: number;
  xmax: number;
  /** Bin edges array of length bins+1 (left edge of each bin, plus the right edge of the last bin) */
  edges: number[];
  /** Bin counts array of length bins */
  counts: number[];
  underflow: number;
  overflow: number;
  entries: number;
  mean: number;
  stddev: number;
}

export class ROOTAnalyzer {
  constructor(private xrootdClient: XRootDClient) {}

  /**
   * Open a ROOT file, preferring HTTP-based access via jsroot.
   * If HTTP access fails and allowCopy is false, throws CopyRequiredError.
   * If HTTP access fails and allowCopy is true, falls back to a full xrdcp copy.
   */
  private async openRootFile(remotePath: string, allowCopy: boolean): Promise<any> {
    const httpUrl = this.xrootdClient.getHttpUrl(remotePath);

    try {
      const file = await openFile(httpUrl);
      if (!file) {
        throw new Error('openFile returned null');
      }
      return file;
    } catch (httpError: any) {
      const httpErrorDetail = String(httpError?.message ?? httpError);
      if (!allowCopy) {
        throw new CopyRequiredError(remotePath, httpUrl, httpErrorDetail);
      }
      // Fall back to a full xrdcp copy
      const fileData = await this.xrootdClient.readFile(remotePath);
      const blob = new Blob([new Uint8Array(fileData)]);
      const file = await openFile(blob);
      if (!file) {
        throw new Error('Failed to open ROOT file via xrdcp copy');
      }
      return file;
    }
  }

  async analyzeFile(remotePath: string, allowCopy: boolean = false): Promise<ROOTFileStructure> {
    const file = await this.openRootFile(remotePath, allowCopy);

    const structure: ROOTFileStructure = {
      path: remotePath,
      size: (file.fEND as number | undefined) ?? 0,
      keys: [],
      trees: [],
      directories: [],
    };

    // Get list of keys in the file
    await this.extractKeys(file, structure);
    
    // Analyze TTrees
    for (const key of structure.keys) {
      if (key.className === 'TTree') {
        const treeInfo = await this.analyzeTree(file, key.name);
        if (treeInfo) {
          structure.trees.push(treeInfo);
        }
      } else if (key.className === 'TDirectory' || key.className.includes('Directory')) {
        structure.directories.push(key.name);
      }
    }

    return structure;
  }

  private async extractKeys(file: any, structure: ROOTFileStructure): Promise<void> {
    const keys = file.fKeys;
    if (!keys) return;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      structure.keys.push({
        name: key.fName,
        className: key.fClassName,
        cycle: key.fCycle,
        title: key.fTitle || '',
      });
    }
  }

  private async analyzeTree(file: any, treeName: string): Promise<ROOTTreeInfo | null> {
    try {
      const tree = await file.readObject(treeName);
      if (!tree || !(tree as any).fEntries) {
        return null;
      }

      const ttree = tree as any;
      const branches: ROOTBranchInfo[] = [];
      
      // Analyze branches
      if (ttree.fBranches) {
        for (let i = 0; i < ttree.fBranches.arr.length; i++) {
          const branch = ttree.fBranches.arr[i];
          const totalSize = branch.fTotBytes || 0;
          const zipBytes = branch.fZipBytes || 0;
          const compressionFactor = zipBytes > 0 ? totalSize / zipBytes : 1.0;

          branches.push({
            name: branch.fName,
            entries: branch.fEntries || 0,
            totalSize,
            zipBytes,
            compressionFactor,
          });
        }
      }

      const totalSize = ttree.fTotBytes || 0;
      const zipBytes = ttree.fZipBytes || 0;

      return {
        name: treeName,
        entries: ttree.fEntries || 0,
        branches,
        totalSize,
        zipBytes,
      };
    } catch (error) {
      console.error(`Failed to analyze tree ${treeName}:`, error);
      return null;
    }
  }

  async extractPodioMetadata(remotePath: string, allowCopy: boolean = false): Promise<PodioMetadata> {
    const file = await this.openRootFile(remotePath, allowCopy);

    const metadata: PodioMetadata = {};

    try {
      const tree = await file.readObject('podio_metadata');
      if (!tree) {
        return metadata;
      }

      const ttree = tree as any;
      
      // Read metadata branches
      if (ttree.fBranches) {
        for (let i = 0; i < ttree.fBranches.arr.length; i++) {
          const branch = ttree.fBranches.arr[i];
          const branchName = branch.fName;
          
          try {
            // Try to read branch data
            const branchData = await ttree.getBranch(branchName);
            if (branchData) {
              metadata[branchName] = {
                entries: branch.fEntries || 0,
                type: branch.fClassName || 'unknown',
              };
            }
          } catch (error) {
            // Branch might not be readable, just record its existence
            metadata[branchName] = {
              entries: branch.fEntries || 0,
              type: branch.fClassName || 'unknown',
            };
          }
        }
      }
    } catch (error) {
      console.error('Failed to extract podio_metadata:', error);
    }

    return metadata;
  }

  async getEventStatistics(remotePath: string, allowCopy: boolean = false): Promise<EventStatistics> {
    const file = await this.openRootFile(remotePath, allowCopy);

    let totalEvents = 0;
    const collectionStats: Record<string, CollectionStatistics> = {};

    try {
      const eventsTree = await file.readObject('events');
      if (eventsTree && (eventsTree as any).fEntries) {
        const ttree = eventsTree as any;
        totalEvents = ttree.fEntries || 0;

        // Analyze each branch (collection) in events tree
        if (ttree.fBranches) {
          for (let i = 0; i < ttree.fBranches.arr.length; i++) {
            const branch = ttree.fBranches.arr[i];
            const totalSize = branch.fTotBytes || 0;
            const zipBytes = branch.fZipBytes || 0;
            const compressionFactor = zipBytes > 0 ? totalSize / zipBytes : 1.0;
            const entries = branch.fEntries || 0;
            const avgSizePerEvent = entries > 0 ? totalSize / entries : 0;

            collectionStats[branch.fName] = {
              name: branch.fName,
              entries,
              totalSize,
              zipBytes,
              compressionFactor,
              averageSizePerEvent: avgSizePerEvent,
            };
          }
        }
      }
    } catch (error) {
      console.error('Failed to analyze events tree:', error);
    }

    return {
      totalEvents,
      collectionStats,
    };
  }

  async getDatasetEventStatistics(datasetPath: string, allowCopy: boolean = false): Promise<DatasetEventStatistics> {
    // List all ROOT files in dataset
    const files = await this.xrootdClient.searchFiles('*.root', datasetPath, true, false);
    
    const fileStats: FileEventStatistics[] = [];
    let totalEvents = 0;
    let totalSize = 0;
    let totalZipBytes = 0;
    const collectionAggregates: Record<string, AggregatedCollectionStats> = {};

    // Analyze each file
    for (const file of files) {
      try {
        const eventStats = await this.getEventStatistics(file.path, allowCopy);
        
        const fileEventStats: FileEventStatistics = {
          path: file.path,
          events: eventStats.totalEvents,
          size: 0,
          zipBytes: 0,
          collections: eventStats.collectionStats,
        };

        // Aggregate collection stats
        for (const [collName, collStats] of Object.entries(eventStats.collectionStats)) {
          fileEventStats.size += collStats.totalSize;
          fileEventStats.zipBytes += collStats.zipBytes;

          if (!collectionAggregates[collName]) {
            collectionAggregates[collName] = {
              name: collName,
              totalEntries: 0,
              totalSize: 0,
              totalZipBytes: 0,
              averageCompressionFactor: 0,
              filesContaining: 0,
            };
          }

          collectionAggregates[collName].totalEntries += collStats.entries;
          collectionAggregates[collName].totalSize += collStats.totalSize;
          collectionAggregates[collName].totalZipBytes += collStats.zipBytes;
          collectionAggregates[collName].filesContaining++;
        }

        totalEvents += eventStats.totalEvents;
        totalSize += fileEventStats.size;
        totalZipBytes += fileEventStats.zipBytes;
        
        fileStats.push(fileEventStats);
      } catch (error) {
        // Rethrow CopyRequiredError so the caller gets actionable guidance
        // instead of silently returning a zeroed aggregate.
        if (error instanceof CopyRequiredError) {
          throw error;
        }
        console.error(`Failed to analyze file ${file.path}:`, error);
      }
    }

    // Calculate average compression factors
    for (const agg of Object.values(collectionAggregates)) {
      agg.averageCompressionFactor = agg.totalZipBytes > 0 
        ? agg.totalSize / agg.totalZipBytes 
        : 1.0;
    }

    return {
      datasetPath,
      files: fileStats,
      totalEvents,
      totalSize,
      totalZipBytes,
      averageEventsPerFile: files.length > 0 ? totalEvents / files.length : 0,
      collectionAggregates,
    };
  }

  async histogramBranch(
    remotePath: string,
    branch: string,
    treeName: string = 'events',
    bins: number = 100,
    xmin?: number,
    xmax?: number,
    cut?: string,
    allowCopy: boolean = false,
  ): Promise<HistogramResult> {
    // Validate the range before opening the file so callers get a fast, clear error.
    const hasXmin = xmin !== undefined;
    const hasXmax = xmax !== undefined;
    if (hasXmin !== hasXmax) {
      throw new Error(
        `histogramBranch requires both xmin and xmax when specifying an explicit range ` +
        `(got xmin=${String(xmin)}, xmax=${String(xmax)})`,
      );
    }
    const hasRange = hasXmin && hasXmax;

    const file = await this.openRootFile(remotePath, allowCopy);

    const tree = await file.readObject(treeName);
    if (!tree) {
      throw new Error(`Tree "${treeName}" not found in ${remotePath}`);
    }

    // Build the draw expression: "branch >> h(nbins,xmin,xmax)" or just "branch"
    const expr = hasRange ? `${branch} >> h(${bins},${xmin},${xmax})` : branch;

    let hist: any;
    try {
      hist = await treeDraw(tree, { expr, cut });
    } catch (err: any) {
      throw new Error(`Failed to histogram branch "${branch}" in tree "${treeName}": ${err?.message ?? err}`);
    }

    if (!hist) {
      throw new Error(`treeDraw returned no histogram for branch "${branch}"`);
    }

    const nbins: number = hist.fXaxis.fNbins;
    const actualXmin: number = hist.fXaxis.fXmin;
    const actualXmax: number = hist.fXaxis.fXmax;

    // Compute evenly-spaced bin edges (nbins+1 values)
    const edges: number[] = [];
    const binWidth = (actualXmax - actualXmin) / nbins;
    for (let i = 0; i <= nbins; i++) {
      edges.push(actualXmin + i * binWidth);
    }

    // fArray: [0]=underflow, [1..nbins]=bins, [nbins+1]=overflow
    const fArray: number[] = Array.from(hist.fArray as ArrayLike<number>);
    const underflow = fArray[0] ?? 0;
    const overflow = fArray[nbins + 1] ?? 0;
    const counts = fArray.slice(1, nbins + 1);

    // Derive mean and stddev from running sums stored in the histogram
    const sumw: number = hist.fTsumw ?? 0;
    const sumwx: number = hist.fTsumwx ?? 0;
    const sumwx2: number = hist.fTsumwx2 ?? 0;
    const mean = sumw > 0 ? sumwx / sumw : 0;
    const variance = sumw > 0 ? sumwx2 / sumw - mean * mean : 0;
    const stddev = Math.sqrt(Math.max(0, variance));

    const result: HistogramResult = {
      file: remotePath,
      tree: treeName,
      branch,
      bins: nbins,
      xmin: actualXmin,
      xmax: actualXmax,
      edges,
      counts,
      underflow,
      overflow,
      entries: sumw,
      mean,
      stddev,
    };
    if (cut !== undefined) {
      result.cut = cut;
    }
    return result;
  }
}

import { openFile } from 'jsroot';
import { XRootDClient } from './xrootd.js';

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

export class ROOTAnalyzer {
  constructor(private xrootdClient: XRootDClient) {}

  async analyzeFile(remotePath: string): Promise<ROOTFileStructure> {
    // Read the entire ROOT file into memory
    const fileData = await this.xrootdClient.readFile(remotePath);
    
    // Create a blob from the buffer for jsroot
    const blob = new Blob([new Uint8Array(fileData)]);
    const file = await openFile(blob);
    
    if (!file) {
      throw new Error('Failed to open ROOT file');
    }

    const structure: ROOTFileStructure = {
      path: remotePath,
      size: fileData.length,
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

  async extractPodioMetadata(remotePath: string): Promise<PodioMetadata> {
    const fileData = await this.xrootdClient.readFile(remotePath);
    const blob = new Blob([new Uint8Array(fileData)]);
    const file = await openFile(blob);
    
    if (!file) {
      throw new Error('Failed to open ROOT file');
    }

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

  async getEventStatistics(remotePath: string): Promise<EventStatistics> {
    const fileData = await this.xrootdClient.readFile(remotePath);
    const blob = new Blob([new Uint8Array(fileData)]);
    const file = await openFile(blob);
    
    if (!file) {
      throw new Error('Failed to open ROOT file');
    }

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

  async getDatasetEventStatistics(datasetPath: string): Promise<DatasetEventStatistics> {
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
        const eventStats = await this.getEventStatistics(file.path);
        
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
}

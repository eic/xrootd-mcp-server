import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { XRootDClient } from '../src/xrootd.js';
import { ROOTAnalyzer } from '../src/root-analysis.js';

const XROOTD_SERVER = process.env.XROOTD_SERVER || 'root://dtn-eic.jlab.org';
const TEST_ROOT_FILE = process.env.TEST_ROOT_FILE || '/work/eic2/EPIC/RECO/24.07.0/epic_craterlake/DIS/NC/18x275/q2_0.001_1.0/pythia8NCDIS_18x275_minQ2=0.001_beamEffects_xAngle=-0.025_hiDiv_1.0000.eicrecon.tree.edm4eic.root';

describe('ROOT File Analysis', () => {
  let client: XRootDClient;
  let analyzer: ROOTAnalyzer;

  before(() => {
    client = new XRootDClient(XROOTD_SERVER, '/work/eic2/EPIC', false);
    analyzer = new ROOTAnalyzer(client);
  });

  it('should analyze ROOT file structure', async () => {
    try {
      const structure = await analyzer.analyzeFile(TEST_ROOT_FILE);
      
      assert.ok(structure, 'Structure should be returned');
      assert.ok(structure.path, 'Path should be set');
      assert.ok(structure.size > 0, 'Size should be positive');
      assert.ok(Array.isArray(structure.keys), 'Keys should be an array');
      assert.ok(Array.isArray(structure.trees), 'Trees should be an array');
      assert.ok(Array.isArray(structure.directories), 'Directories should be an array');
      
      console.error(`  ✓ File size: ${structure.size} bytes`);
      console.error(`  ✓ Keys found: ${structure.keys.length}`);
      console.error(`  ✓ Trees found: ${structure.trees.length}`);
      console.error(`  ✓ Directories found: ${structure.directories.length}`);
    } catch (error: any) {
      // Skip test if file doesn't exist
      if (error.message.includes('Failed to read file')) {
        console.error('  ⊘ Skipping - test file not accessible');
        return;
      }
      throw error;
    }
  });

  it('should extract podio metadata', async () => {
    try {
      const metadata = await analyzer.extractPodioMetadata(TEST_ROOT_FILE);
      
      assert.ok(metadata, 'Metadata should be returned');
      assert.ok(typeof metadata === 'object', 'Metadata should be an object');
      
      const metadataKeys = Object.keys(metadata);
      console.error(`  ✓ Metadata keys found: ${metadataKeys.length}`);
      
      if (metadataKeys.length > 0) {
        console.error(`  ✓ Sample keys: ${metadataKeys.slice(0, 3).join(', ')}`);
      }
    } catch (error: any) {
      if (error.message.includes('Failed to read file')) {
        console.error('  ⊘ Skipping - test file not accessible');
        return;
      }
      throw error;
    }
  });

  it('should get event statistics', async () => {
    try {
      const stats = await analyzer.getEventStatistics(TEST_ROOT_FILE);
      
      assert.ok(stats, 'Statistics should be returned');
      assert.ok(typeof stats.totalEvents === 'number', 'Total events should be a number');
      assert.ok(stats.totalEvents >= 0, 'Total events should be non-negative');
      assert.ok(typeof stats.collectionStats === 'object', 'Collection stats should be an object');
      
      const collectionCount = Object.keys(stats.collectionStats).length;
      console.error(`  ✓ Total events: ${stats.totalEvents}`);
      console.error(`  ✓ Collections found: ${collectionCount}`);
      
      if (collectionCount > 0) {
        const firstCollection = Object.values(stats.collectionStats)[0];
        console.error(`  ✓ Sample collection: ${firstCollection.name}`);
        console.error(`    - Entries: ${firstCollection.entries}`);
        console.error(`    - Total size: ${firstCollection.totalSize} bytes`);
        console.error(`    - Compression factor: ${firstCollection.compressionFactor.toFixed(2)}`);
      }
    } catch (error: any) {
      if (error.message.includes('Failed to read file')) {
        console.error('  ⊘ Skipping - test file not accessible');
        return;
      }
      throw error;
    }
  });

  it('should get dataset event statistics', async () => {
    const datasetPath = 'RECO/24.07.0/epic_craterlake/DIS/NC/18x275/q2_0.001_1.0';
    
    try {
      // First check if directory exists
      const exists = await client.fileExists(datasetPath);
      if (!exists) {
        console.error('  ⊘ Skipping - test dataset not accessible');
        return;
      }

      // Limit to first 2 files for testing
      const files = await client.searchFiles('*.root', datasetPath, false, false);
      const limitedFiles = files.slice(0, 2);
      
      if (limitedFiles.length === 0) {
        console.error('  ⊘ Skipping - no ROOT files found in dataset');
        return;
      }

      // Analyze first file only for test performance
      const stats = await analyzer.getEventStatistics(limitedFiles[0].path);
      
      assert.ok(stats, 'Statistics should be returned');
      console.error(`  ✓ Analyzed ${limitedFiles.length} file(s)`);
      console.error(`  ✓ Total events in first file: ${stats.totalEvents}`);
      console.error(`  ✓ Collections: ${Object.keys(stats.collectionStats).length}`);
    } catch (error: any) {
      if (error.message.includes('Failed to read file') || 
          error.message.includes('Failed to list directory')) {
        console.error('  ⊘ Skipping - test dataset not accessible');
        return;
      }
      throw error;
    }
  });
});

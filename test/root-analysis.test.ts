import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { XRootDClient } from '../src/xrootd.js';
import { ROOTAnalyzer, CopyRequiredError } from '../src/root-analysis.js';

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
      // allow_copy: true so we fall back to xrdcp if HTTP is unavailable
      const structure = await analyzer.analyzeFile(TEST_ROOT_FILE, true);
      
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
      const metadata = await analyzer.extractPodioMetadata(TEST_ROOT_FILE, true);
      
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
      const stats = await analyzer.getEventStatistics(TEST_ROOT_FILE, true);
      
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

      // Analyze first file only for test performance; allow_copy for environments
      // where HTTP access is not available.
      const stats = await analyzer.getEventStatistics(limitedFiles[0].path, true);
      
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

describe('HTTP Fallback Behavior', () => {
  // The test XRootD server does not expose an HTTP endpoint, so jsroot's
  // HTTP-based access should fail, causing CopyRequiredError to be raised
  // when allow_copy is false (the default).
  let client: XRootDClient;
  let analyzer: ROOTAnalyzer;
  // Use an unreachable server so HTTP requests fail deterministically.
  let unreachableAnalyzer: ROOTAnalyzer;

  before(() => {
    client = new XRootDClient(XROOTD_SERVER, '/work/eic2/EPIC', false);
    analyzer = new ROOTAnalyzer(client);
    const unreachableClient = new XRootDClient('root://localhost:19999', '/', false);
    unreachableAnalyzer = new ROOTAnalyzer(unreachableClient);
  });

  it('getHttpUrl should convert root:// to https://', () => {
    const client2 = new XRootDClient('root://example.jlab.org', '/', false);
    const url = client2.getHttpUrl('/some/file.root');
    assert.strictEqual(url, 'https://example.jlab.org/some/file.root');
  });

  it('getHttpUrl should preserve port when present', () => {
    const client2 = new XRootDClient('root://example.jlab.org:1094', '/', false);
    const url = client2.getHttpUrl('/some/file.root');
    assert.strictEqual(url, 'https://example.jlab.org:1094/some/file.root');
  });

  it('getHttpUrl should percent-encode special characters in path segments', () => {
    const client2 = new XRootDClient('root://example.jlab.org', '/', false);
    // '#' would start a fragment, '=' and '+' need encoding; '/' must be preserved
    const url = client2.getHttpUrl('/dir#1/q2=10/pi+/file.root');
    assert.strictEqual(
      url,
      'https://example.jlab.org/dir%231/q2%3D10/pi%2B/file.root',
      'Special chars in path segments should be percent-encoded'
    );
  });

  it('getHttpUrl should not produce a double slash for root-based paths', () => {
    const client2 = new XRootDClient('root://example.jlab.org', '/', false);
    const url = client2.getHttpUrl('/data/file.root');
    assert.ok(!url.includes('//data'), `URL should not contain double slash before path: ${url}`);
  });

  it('should throw CopyRequiredError when HTTP access fails and allow_copy is false', async () => {
    // Use a deliberately unreachable HTTPS URL by pointing at localhost with
    // an unused port so that the HTTP request fails immediately.
    try {
      await unreachableAnalyzer.analyzeFile('/nonexistent.root', false);
      assert.fail('Expected CopyRequiredError to be thrown');
    } catch (error: any) {
      assert.ok(
        error instanceof CopyRequiredError || error.name === 'CopyRequiredError',
        `Expected CopyRequiredError but got ${error.name}: ${error.message}`
      );
      assert.ok(
        error.message.includes('allow_copy: true'),
        'Error message should contain guidance on using allow_copy: true'
      );
      assert.ok(error.httpUrl, 'CopyRequiredError should include the attempted HTTP URL');
      assert.ok(
        error.httpUrl.startsWith('https://'),
        `HTTP URL should start with https://, got: ${error.httpUrl}`
      );
    }
  });

  it('should throw CopyRequiredError for all three analysis methods when HTTP fails', async () => {
    for (const methodName of ['analyzeFile', 'extractPodioMetadata', 'getEventStatistics'] as const) {
      try {
        await unreachableAnalyzer[methodName]('/nonexistent.root', false);
        assert.fail(`Expected CopyRequiredError from ${methodName}`);
      } catch (error: any) {
        assert.ok(
          error instanceof CopyRequiredError || error.name === 'CopyRequiredError',
          `${methodName}: Expected CopyRequiredError but got ${error.name}: ${error.message}`
        );
      }
    }
  });

  it('should fall back to xrdcp copy when allow_copy is true and HTTP fails', async () => {
    // With allow_copy=true the code must not raise CopyRequiredError;
    // it should try xrdcp instead (which may itself fail if the file
    // does not exist, but the failure reason must be different).
    try {
      await unreachableAnalyzer.analyzeFile('/nonexistent.root', true);
      // If this somehow succeeds, that's also fine.
    } catch (error: any) {
      // Must NOT be CopyRequiredError – the code should have attempted xrdcp
      assert.ok(
        !(error instanceof CopyRequiredError) && error.name !== 'CopyRequiredError',
        `Should not get CopyRequiredError with allow_copy=true, but got: ${error.message}`
      );
      // The xrdcp failure (file not found / connection refused) is expected
      console.error(`  ✓ xrdcp fallback attempted (failed as expected: ${error.message.slice(0, 80)})`);
    }
  });
});

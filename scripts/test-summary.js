#!/usr/bin/env node

/**
 * Generate test and coverage summary for GitHub Actions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateTestSummary() {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  
  if (!summaryFile) {
    console.log('Not running in GitHub Actions, skipping summary');
    return;
  }

  let summary = '## Test Results\n\n';
  
  // Read coverage summary if it exists
  const coverageSummaryPath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
  
  if (fs.existsSync(coverageSummaryPath)) {
    const coverageData = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
    const totals = coverageData.total;
    
    // Check if we have valid coverage data
    if (totals && totals.statements && typeof totals.statements.pct === 'number') {
      summary += '### Coverage Summary\n\n';
      summary += '| Metric | Percentage | Covered/Total |\n';
      summary += '|--------|------------|---------------|\n';
      summary += `| **Statements** | ${totals.statements.pct.toFixed(2)}% | ${totals.statements.covered}/${totals.statements.total} |\n`;
      summary += `| **Branches** | ${totals.branches.pct.toFixed(2)}% | ${totals.branches.covered}/${totals.branches.total} |\n`;
      summary += `| **Functions** | ${totals.functions.pct.toFixed(2)}% | ${totals.functions.covered}/${totals.functions.total} |\n`;
      summary += `| **Lines** | ${totals.lines.pct.toFixed(2)}% | ${totals.lines.covered}/${totals.lines.total} |\n`;
      summary += '\n';
    
      // Overall status
      const avgCoverage = (
        totals.statements.pct +
        totals.branches.pct +
        totals.functions.pct +
        totals.lines.pct
      ) / 4;
      
      if (avgCoverage >= 80) {
        summary += '✅ **Overall Coverage: EXCELLENT** (' + avgCoverage.toFixed(2) + '%)\n\n';
      } else if (avgCoverage >= 60) {
        summary += '⚠️ **Overall Coverage: GOOD** (' + avgCoverage.toFixed(2) + '%)\n\n';
      } else {
        summary += '❌ **Overall Coverage: NEEDS IMPROVEMENT** (' + avgCoverage.toFixed(2) + '%)\n\n';
      }
      
      // Per-file coverage
      summary += '### Coverage by File\n\n';
      summary += '| File | Statements | Branches | Functions | Lines |\n';
      summary += '|------|------------|----------|-----------|-------|\n';
      
      for (const [file, data] of Object.entries(coverageData)) {
        if (file === 'total') continue;
        
        const fileName = file.replace(/^.*[\\\/]/, ''); // Get basename
        const stmtPct = data.statements.pct.toFixed(1);
        const branchPct = data.branches.pct.toFixed(1);
        const funcPct = data.functions.pct.toFixed(1);
        const linePct = data.lines.pct.toFixed(1);
        
        summary += `| ${fileName} | ${stmtPct}% | ${branchPct}% | ${funcPct}% | ${linePct}% |\n`;
      }
      summary += '\n';
    } else {
      summary += '⚠️ No valid coverage data available\n\n';
    }
  } else {
    summary += '⚠️ No coverage report found\n\n';
  }
  
  // Test execution info
  summary += '### Test Execution\n\n';
  summary += `- **Test Suite**: XRootD MCP Server Integration Tests\n`;
  summary += `- **Server**: ${process.env.XROOTD_SERVER || 'root://dtn-eic.jlab.org'}\n`;
  summary += `- **Base Directory**: ${process.env.XROOTD_BASE_DIR || '/volatile/eic/EPIC'}\n`;
  summary += `- **Node.js Version**: ${process.version}\n`;
  summary += `- **Timestamp**: ${new Date().toISOString()}\n`;
  
  fs.appendFileSync(summaryFile, summary);
  console.log('Test summary written to GitHub Actions');
}

try {
  generateTestSummary();
} catch (error) {
  console.error('Error generating test summary:', error);
  process.exit(1);
}

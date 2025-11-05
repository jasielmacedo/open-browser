#!/usr/bin/env node

/**
 * Download Ollama binaries for bundling with the application
 *
 * This script downloads the Ollama executables for Windows and macOS
 * from the official GitHub releases.
 *
 * Version: 0.12.9
 * Release Date: November 1, 2025
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const OLLAMA_VERSION = 'v0.12.9';
const BASE_URL = `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}`;

const DOWNLOADS = [
  {
    name: 'Windows (x64)',
    url: `${BASE_URL}/ollama-windows-amd64.zip`,
    filename: 'ollama-windows-amd64.zip',
    outputDir: 'win32',
  },
  {
    name: 'macOS (Universal)',
    url: `${BASE_URL}/ollama-darwin.zip`,
    filename: 'ollama-darwin.zip',
    outputDir: 'darwin',
  },
];

const binDir = path.join(__dirname, '..', 'resources', 'bin');

/**
 * Download a file from URL
 */
function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    console.log(`  Downloading from: ${url}`);

    https
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.close();
          fs.unlinkSync(destination);
          return downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destination);
          return reject(new Error(`Failed to download: ${response.statusCode}`));
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastPercent = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const percent = Math.floor((downloadedSize / totalSize) * 100);

          if (percent !== lastPercent && percent % 10 === 0) {
            process.stdout.write(`\r  Progress: ${percent}%`);
            lastPercent = percent;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          process.stdout.write('\r  Progress: 100%\n');
          resolve();
        });
      })
      .on('error', (err) => {
        file.close();
        fs.unlinkSync(destination);
        reject(err);
      });
  });
}

/**
 * Extract zip file
 */
async function extractZip(zipPath, targetDir) {
  console.log(`  Extracting to: ${targetDir}`);

  const platform = process.platform;

  if (platform === 'win32') {
    // Use PowerShell on Windows
    const command = `powershell -command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${targetDir}'"`;
    await execAsync(command);
  } else {
    // Use unzip on Unix-like systems
    const command = `unzip -o "${zipPath}" -d "${targetDir}"`;
    await execAsync(command);
  }

  console.log('  ✓ Extraction complete');
}

/**
 * Main download process
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        Ollama Binary Download Script                     ║');
  console.log('║        Version: ' + OLLAMA_VERSION.padEnd(43) + '║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Create bin directory if it doesn't exist
  if (!fs.existsSync(binDir)) {
    console.log('Creating resources/bin directory...\n');
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Check if binaries already exist
  const win32Exists = fs.existsSync(path.join(binDir, 'win32', 'ollama.exe'));
  const darwinExists = fs.existsSync(path.join(binDir, 'darwin', 'Ollama.app'));

  if (win32Exists && darwinExists) {
    console.log('✓ Ollama binaries already downloaded.\n');
    console.log('To force re-download, delete the resources/bin directory first.\n');
    return;
  }

  console.log('Starting download of Ollama binaries...\n');
  console.log('⚠️  Warning: This will download ~1.8GB of data\n');

  for (const download of DOWNLOADS) {
    console.log(`\n[${DOWNLOADS.indexOf(download) + 1}/${DOWNLOADS.length}] ${download.name}`);
    console.log('─'.repeat(60));

    const zipPath = path.join(binDir, download.filename);
    const targetDir = path.join(binDir, download.outputDir);

    try {
      // Check if already downloaded
      const targetExists =
        download.outputDir === 'win32'
          ? fs.existsSync(path.join(targetDir, 'ollama.exe'))
          : fs.existsSync(path.join(targetDir, 'Ollama.app'));

      if (targetExists) {
        console.log('  ✓ Already downloaded, skipping...');
        continue;
      }

      // Download
      if (!fs.existsSync(zipPath)) {
        console.log('  Downloading...');
        await downloadFile(download.url, zipPath);
      } else {
        console.log('  ✓ Archive already exists, skipping download');
      }

      // Create target directory
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Extract
      await extractZip(zipPath, targetDir);

      // Clean up zip file
      console.log('  Cleaning up archive...');
      fs.unlinkSync(zipPath);
      console.log('  ✓ Complete');
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      process.exit(1);
    }
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║              Download Complete! ✓                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('Ollama binaries have been downloaded to:');
  console.log(`  • Windows: ${path.join(binDir, 'win32', 'ollama.exe')}`);
  console.log(`  • macOS:   ${path.join(binDir, 'darwin', 'Ollama.app')}\n`);
  console.log('You can now run: npm run dev\n');
}

// Run the script
main().catch((error) => {
  console.error('\n✗ Fatal error:', error);
  process.exit(1);
});

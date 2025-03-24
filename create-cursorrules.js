import { readFile, writeFile, readdir, stat, existsSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import { promisify } from 'util';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);
const readdirAsync = promisify(readdir);
const statAsync = promisify(stat);

/**
 * DirectoryWatcher - Analyzes directory structure and creates a .cursorrules file
 */
class DirectoryWatcher {
  constructor(rootPath = '.') {
    this.rootPath = rootPath;
    this.gitignoreRules = [];
    this.debug = false; // Set to true for more verbose logging
  }

  /**
   * Load rules from .gitignore file
   */
  async loadGitignore() {
    const gitignorePath = join(this.rootPath, '.gitignore');
    
    try {
      // Default rules
      const defaultRules = [
        'node_modules/',
        '.git/',
        '.next/',
        '*.log',
        'npm-debug.log*',
        'yarn-debug.log*',
        'yarn-error.log*',
        '.DS_Store'
      ];
      
      // Start with default rules
      this.gitignoreRules = [...defaultRules];
      
      // Add rules from .gitignore if it exists
      if (existsSync(gitignorePath)) {
        const content = await readFileAsync(gitignorePath, 'utf8');
        const fileRules = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        
        // Add file rules to our list
        this.gitignoreRules = [...this.gitignoreRules, ...fileRules];
        
        console.log(`🔍 Loaded ${fileRules.length} rules from .gitignore`);
      } else {
        console.log('⚠️ No .gitignore file found, using default rules');
      }
      
      // Remove duplicates
      this.gitignoreRules = [...new Set(this.gitignoreRules)];
      
      console.log(`📋 Using ${this.gitignoreRules.length} total ignore rules`);
      
      // Print rules if in debug mode
      if (this.debug) {
        this.gitignoreRules.forEach(rule => console.log(`  - ${rule}`));
      }
    } catch (error) {
      console.error('❌ Error loading .gitignore:', error.message);
    }
  }

  /**
   * Check if a path should be ignored based on gitignore rules
   */
  shouldIgnore(filePath) {
    try {
      // Get relative path and normalize to forward slashes
      const relativePath = relative(this.rootPath, filePath).replace(/\\/g, '/');
      
      // Never ignore root directory
      if (relativePath === '') {
        return false;
      }
      
      // Never ignore files in root level (unless explicitly matched)
      if (!relativePath.includes('/') && !this.gitignoreRules.includes(relativePath)) {
        return false;
      }
      
      // Determine if it's a directory
      let isDirectory = false;
      try {
        isDirectory = statSync(filePath).isDirectory();
      } catch (e) {
        // If we can't stat, assume it's not a directory
        isDirectory = false;
      }
      
      // Special handling for common directories/files that should always be ignored
      const filename = basename(filePath);
      if (filename === '.git' || filename === 'node_modules' || 
          filename === '.cursorrules' || filename === '.DS_Store' || filename === '.next') {
        return true;
      }
      
      // Check each rule
      for (const rule of this.gitignoreRules) {
        // Skip empty rules
        if (!rule) continue;
        
        // Handle negation (rules starting with !)
        if (rule.startsWith('!')) {
          // Negation rules are not implemented in this simplified version
          continue;
        }
        
        // Simple pattern matching
        if (this.simplePatternMatch(relativePath, rule, isDirectory)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error(`Error in shouldIgnore: ${error.message}`);
      return false;
    }
  }

  /**
   * Simplified pattern matching for gitignore rules
   */
  simplePatternMatch(filepath, pattern, isDirectory) {
    // Handle directory-only patterns (ending with /)
    if (pattern.endsWith('/') && !isDirectory) {
      return false;
    }
    
    // Remove trailing slash for directory patterns
    pattern = pattern.replace(/\/$/, '');
    
    // Handle patterns starting with /
    if (pattern.startsWith('/')) {
      // Anchored to root
      pattern = pattern.slice(1);
      return new RegExp(`^${pattern.replace(/\*/g, '.*')}$`).test(filepath);
    }
    
    // Handle simple glob patterns
    const regex = new RegExp(`(^|/)${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}(/|$)`);
    return regex.test(filepath);
  }

  /**
   * Analyze directory structure, ignoring gitignore patterns
   */
  async getDirectoryStructure(dirPath = this.rootPath) {
    const structure = {};
    
    try {
      const items = await readdirAsync(dirPath);
      
      for (const item of items) {
        const fullPath = join(dirPath, item);
        
        // Skip items that should be ignored
        if (this.shouldIgnore(fullPath)) {
          if (this.debug) {
            console.log(`Ignoring: ${fullPath}`);
          }
          continue;
        }
        
        try {
          const stats = await statAsync(fullPath);
          
          if (stats.isDirectory()) {
            // Recursively process subdirectories
            const subStructure = await this.getDirectoryStructure(fullPath);
            structure[item] = subStructure;
          } else {
            // Add files as null values
            structure[item] = null;
          }
        } catch (statError) {
          if (this.debug) {
            console.warn(`Warning: Could not access ${fullPath}: ${statError.message}`);
          }
          // Skip files that cannot be accessed
          continue;
        }
      }
      
      return structure;
    } catch (error) {
      console.error(`❌ Error reading directory ${dirPath}:`, error.message);
      return {};
    }
  }

  /**
   * Update .cursorrules file with new structure
   */
  async updateCursorRules(structure) {
    const rulesPath = join(this.rootPath, '.cursorrules');
    let data = {};
    
    try {
      // Load existing file if it exists
      if (existsSync(rulesPath)) {
        try {
          const content = await readFileAsync(rulesPath, 'utf8');
          data = JSON.parse(content);
          console.log('📄 Found existing .cursorrules file');
        } catch (parseError) {
          console.log('⚠️ Existing .cursorrules file is invalid, creating new one');
          data = {};
        }
      } else {
        console.log('📄 Creating new .cursorrules file');
      }
      
      // Update structure
      data['directory-structure'] = structure;
      
      // Write updated file
      await writeFileAsync(rulesPath, JSON.stringify(data, null, 2), 'utf8');
      console.log('✅ Updated .cursorrules file successfully');
      
    } catch (error) {
      console.error('❌ Error updating .cursorrules file:', error.message);
    }
  }

  /**
   * Main function to run the watcher once
   */
  async run() {
    console.log('🔍 Analyzing directory structure...');
    
    try {
      // Load gitignore rules
      await this.loadGitignore();
      
      // Get directory structure
      const structure = await this.getDirectoryStructure();
      
      // Update .cursorrules file
      await this.updateCursorRules(structure);
      
      console.log('✨ Process completed successfully');
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

// Run the script
const watcher = new DirectoryWatcher();
watcher.run().catch(error => {
  console.error('❌ Unhandled error:', error);
});
// Import required modules
const fs = require('fs');
const path = require('path');

// Read the migration SQL file
const migrationPath = path.join(__dirname, '..', 'migrations', 'schema.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

// Print the SQL for copying to Supabase SQL Editor
console.log(sql);
// Import required modules
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Running custom migration script...');

    // Read the SQL file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute SQL directly - note this may require additional setup in Supabase
    console.log('Executing SQL...');
    
    // Attempt to use SQL API directly
    const { data, error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      console.error('Error executing SQL:', error);
      
      // Print migration SQL for manual execution
      console.log('\nMigration SQL (for manual execution in Supabase SQL Editor):');
      console.log(sql);
      return;
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error running migration:', error);
  }
}

runMigration();
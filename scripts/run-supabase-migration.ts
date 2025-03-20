import { getSupabaseAdmin } from "../lib/supabase"
import fs from "fs"
import path from "path"

async function runMigration() {
  try {
    console.log("Running Supabase migration...")

    // Read the migration SQL file
    const migrationPath = path.join(process.cwd(), "migrations", "supabase-schema.sql")
    const sql = fs.readFileSync(migrationPath, "utf8")

    // Execute the SQL using the admin client
    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.rpc("pgmigrate", { query: sql })

    if (error) {
      console.error("Error running migration:", error)
      return
    }

    console.log("Migration completed successfully!")
  } catch (error) {
    console.error("Error:", error)
  }
}

runMigration()
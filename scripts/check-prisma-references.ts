import { execSync } from "child_process"

// Function to search for Prisma references in files
function searchForPrismaReferences() {
  try {
    console.log("Searching for Prisma references in the codebase...")

    // Use grep to search for "prisma" in all files (excluding node_modules and .git)
    const result = execSync(
      'grep -r "prisma" --include="*.{js,ts,tsx,json}" --exclude-dir={node_modules,.git,.next} .',
      { encoding: "utf8" },
    )

    console.log("Found Prisma references:")
    console.log(result)

    return result.split("\n").filter((line) => line.trim() !== "")
  } catch (error) {
    // If grep doesn't find anything, it returns a non-zero exit code
    if (error.status === 1 && error.stdout === "") {
      console.log("No Prisma references found. Your project should be ready for deployment!")
      return []
    }

    console.error("Error searching for Prisma references:", error)
    return []
  }
}

// Run the search
const references = searchForPrismaReferences()

// If references are found, suggest actions
if (references.length > 0) {
  console.log("\nActions needed:")
  console.log("1. Remove all Prisma imports and replace with Supabase")
  console.log("2. Delete any remaining Prisma configuration files")
  console.log("3. Remove Prisma dependencies from package.json")
  console.log("4. Run npm install to update your package-lock.json")
}


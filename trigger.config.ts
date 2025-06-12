import { defineConfig } from "@trigger.dev/sdk/v3";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: "proj_ovzjwmblpqzlzwfkrkld", // Replace with your actual project reference
  dirs: ["./trigger"], // Fixed the deprecated triggerDirectories
  maxDuration: 300, // Required property - 300 seconds (5 minutes) - adjust as needed
  build: {
    extensions: [
      prismaExtension({
        schema: "prisma/schema.prisma", // Path to your Prisma schema file
        // version: "5.20.0", // Optional: specify Prisma version if needed
      }),
    ],
  },
});
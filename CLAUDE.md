# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Lint/Test Commands
- Run all development servers: `pnpm run dev`
- Lint code: `pnpm run lint`
- Build all packages: `pnpm run build`
- Build shared library: `pnpm run build:shared`
- Build workers: `pnpm run build:workers`
- Build Next.js app: `pnpm run build:next`
- Run message worker: `pnpm --filter workers run dev:message`
- Generate Prisma client: `pnpm run generate`
- Clean project: `pnpm run clean`

## Troubleshooting
- If the build fails with import errors, ensure you're using the correct import paths:
  - In worker files, use `@meuprojeto/shared-lib/src/*` instead of relative paths
  - In Next.js app, use import paths that match the path aliases in tsconfig.json

## Code Style Guidelines
- **TypeScript**: Use strict type checking and proper interfaces/types
- **Imports**: Group imports by external/internal/relative
- **Import Paths**: Always use workspace package imports (`@meuprojeto/shared-lib/src/*`) rather than relative paths
- **Formatting**: 2-space indentation, trailing semicolons
- **Naming**: camelCase for variables/functions, PascalCase for components/classes/interfaces/types
- **Error Handling**: Use try/catch blocks with proper error typing
- **Components**: Functional React components with explicit prop types
- **API Routes**: Follow Next.js API route patterns with proper response handling
- **Data Validation**: Use Zod schemas for form/data validation
- **State Management**: Use React context for shared state
- **Types**: Prefer explicit typings over 'any', use interfaces for object types
# CLAUDE.md - Development Reference

## Build & Development Commands
```
npm run dev       # Start development server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint to check code
```

## Code Style Guidelines
- **Imports**: Group imports by type (React, libraries, components, types, styles)
- **TypeScript**: Use strict typing with Zod for schema validation
- **Components**: Use React Function Components with explicit typing (React.FC<Props>)
- **Error Handling**: Use try/catch blocks with specific error messages in console
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **State Management**: Use React hooks (useState, useEffect, useCallback)
- **Forms**: Use react-hook-form with Zod validation
- **CSS**: Use Tailwind with className patterns (consistent spacing, colors)
- **File Structure**: Group related components in '_components' folders
- **Comments**: Add descriptive comments for complex logic

This is a Next.js application with TypeScript, Tailwind CSS, and react-hook-form.
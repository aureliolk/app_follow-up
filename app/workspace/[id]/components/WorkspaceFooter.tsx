'use client';

export default function WorkspaceFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-background px-6 py-4">
      <p className="text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} LumibotAI Workspace.
      </p>
    </footer>
  );
}
import { LoaderCircle } from "lucide-react";

export function SessionRestorePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-surface flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Restoring your session...</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Moniilog is checking your browser session and loading the right flow for you.
          </p>
        </div>
      </div>
    </div>
  );
}

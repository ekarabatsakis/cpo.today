"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Progress } from "@/components/ui/progress";

const PROGRESS: Record<string, number> = {
  pending: 10,
  engine: 25,
  scoring: 45,
  market: 60,
  memo: 80,
};

/** Shown when a report link is opened while the AI stages are still running. */
export function ProcessingState({ id, initialMessage }: { id: string; initialMessage: string }) {
  const router = useRouter();
  const [message, setMessage] = useState(initialMessage);
  const [progress, setProgress] = useState(30);
  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/report/${id}/status`, { cache: "no-store" });
        if (!r.ok) return;
        const s = (await r.json()) as { status: string; statusMessage?: string };
        setMessage(s.statusMessage ?? "Working…");
        setProgress(PROGRESS[s.status] ?? 90);
        if (s.status === "done" || s.status === "error") {
          window.clearInterval(timer);
          router.refresh();
        }
      } catch {
        // keep polling
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [id, router]);
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="font-medium">{message}</p>
      </div>
      <Progress value={progress} className="mt-4" />
      <p className="mt-3 text-sm text-muted-foreground">
        The engine number is already saved; the AI memo is being written. This page refreshes
        itself.
      </p>
    </div>
  );
}

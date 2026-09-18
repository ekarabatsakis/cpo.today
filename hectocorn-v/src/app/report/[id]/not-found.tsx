import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ReportNotFound() {
  return (
    <main className="px-4 py-20">
      <div className="mx-auto max-w-xl space-y-4 text-center">
        <h1 className="text-4xl font-bold">Report not found</h1>
        <p className="text-muted-foreground">
          The link may be wrong, or the report was created on another machine.
        </p>
        <Button asChild>
          <Link href="/evaluate">Evaluate a startup</Link>
        </Button>
      </div>
    </main>
  );
}

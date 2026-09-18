"use client";

import { Check, Copy, FileDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function ShareBar({ id }: { id: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({ title: "Link copied", description: "Anyone with the link can view this report." });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", description: window.location.href });
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy link
      </Button>
      <Button asChild variant="outline">
        <a href={`/report/${id}/pdf`} download={`hectocorn-v-${id}.pdf`} data-testid="download-pdf">
          <FileDown className="h-4 w-4" /> Download PDF
        </a>
      </Button>
      <Button asChild>
        <Link href="/evaluate">
          <Plus className="h-4 w-4" /> Evaluate another
        </Link>
      </Button>
    </div>
  );
}

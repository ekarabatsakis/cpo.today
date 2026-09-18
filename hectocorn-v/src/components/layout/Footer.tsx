import Link from "next/link";

import { Wordmark } from "@/components/brand/Wordmark";
import { BENCHMARKS_VERSION } from "@/lib/engine/benchmarks";

export const DISCLAIMER =
  "Hectocorn V produces indicative estimates for educational and discussion purposes. It is not a valuation opinion, investment advice, or a substitute for professional advice. Valuations are ultimately set by negotiation between parties.";

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-4">
            <Wordmark size={24} textClassName="text-lg" />
            <p className="text-base text-muted-foreground">
              Open-source, AI-assisted startup valuation. Deterministic first, AI second.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://hectocorn.co"
                target="_blank"
                rel="noreferrer"
                className="text-base text-muted-foreground hover:text-foreground"
              >
                hectocorn.co
              </a>
              <a
                href="https://www.linkedin.com/company/hectocorn"
                target="_blank"
                rel="noreferrer"
                aria-label="Hectocorn on LinkedIn"
                className="text-muted-foreground hover:text-foreground"
              >
                <LinkedInIcon className="h-5 w-5" />
              </a>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium">Product</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/evaluate"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  Evaluate a startup
                </Link>
              </li>
              <li>
                <Link
                  href="/methodology"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  Methodology
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/ekarabatsakis/cpo.today/tree/main/hectocorn-v"
                  target="_blank"
                  rel="noreferrer"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  Source on GitHub
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium">Disclaimer</h3>
            <p className="text-sm text-muted-foreground">{DISCLAIMER}</p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t pt-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} Hectocorn V · MIT licence</span>
          <span>Benchmarks {BENCHMARKS_VERSION}</span>
        </div>
      </div>
    </footer>
  );
}

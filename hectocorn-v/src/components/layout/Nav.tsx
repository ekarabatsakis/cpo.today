import Link from "next/link";

import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/evaluate", label: "Evaluate" },
  { href: "/methodology", label: "Methodology" },
  { href: "https://github.com/ekarabatsakis/cpo.today/tree/main/hectocorn-v", label: "GitHub" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/50 backdrop-blur dark:bg-background/50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center" aria-label="Hectocorn V home">
          <Wordmark size={28} textClassName="text-xl" />
        </Link>
        <nav className="flex items-center gap-2 md:gap-6" aria-label="Main">
          <ul className="hidden items-center gap-6 md:flex">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-base text-muted-foreground transition-colors hover:text-foreground"
                  {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <ThemeToggle />
          <Button asChild size="lg" className="h-11 px-8">
            <Link href="/evaluate">Evaluate a startup</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

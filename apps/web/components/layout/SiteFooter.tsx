import Link from "next/link";
import { ArrowUpRight, Github, Mail } from "lucide-react";
import { PhyloLogo } from "@/components/layout/PhyloLogo";
import { getMethodContent } from "@/features/docs/content";
import { METHOD_IDS } from "@/features/docs/types";
import { LEGAL } from "@/lib/legal";

const SOURCE_URL = "https://github.com/Kiana8181/phylo-framework";
const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`;

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/history", label: "Run history" },
      { href: "/dashboard/comparison", label: "Compare runs" },
      { href: "/dashboard/files", label: "Datasets" },
    ],
  },
  {
    title: "Documentation",
    links: [
      { href: "/documents", label: "Overview" },
      { href: "/documents/try-it-yourself", label: "Try it yourself" },
      { href: "/documents/data-requirements", label: "Data requirements" },
      { href: "/documents/architecture", label: "Architecture" },
    ],
  },
  {
    title: "Methods",
    links: METHOD_IDS.map((id) => ({
      href: `/documents/${id}`,
      label: getMethodContent(id).displayName,
    })),
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t bg-muted/40">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2.7fr)] lg:gap-16 lg:py-14">
          <div>
            <PhyloLogo href="/" className="-ml-1 w-fit" />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
              One reproducible workflow for B-cell lineage reconstruction. Every run is recorded with
              its parameters, its seed and its software version.
            </p>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-5 inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" />
              Source code
              <ArrowUpRight className="h-3 w-3 opacity-50 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  {column.title}
                </h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-muted-foreground transition-colors hover:text-primary"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {column.title === "Legal" && (
                    <li>
                      <a
                        href={`mailto:${LEGAL.contactEmail}`}
                        className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Contact
                      </a>
                    </li>
                  )}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {LEGAL.operator}. Released under the{" "}
            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              MIT License
            </a>
            .
          </p>
          <p>For research use only. Not for clinical or diagnostic decisions.</p>
        </div>
      </div>
    </footer>
  );
}

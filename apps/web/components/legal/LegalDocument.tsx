import Link from "next/link";
import { Check } from "lucide-react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { LegalToc } from "@/components/legal/LegalToc";
import { LEGAL } from "@/lib/legal";
import { cn } from "@/lib/utils";

export type LegalSection = {
  id: string;
  title: string;
  body: React.ReactNode;
};

type LegalDocumentProps = {
  active: "privacy" | "terms";
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  summary: string;
  highlights: string[];
  sections: LegalSection[];
};

const TABS = [
  { key: "privacy", href: "/privacy", label: "Privacy Policy" },
  { key: "terms", href: "/terms", label: "Terms of Service" },
] as const;

export function LegalDocument({
  active,
  icon: Icon,
  title,
  summary,
  highlights,
  sections,
}: LegalDocumentProps) {
  return (
    <>
      <main>
        <header className="border-b bg-primary/5">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            <nav
              aria-label="Legal documents"
              className="inline-flex rounded-full border bg-background p-1 text-sm"
            >
              {TABS.map((tab) => (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={active === tab.key ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1.5 font-medium transition-colors sm:px-4",
                    active === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-2 shadow-sm">
                <Icon className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
              </span>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            </div>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{summary}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              Effective {LEGAL.effectiveDate}
            </p>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-14">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <LegalToc items={sections.map(({ id, title }) => ({ id, title }))} />
          </aside>

          <article className="min-w-0 max-w-3xl">
            <section aria-label="The short version" className="rounded-2xl border bg-card p-5 sm:p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                The short version
              </h2>
              <ul className="mt-4 space-y-3">
                {highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-3">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-primary" strokeWidth={3} />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </section>

            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="mt-12 scroll-mt-8">
                <h2 className="flex items-baseline gap-3 text-2xl font-semibold tracking-tight">
                  <span className="text-base font-medium tabular-nums text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {section.title}
                </h2>
                <div className="mt-4 space-y-4 leading-7 text-foreground/85 [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_h3]:pt-2 [&_h3]:font-semibold [&_h3]:text-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:marker:text-primary/60">
                  {section.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** A table that becomes labelled stacks on a phone instead of scrolling sideways. */
export function LegalTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <table className="block w-full text-left text-sm leading-6 sm:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="hidden bg-muted/60 sm:table-header-group">
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-4 py-2.5 font-semibold text-foreground">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block divide-y sm:table-row-group">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="block p-4 sm:table-row sm:p-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    "block py-1 align-top sm:table-cell sm:border-t sm:px-4 sm:py-3",
                    cellIndex === 0 && "font-medium text-foreground",
                  )}
                >
                  {cellIndex > 0 && (
                    <span className="block text-xs font-medium text-muted-foreground sm:hidden">
                      {columns[cellIndex]}
                    </span>
                  )}
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContactLink() {
  return <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
}

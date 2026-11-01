export type SiteLink = { href: string; label: string };

/** Primary links, shown inline in the navbar from `sm` up. */
export const PRIMARY_SITE_LINKS: SiteLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/documents", label: "Documentation" },
];

/** Everything the phone drawer offers, which has room for the secondary links. */
export const DRAWER_SITE_LINKS: SiteLink[] = [
  { href: "/", label: "Home" },
  ...PRIMARY_SITE_LINKS,
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
];

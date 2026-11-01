import { FileStack, FolderOpen, GitCompare, Play } from "lucide-react";

export type DashboardNavItem = {
  href: string;
  label: string;
  /** For the tablet rail and the phone tab bar, where `label` does not fit. */
  shortLabel: string;
  icon: typeof Play;
};

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { href: "/dashboard", label: "Run model", shortLabel: "Run", icon: Play },
  { href: "/dashboard/history", label: "Run history", shortLabel: "History", icon: FileStack },
  { href: "/dashboard/files", label: "File management", shortLabel: "Files", icon: FolderOpen },
  { href: "/dashboard/comparison", label: "Sequence Trace", shortLabel: "Trace", icon: GitCompare },
];

export function isDashboardNavActive(href: string, pathname: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

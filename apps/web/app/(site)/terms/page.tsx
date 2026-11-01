import type { Metadata } from "next";
import { TermsDoc } from "@/components/legal/TermsDoc";

export const metadata: Metadata = {
  title: "Terms of Service — Phylo Framework",
  description:
    "The rules for using Phylo Framework: what the service offers, what it asks of you, and the limits of what it promises.",
};

export default function TermsPage() {
  return <TermsDoc />;
}

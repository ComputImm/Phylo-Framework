import type { Metadata } from "next";
import { PrivacyDoc } from "@/components/legal/PrivacyDoc";

export const metadata: Metadata = {
  title: "Privacy Policy — Phylo Framework",
  description:
    "What Phylo Framework collects, including data from Google sign-in, how it is used and protected, and how to have it deleted.",
};

export default function PrivacyPage() {
  return <PrivacyDoc />;
}

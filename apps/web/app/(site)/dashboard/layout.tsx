"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/context";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardTabBar from "@/components/dashboard/DashboardTabBar";
import VerifyEmailBanner from "@/components/auth/VerifyEmailBanner";
import { Loading } from "@/components/ui/loading";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/auth");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <Loading fullScreen illustration="dna" label="Loading..." />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden md:flex-row">
      <Sidebar />
      <div data-testid="dashboard-pane" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <VerifyEmailBanner />
        {children}
      </div>
      <DashboardTabBar />
    </div>
  );
}

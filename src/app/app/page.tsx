"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CohortApp } from "@/components/cohort-app";
import { useAuth } from "@/lib/auth";

export default function AppRoute() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/sign-in");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black font-mono text-xs uppercase tracking-[0.18em] text-white/40">
        loading…
      </div>
    );
  }
  return <CohortApp />;
}

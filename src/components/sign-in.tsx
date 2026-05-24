"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

export function SignIn() {
  const { user, ready, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  // If already signed in, bounce straight to the app.
  useEffect(() => {
    if (ready && user) router.replace("/app");
  }, [ready, user, router]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    signIn(email, name);
    router.push("/app");
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-black text-white">
      <header className="border-b border-white/5">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg border border-white/15 bg-white/[0.04]">
              <Bot className="size-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-[0.18em]">COHORT</span>
          </a>
          <a
            href="/"
            className="text-xs text-white/50 hover:text-white"
          >
            ← Back to landing
          </a>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-7"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/[0.04]">
              <Lock className="size-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">Sign in to Cohort</h1>
              <p className="text-xs text-white/50">No password — dummy auth for the hackathon demo.</p>
            </div>
          </div>

          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            email
          </p>
          <Input
            type="email"
            autoFocus
            required
            placeholder="you@team.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <p className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            display name (optional)
          </p>
          <Input
            placeholder="Benjamin"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Button type="submit" size="lg" className="mt-6 w-full">
            Continue
            <ArrowRight className="size-4" />
          </Button>

          <p className="mt-5 text-center text-[11px] text-white/35">
            Session is stored locally in your browser — no server, no DB.
          </p>
        </form>
      </main>
    </div>
  );
}

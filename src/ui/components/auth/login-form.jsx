"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const callbackUrl = searchParams?.get("callbackUrl") ?? "/dashboard";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (result?.ok) {
      router.push(callbackUrl);
    } else {
      setError(result?.error ?? "Unable to sign in");
    }

    setIsSubmitting(false);
  };

  return (
    <Card className="bg-white/90 shadow-xl backdrop-blur-lg border-slate-200">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-slate-900">Welcome back</CardTitle>
        <CardDescription className="text-slate-500">
          Sign in with your approved email address to access your workspace.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600" htmlFor="email">
              Email address
            </label>
            <Input
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-sm text-slate-500">
            Need an account? {" "}
            <Link className="font-medium text-slate-700 underline hover:text-white" href="/register">
              Request access
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

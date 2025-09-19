"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (response.ok) {
      setSuccess("Account created. You can sign in once an administrator activates your profile.");
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => router.push("/login"), 2000);
    } else {
      const data = await response.json().catch(() => ({}));
      setError(data?.error ?? "Unable to create account");
    }

    setIsSubmitting(false);
  };

  return (
    <Card className="bg-white/90 shadow-xl backdrop-blur-lg border-slate-200">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-slate-900">Request access</CardTitle>
        <CardDescription className="text-slate-500">
          Use your approved email to create an account for your organization.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600" htmlFor="name">
              Full name
            </label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ada Lovelace"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600" htmlFor="email">
              Work email
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
              autoComplete="new-password"
              required
              placeholder="Create a secure password"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600" htmlFor="confirmPassword">
              Confirm password
            </label>
            <Input
              id="confirmPassword"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              required
              placeholder="Re-enter your password"
            />
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Submitting…" : "Create account"}
          </Button>
          <p className="text-sm text-slate-500">
            Already registered? {" "}
            <Link className="font-medium text-slate-700 underline hover:text-slate-900" href="/login">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

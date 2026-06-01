"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginForm({ authMode = "easyauth" }) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/dashboard";
  const isAnonymous = authMode === "anonymous";
  const loginUrl = isAnonymous
    ? callbackUrl
    : `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(callbackUrl)}`;

  return (
    <Card className="bg-white/90 shadow-xl backdrop-blur-lg border-slate-200">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-slate-900">Sign in</CardTitle>
        <CardDescription className="text-slate-500">
          {isAnonymous
            ? "Anonymous smoke mode is enabled for this non-production deployment."
            : "Use your organization Entra ID account to access VIPER."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">
          {isAnonymous
            ? "Continue directly to the test workspace. Analysis still uses the real backend and Azure services."
            : "Access is managed by the deployed app and your administrator-assigned role."}
        </p>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <a href={loginUrl}>{isAnonymous ? "Continue to dashboard" : "Continue with Entra ID"}</a>
        </Button>
      </CardFooter>
    </Card>
  );
}

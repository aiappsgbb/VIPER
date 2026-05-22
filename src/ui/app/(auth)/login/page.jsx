import { Suspense } from "react";

import LoginForm from "@/components/auth/login-form";
import { getAuthMode } from "@/lib/auth";

export const metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm authMode={getAuthMode()} />
    </Suspense>
  );
}

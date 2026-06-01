import { Button } from "@/components/ui/button";

export default function SignOutButton({ authMode = "easyauth" }) {
  const isAnonymous = authMode === "anonymous";

  return (
    <Button asChild size="sm" variant="outline">
      <a href={isAnonymous ? "/" : "/.auth/logout?post_logout_redirect_uri=/"}>{isAnonymous ? "Leave" : "Sign out"}</a>
    </Button>
  );
}

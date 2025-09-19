import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token }) => Boolean(token),
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/collections/:path*", "/content/:path*"],
};

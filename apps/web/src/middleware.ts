import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;
  const pathname = url.pathname;

  // Public routes that don't require auth
  const publicRoutes = ["/", "/login", "/register", "/verify", "/check-email", "/forgot-password", "/reset-password", "/favicon.svg"];
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith("/invite/") || pathname.startsWith("/images/"));

  // Check for session cookie
  const session = cookies.get("session");
  const isLoggedIn = session?.value ? true : false;

  // Redirect logged-in users away from login/register
  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    return redirect("/dashboard");
  }

  // Allow logout page to work even without valid session
  if (pathname === "/logout") {
    return next();
  }

  // Redirect non-logged-in users to login for protected routes
  if (!isLoggedIn && !isPublicRoute) {
    return redirect("/login");
  }

  return next();
});

import type { Metadata } from "next";
import { AuthProvider } from "@/lib/firebase/auth-provider";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Pet Feeder",
  description: "Monitor feeding activity, pets, sensors and device status in real time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script below sets a class on <html>
    // before React hydrates, so the server and client markup differ here on
    // purpose. It is scoped to this element only.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas text-ink font-sans antialiased">
        {/* Both route groups need the session: (auth) to know where to send
            someone, (dashboard) to gate on it. In mock mode it yields a fixed
            fake session and never touches Firebase. */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

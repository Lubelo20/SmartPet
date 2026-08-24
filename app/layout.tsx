import type { Metadata } from "next";
import { AuthProvider } from "@/lib/firebase/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Pet Feeder",
  description: "Monitor feeding activity, pets, sensors and device status in real time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
        {/* Both route groups need the session: (auth) to know where to send
            someone, (dashboard) to gate on it. In mock mode it yields a fixed
            fake session and never touches Firebase. */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

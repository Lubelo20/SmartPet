import type { ReactNode } from "react";
import { PawPrint } from "lucide-react";

/**
 * Deliberately does NOT mount FeederDataProvider: there is no household yet,
 * and mounting it would try to read data as a signed-out user.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center mb-3">
            <PawPrint size={24} strokeWidth={2} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Smart Pet Feeder</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sign in to monitor feeding, pets and device status.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

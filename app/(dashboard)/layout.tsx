import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FeederDataProvider } from "@/hooks/useFeederData";
import { ToastProvider } from "@/hooks/useToast";
import { ServicesProvider } from "@/services/services-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ServicesProvider>
      <ToastProvider>
        <FeederDataProvider>
          <DashboardShell>{children}</DashboardShell>
        </FeederDataProvider>
      </ToastProvider>
    </ServicesProvider>
  );
}

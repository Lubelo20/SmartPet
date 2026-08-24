"use client";

import { useState, type ReactNode } from "react";
import { DemoPanel } from "@/components/layout/DemoPanel";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { PetAvatar } from "@/components/feeder/PetAvatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useFeederData } from "@/hooks/useFeederData";
import { CONFIG } from "@/lib/config";
import { rint } from "@/lib/utils";
import { useServices } from "@/services/services-provider";
import type { ScenarioName } from "@/services/simulation";

const SCENARIOS: readonly ScenarioName[] = ["offline", "online", "low-food", "refill", "unknown-pet", "sensor-error"];
const isScenario = (key: string): key is ScenarioName => (SCENARIOS as readonly string[]).includes(key);

export function DashboardShell({ children }: { children: ReactNode }) {
  const { engine } = useServices();
  const { telemetry: t, pets, alerts, pendingFeed, cancelFeed, confirmFeed } = useFeederData();
  const [navOpen, setNavOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const handleScenario = (key: string) => {
    if (key === "cycle") {
      const p = pets[rint(0, Math.max(0, pets.length - 1))];
      if (p) engine.startCycle(p.id, p.portionG, "Scheduled");
      return;
    }
    if (isScenario(key)) engine.scenario(key);
  };

  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Keyboard users land here first and can jump past the whole nav. */}
      <a href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:rounded-xl focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">
        Skip to main content
      </a>

      {/* desktop sidebar */}
      <aside aria-label="Main navigation" className="hidden lg:block fixed inset-y-0 left-0 w-64 z-30"><Sidebar unread={unread} /></aside>

      {/* mobile drawer */}
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          {/* Decorative: the drawer has its own labelled close button. */}
          <div className="absolute inset-0 bg-slate-900 opacity-40" onClick={() => setNavOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-full">
            <Sidebar unread={unread} onClose={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <Header unread={unread} demo={t.demo} showDemo={showDemo}
          online={t.device.online} lastHeartbeat={t.device.lastHeartbeat}
          onOpenNav={() => setNavOpen(true)} onToggleDemo={() => setShowDemo((v) => !v)} />

        <main id="main" tabIndex={-1} className="p-4 sm:p-6 space-y-5 max-w-screen-2xl focus:outline-none">
          {showDemo && (
            <DemoPanel demo={t.demo} cycleActive={t.cycle.active}
              onToggle={() => engine.setDemo(!t.demo)} onScenario={handleScenario} />
          )}
          {children}
          <footer className="pt-2 pb-6 text-xs text-slate-500">
            Frontend running on mock data · data source: <span className="font-mono">{CONFIG.dataSource}</span> · transport: <span className="font-mono">{CONFIG.transport}</span>
          </footer>
        </main>
      </div>

      {/* quick-feed confirmation */}
      <Modal open={!!pendingFeed} title="Dispense food now?"
        description={pendingFeed ? `Are you sure you want to dispense food for ${pendingFeed.pet.name}?` : ""}
        onClose={cancelFeed}
        footer={<>
          <Button variant="ghost" onClick={cancelFeed}>Cancel</Button>
          <Button onClick={confirmFeed}>Confirm feeding</Button>
        </>}>
        {pendingFeed && (
          <div className="flex items-center gap-4 rounded-xl bg-slate-50 border border-slate-100 p-4">
            <PetAvatar pet={pendingFeed.pet} size={44} />
            <div>
              <p className="text-sm font-semibold text-slate-900">{pendingFeed.pet.name}</p>
              <p className="text-sm text-slate-500">{pendingFeed.pet.breed} · target {pendingFeed.portionG} g</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { SectionHead } from "@/components/ui/SectionHead";
import { useFeederData } from "@/hooks/useFeederData";
import { useServices } from "@/services/services-provider";
import { useToast } from "@/hooks/useToast";
import { loadDemoData } from "@/lib/demo-seed";
import { toFeederError } from "@/lib/errors";

/**
 * Fills an empty household with the demo pets, schedules and history.
 *
 * A real household starts with nothing, so History, the analytics and the AI
 * summary have nothing to describe until the feeder has been used for a while
 * — and every one of those screens is hard to judge empty. This writes the
 * same fixtures the mock adapter starts from, through the ordinary contract.
 *
 * Only offered while the household is empty. loadDemoData refuses to run
 * twice anyway, but a button that cannot do anything should not be there.
 */
export function DemoDataCard() {
  const { pets, reload } = useFeederData();
  const { services } = useServices();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (pets.length > 0) return null;

  async function load() {
    setBusy(true);
    try {
      const out = await loadDemoData(services);
      if (!out.loaded) {
        toast({ tone: "warning", title: "Already has pets", message: "Demo data is only for an empty household." });
      } else {
        toast({
          title: "Demo data loaded",
          message: `${out.pets} pets, ${out.schedules} schedules and ${out.feedings} feeding records.`,
        });
        await reload();
      }
    } catch (e) {
      toast({ tone: "critical", title: "Could not load demo data", message: toFeederError(e, "The demo data was not written.").message });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <Card className="p-5">
      <SectionHead
        title="Demo data"
        subtitle="This household is empty. Load sample pets and history to see the dashboard with something in it."
      />
      <Button icon={Sprout} variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
        {busy ? "Loading…" : "Load demo data"}
      </Button>
      <p className="text-xs text-muted mt-3">
        Writes three pets, their schedules and two weeks of feeding history. They are ordinary
        records — edit or delete them like any other.
      </p>

      <Modal
        open={confirming}
        title="Load demo data?"
        description="Three pets, their feeding schedules and about two weeks of history will be added to this household."
        onClose={() => setConfirming(false)}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Load demo data"}</Button>
        </>}
      >
        <p className="text-sm text-ink-2">
          This is real data in your household, not a preview: the pets are editable and the history
          counts towards daily limits. Delete the pets to remove them.
        </p>
      </Modal>
    </Card>
  );
}

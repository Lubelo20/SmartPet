"use client";

import { CameraPreview } from "@/components/feeder/CameraPreview";
import { FeedingWorkflow } from "@/components/feeder/FeedingWorkflow";
import { PetDetectionPanel } from "@/components/feeder/PetDetectionPanel";
import { ReadoutRow } from "@/components/feeder/ReadoutRow";
import { WeightMonitor } from "@/components/feeder/WeightMonitor";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { SectionHead } from "@/components/ui/SectionHead";
import { useFeederData } from "@/hooks/useFeederData";

export default function LivePage() {
  const { telemetry: t, pets, loadError, reload, requestFeed, stopCycle } = useFeederData();

  if (loadError) return <Card><ErrorState message={loadError} onRetry={reload} /></Card>;

  const pet = pets.find((p) => p.id === (t.detection.petId || t.cycle.petId));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <Card className="p-5">
            <SectionHead title="Camera stream" subtitle="Detection box, label and confidence are drawn from the classifier output"
              right={<Badge tone={t.camera.online && t.device.online ? "success" : "critical"} dot>{t.camera.online && t.device.online ? `${t.camera.fps} fps` : "Offline"}</Badge>} />
            <CameraPreview detection={t.detection} pet={pet} online={t.device.online && t.camera.online} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <ReadoutRow label="Distance" value={`${t.distanceCm} cm`} />
              <ReadoutRow label="Servo" value={t.servo} />
              <ReadoutRow label="Bowl" value={`${t.bowl.grams.toFixed(0)} g`} />
              <ReadoutRow label="Hopper" value={`${Math.round(t.hopper.grams)} g`} />
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <PetDetectionPanel detection={t.detection} pet={pet} />
          <Card className="p-5">
            <SectionHead title="Cycle control" subtitle="Commands are queued to the device" />
            <div className="space-y-2">
              {pets.map((p) => (
                <Button key={p.id} variant="ghost" size="sm" className="w-full justify-between" onClick={() => requestFeed(p)} disabled={t.cycle.active}>
                  <span>Feed {p.name}</span><span className="font-mono text-muted">{p.portionG} g</span>
                </Button>
              ))}
              <Button variant="danger" size="sm" className="w-full" onClick={() => void stopCycle()} disabled={!t.cycle.active}>Stop current cycle</Button>
            </div>
          </Card>
        </div>
      </div>
      <FeedingWorkflow cycle={t.cycle} />
      <WeightMonitor bowl={t.bowl} servo={t.servo} cycle={t.cycle} />
    </div>
  );
}

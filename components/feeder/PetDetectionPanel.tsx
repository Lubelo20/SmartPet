import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PetAvatar } from "@/components/feeder/PetAvatar";
import type { DetectionState, Pet, Telemetry, Tone } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

type PetDetectionPanelProps = { detection: Telemetry["detection"]; pet: Pet | undefined };

export function PetDetectionPanel({ detection, pet }: PetDetectionPanelProps) {
  const map: Record<DetectionState, { tone: Tone; title: string; sub: string }> = {
    idle: { tone: "neutral", title: "No pet detected", sub: "The ultrasonic sensor is watching the bowl area." },
    detected: { tone: "warning", title: "Pet detected", sub: "Proximity trigger fired — capturing a frame." },
    identifying: { tone: "warning", title: "Identifying pet", sub: "Running classification on the captured frame." },
    identified: { tone: "success", title: `Pet identified — ${pet ? pet.name : ""}`, sub: "Verified against the enrolled profiles." },
    unknown: { tone: "critical", title: "Pet not recognised", sub: "Confidence below the 75% threshold. Feeding was blocked." },
  };
  const s = map[detection.state] || map.idle;
  const conf = detection.confidence || 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <Label>Pet detection</Label>
        <Badge tone={s.tone} dot>{detection.state === "identified" ? "Verified" : detection.state === "unknown" ? "Rejected" : detection.state === "idle" ? "Standby" : "In progress"}</Badge>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <PetAvatar pet={detection.state === "identified" ? (pet ?? null) : null} size={52} />
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink tracking-tight truncate">{s.title}</p>
          <p className="text-sm text-muted truncate">{s.sub}</p>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Confidence</span>
          <span className="text-sm font-bold font-mono text-ink">{conf ? `${conf.toFixed(1)}%` : "—"}</span>
        </div>
        <ProgressBar value={conf} tone={conf >= 75 ? "emerald" : conf > 0 ? "rose" : "slate"} />
        <div className="flex justify-between mt-2 text-xs text-muted">
          <span>Threshold 75%</span>
          <span>Updated {timeAgo(detection.since)}</span>
        </div>
      </div>
    </Card>
  );
}

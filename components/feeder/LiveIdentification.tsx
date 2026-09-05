"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
import { PetAvatar } from "@/components/feeder/PetAvatar";
import { useFeederData } from "@/hooks/useFeederData";
import { loadActiveModel, type ActiveModel } from "@/lib/ai/inference";
import { shouldRecordDetection, type LastRecorded } from "@/lib/ai/live";
import { toFeederError } from "@/lib/errors";
import type { Prediction } from "@/lib/types";

/**
 * The laptop camera standing in for the ESP32-CAM: frames go through the real
 * trained model, sightings land in the detections collection (throttled by
 * shouldRecordDetection), and "Feed this pet" runs the identification through
 * the real decision engine — which refuses exactly as it would on hardware.
 *
 * Everything below runs in the browser. Frames never leave the machine.
 */

const PREDICT_EVERY_MS = 2_000;

export function LiveIdentification() {
  const { pets, settings, recordDetection, aiFeed } = useFeederData();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modelRef = useRef<ActiveModel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRecordedRef = useRef<LastRecorded>(null);

  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [feeding, setFeeding] = useState(false);

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      try {
        modelRef.current ??= await loadActiveModel();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        timer = setInterval(() => {
          const video = videoRef.current;
          const model = modelRef.current;
          if (!video || !model || video.readyState < 2) return;
          void model.predict(video).then((p) => {
            if (cancelled) return;
            setPrediction(p);
            const now = Date.now();
            if (shouldRecordDetection(lastRecordedRef.current, p, now)) {
              lastRecordedRef.current = { prediction: p, at: now };
              recordDetection(p);
            }
          }).catch(() => { /* one bad frame is not an error state */ });
        }, PREDICT_EVERY_MS);
      } catch (e) {
        if (!cancelled) {
          setError(toFeederError(e, "The camera could not be started.").message);
          setOn(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setPrediction(null);
    };
  }, [on, recordDetection]);

  // The model is shared page state; release it when the card unmounts.
  useEffect(() => () => { modelRef.current?.dispose(); modelRef.current = null; }, []);

  const pet = prediction?.petId ? pets.find((p) => p.id === prediction.petId) ?? null : null;
  const confident = prediction ? prediction.confidence * 100 >= settings.confidenceThreshold : false;
  const tone = !prediction ? "neutral"
    : prediction.status === "RECOGNIZED" && confident ? "success"
    : prediction.status === "ERROR" ? "critical" : "warning";
  const label = !prediction ? "Watching…"
    : prediction.status === "ERROR" ? "Model error"
    : prediction.status === "UNKNOWN" ? "Unknown animal"
    : `${pet?.name ?? prediction.petId} · ${(prediction.confidence * 100).toFixed(0)}%`;

  return (
    <Card className="p-5">
      <SectionHead
        title="Live identification"
        subtitle="Your camera stands in for the ESP32-CAM; frames run through the trained model on this device."
        right={on ? <Badge tone={tone} dot>{label}</Badge> : undefined}
      />

      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      <div className="rounded-2xl overflow-hidden bg-inverse" style={{ aspectRatio: "4 / 3" }}>
        {/* The stream is attached imperatively; the element stays mounted so
            toggling does not renegotiate permissions. */}
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover" hidden={!on} />
        {!on && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-inverse-ink">
            <CameraOff size={28} />
            <p className="text-sm opacity-80">Camera is off</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <Button variant={on ? "ghost" : "primary"} onClick={() => { setError(null); setOn((v) => !v); }}>
          <Camera size={16} /> {on ? "Stop camera" : "Start camera"}
        </Button>
        <Button
          variant="ghost"
          disabled={!prediction || prediction.status !== "RECOGNIZED" || feeding}
          onClick={async () => {
            if (!prediction) return;
            setFeeding(true);
            try { await aiFeed(prediction); } finally { setFeeding(false); }
          }}
        >
          <UtensilsCrossed size={16} /> {feeding ? "Deciding…" : "Feed this pet"}
        </Button>
      </div>

      {prediction && prediction.status === "RECOGNIZED" && (
        <div className="flex items-center gap-3 mt-4">
          <PetAvatar pet={pet} size={36} />
          <p className="text-sm text-ink-2">
            {pet
              ? <>Identified as <span className="font-semibold text-ink">{pet.name}</span>. Feeding still goes through the decision engine — schedule, cooldown, limits and food level all apply.</>
              : <>Recognised class {prediction.petId}, which is not a pet in this household — the engine will refuse it.</>}
          </p>
        </div>
      )}
    </Card>
  );
}

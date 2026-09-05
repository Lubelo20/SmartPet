"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Upload } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionHead } from "@/components/ui/SectionHead";
import { PetAvatar } from "@/components/feeder/PetAvatar";
import { useFeederData } from "@/hooks/useFeederData";
import { loadActiveModel, type ActiveModel } from "@/lib/ai/inference";
import { toFeederError } from "@/lib/errors";
import type { Prediction } from "@/lib/types";

/**
 * The model registry card and the test bench (spec §33/§35). Inference runs
 * in the browser — the model is static files under /models/ — so testing a
 * photo costs nothing and touches no server.
 */

type Meta = {
  version?: string; accuracy?: number; precision?: number; recall?: number;
  f1Score?: number; numberOfPets?: number; numberOfImages?: number;
  architecture?: string;
  datasetNotes?: { source?: string; standIns?: Record<string, string> };
};

const pct = (v: number | undefined) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—");

export default function AiPage() {
  const { pets, settings } = useFeederData();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const modelRef = useRef<ActiveModel | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const reg = await fetch("/models/registry.json");
        if (!reg.ok) throw new Error("registry missing");
        const { activeVersion } = (await reg.json()) as { activeVersion: string };
        const res = await fetch(`/models/${activeVersion}/metadata.json`);
        if (!res.ok) throw new Error("metadata missing");
        const m = (await res.json()) as Meta;
        if (!cancelled) setMeta({ ...m, version: m.version ?? activeVersion });
      } catch {
        if (!cancelled) setMetaError("No trained model is published yet.");
      }
    })();
    return () => {
      cancelled = true;
      modelRef.current?.dispose();
      modelRef.current = null;
    };
  }, []);

  async function onPick(file: File) {
    setBusy(true);
    setTestError(null);
    setPrediction(null);
    const url = URL.createObjectURL(file);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(url);
    try {
      modelRef.current ??= await loadActiveModel();
      const img = new Image();
      img.src = url;
      await img.decode();
      setPrediction(await modelRef.current.predict(img));
    } catch (e) {
      setTestError(toFeederError(e, "The photo could not be tested.").message);
    } finally {
      setBusy(false);
    }
  }

  const predictedPet = prediction?.petId ? pets.find((p) => p.id === prediction.petId) ?? null : null;
  const meetsThreshold = prediction ? prediction.confidence * 100 >= settings.confidenceThreshold : false;
  const verdictTone = !prediction ? "neutral"
    : prediction.status === "RECOGNIZED" && meetsThreshold ? "success"
    : prediction.status === "ERROR" ? "critical" : "warning";
  const verdictLabel = !prediction ? ""
    : prediction.status === "ERROR" ? "Model error"
    : prediction.status === "UNKNOWN" ? "Unknown animal"
    : meetsThreshold ? "Recognised" : "Below confidence threshold";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="p-6">
        <SectionHead
          title="Active model"
          subtitle="Trained on the bootstrap dataset until pet photo uploads exist."
          right={meta ? <Badge tone="success" dot>ACTIVE · {meta.version}</Badge> : undefined}
        />
        {metaError && (
          <ErrorState title="No model" message={`${metaError} Train one with the ml/ pipeline — see ml/README.md.`} />
        )}
        {!meta && !metaError && <LoadingState label="Loading model details" rows={3} />}
        {meta && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ["Accuracy", pct(meta.accuracy)],
              ["Precision", pct(meta.precision)],
              ["Recall", pct(meta.recall)],
              ["F1 score", pct(meta.f1Score)],
              ["Pets", String(meta.numberOfPets ?? "—")],
              ["Training images", String(meta.numberOfImages ?? "—")],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold text-ink tabular-nums">{v}</dd>
              </div>
            ))}
            <div className="col-span-2 pt-1">
              <dt className="text-muted">Architecture</dt>
              <dd className="text-ink mt-0.5">{meta.architecture ?? "—"}</dd>
            </div>
            {meta.datasetNotes?.standIns && Object.keys(meta.datasetNotes.standIns).length > 0 && (
              <div className="col-span-2">
                <dt className="text-muted">Dataset notes</dt>
                <dd className="text-ink-2 mt-0.5">
                  {Object.entries(meta.datasetNotes.standIns).map(([id, note]) => (
                    <p key={id}>{pets.find((p) => p.id === id)?.name ?? id}: {note}.</p>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </Card>

      <Card className="p-6">
        <SectionHead
          title="Test the model"
          subtitle="Upload a photo and see exactly what the feeder would decide it is."
        />
        <input
          ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onPick(f);
          }}
        />
        <div className="flex items-center gap-3">
          <Button onClick={() => fileInput.current?.click()} disabled={busy || !!metaError}>
            <Upload size={16} /> {busy ? "Identifying…" : "Upload a photo"}
          </Button>
          {metaError && <span className="text-sm text-muted">Needs a published model.</span>}
        </div>

        {testError && <div className="mt-4"><ErrorState title="Test failed" message={testError} /></div>}

        {imageUrl && !testError && (
          <div className="mt-5 flex items-start gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img src={imageUrl} alt="Test" className="h-36 w-36 rounded-2xl object-cover border border-line" />
            <div className="min-w-0">
              {busy && <LoadingState label="Running the model" rows={2} />}
              {prediction && (
                <>
                  <Badge tone={verdictTone} dot>{verdictLabel}</Badge>
                  <div className="mt-3 flex items-center gap-3">
                    <PetAvatar pet={predictedPet} size={40} />
                    <div>
                      <p className="font-semibold text-ink">
                        {prediction.petId === null
                          ? "Not one of the registered pets"
                          : predictedPet?.name ?? `Class ${prediction.petId} (not in this household)`}
                      </p>
                      <p className="text-sm text-muted tabular-nums">
                        {(prediction.confidence * 100).toFixed(1)}% confident · threshold {settings.confidenceThreshold}% · model {prediction.modelVersion}
                      </p>
                    </div>
                  </div>
                  {prediction.status === "RECOGNIZED" && !meetsThreshold && (
                    <p className="text-sm text-muted mt-3">
                      The feeder would refuse this identification: below the confidence threshold in Settings.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted mt-6 flex items-center gap-1.5">
          <Brain size={14} /> Runs entirely in your browser — the photo never leaves this page.
        </p>
      </Card>
    </div>
  );
}

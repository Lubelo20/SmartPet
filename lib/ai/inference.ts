import { FeederError, toFeederError } from "@/lib/errors";
import { topPrediction, type ModelLabels } from "@/lib/ai/predict";
import type { Prediction } from "@/lib/types";

/**
 * Browser-side model loading and prediction.
 *
 * The AI design spec put inference on Cloud Run; this project has no billing,
 * so the model ships as static files under /models/<version>/ and runs in the
 * browser via TensorFlow.js (spec amendment §D′). The registry contract is
 * unchanged: Firestore's models/{version} and system/ai still describe the
 * active model — this module just reads the static mirror, which needs no
 * auth and works identically in mock mode.
 *
 * TensorFlow.js is imported dynamically so its weight never lands in the
 * bundle of pages that do not predict anything.
 */

export type StaticRegistry = { activeVersion: string };

export type ActiveModel = {
  version: string;
  labels: ModelLabels;
  metadata: Record<string, unknown>;
  predict(source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageData): Promise<Prediction>;
  dispose(): void;
};

async function fetchJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new FeederError("not-found", `Could not load the ${what}.`);
  return (await res.json()) as T;
}

export async function loadActiveModel(): Promise<ActiveModel> {
  try {
    const registry = await fetchJson<StaticRegistry>("/models/registry.json", "model registry");
    const version = registry.activeVersion;
    const [labels, metadata, tf] = await Promise.all([
      fetchJson<ModelLabels>(`/models/${version}/labels.json`, "model labels"),
      fetchJson<Record<string, unknown>>(`/models/${version}/metadata.json`, "model details"),
      import("@tensorflow/tfjs"),
    ]);
    const model = await tf.loadGraphModel(`/models/${version}/model.json`);

    return {
      version,
      labels,
      metadata,
      async predict(source) {
        const input = tf.tidy(() =>
          tf.image
            .resizeBilinear(tf.browser.fromPixels(source), [224, 224])
            .toFloat()
            .expandDims(0),
        );
        try {
          const out = model.predict(input) as { data(): Promise<Float32Array>; dispose(): void };
          const probs = await out.data();
          out.dispose();
          return topPrediction(probs, labels, version);
        } finally {
          input.dispose();
        }
      },
      dispose() {
        model.dispose();
      },
    };
  } catch (e) {
    throw toFeederError(e, "The identification model could not be loaded.");
  }
}

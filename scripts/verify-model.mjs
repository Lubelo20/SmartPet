/**
 * Assert the exported TFJS model actually recognises held-out test images.
 *
 * Runs the real artefacts (public/models/<version>/) through the same
 * TensorFlow.js runtime the browser uses, on a sample of test-split images
 * the model never saw in training. This is the check that the export step —
 * not just the Python model — is correct: a wrong preprocessing assumption or
 * a mangled weight file fails HERE, before a human ever eyeballs the UI.
 *
 * Usage: node scripts/verify-model.mjs <dataDir> [version] [minAccuracy]
 *   dataDir: the ml/ prepared data dir containing test/<class>/*.jpg
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import jpeg from "jpeg-js";
import * as tf from "@tensorflow/tfjs";

const [dataDir, version = "v1.0", minAccuracyArg = "0.85"] = process.argv.slice(2);
if (!dataDir) {
  console.error("usage: node scripts/verify-model.mjs <dataDir> [version] [minAccuracy]");
  process.exit(2);
}
const MIN_ACCURACY = Number(minAccuracyArg);
const MODEL_DIR = join("public", "models", version);
const PER_CLASS_SAMPLE = 12;

// tfjs's graph-model loader speaks HTTP; serve the artefacts to ourselves.
const server = createServer((req, res) => {
  const p = join(MODEL_DIR, req.url.slice(1));
  try {
    res.end(readFileSync(p));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const labels = JSON.parse(readFileSync(join(MODEL_DIR, "labels.json"), "utf8"));
const model = await tf.loadGraphModel(`http://127.0.0.1:${port}/model.json`);

const classToIndex = Object.fromEntries(
  Object.entries(labels).map(([i, row]) => [row.petId ?? "OTHER", Number(i)]),
);

let right = 0, total = 0;
const perClass = {};
for (const [classKey, want] of Object.entries(classToIndex)) {
  const dir = join(dataDir, "test", classKey);
  if (!existsSync(dir)) {
    console.error(`missing test split for ${classKey} at ${dir}`);
    process.exit(2);
  }
  const files = readdirSync(dir).filter((f) => extname(f) === ".jpg").slice(0, PER_CLASS_SAMPLE);
  let classRight = 0;
  for (const f of files) {
    const { data, width, height } = jpeg.decode(readFileSync(join(dir, f)), { useTArray: true });
    const input = tf.tidy(() =>
      tf.image
        .resizeBilinear(tf.browser.fromPixels({ data, width, height }, 3), [224, 224])
        .toFloat()
        .expandDims(0),
    );
    const out = model.predict(input);
    const probs = await out.data();
    input.dispose(); out.dispose();
    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
    if (best === want) { right++; classRight++; }
    total++;
  }
  perClass[classKey] = `${classRight}/${files.length}`;
}
server.close();

const accuracy = right / total;
console.log(`per-class: ${JSON.stringify(perClass)}`);
console.log(`sampled accuracy: ${right}/${total} = ${(accuracy * 100).toFixed(1)}%`);
if (accuracy < MIN_ACCURACY) {
  console.error(`FAIL: below the ${MIN_ACCURACY * 100}% floor — the export or the model is wrong.`);
  process.exit(1);
}
console.log("PASS");

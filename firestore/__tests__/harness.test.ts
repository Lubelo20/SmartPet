import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-feeder",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

describe("emulator harness", () => {
  it("loads the rules file and enforces it", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "households/anything")));
  });
});

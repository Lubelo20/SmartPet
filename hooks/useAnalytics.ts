"use client";

import { useMemo } from "react";
import { deriveAnalytics } from "@/lib/analytics";
import type { FeedingRecord, Pet } from "@/lib/types";

export const useAnalytics = (feedings: FeedingRecord[], pets: Pet[]) =>
  useMemo(() => deriveAnalytics(feedings, pets), [feedings, pets]);

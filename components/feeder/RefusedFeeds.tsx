"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHead } from "@/components/ui/SectionHead";
import { useServices } from "@/services/services-provider";
import { rejectionMessage } from "@/lib/decision-messages";
import { fmtTime, timeAgo } from "@/lib/utils";
import type { FeedingEvent } from "@/lib/types";

/**
 * The refusals. A feeding record only exists when food moved, so a refused
 * feed used to leave nothing behind but a toast that had already gone — and
 * "why did my pet not get fed?" was unanswerable. These rows are the answer.
 *
 * Read directly through useServices rather than the provider: this is the one
 * place in the app that wants them, and putting a fifth collection into the
 * provider's state would make every page pay for a list only this card reads.
 */
export function RefusedFeeds() {
  const { services } = useServices();
  const [rows, setRows] = useState<FeedingEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void services.feedingEvents
      .list()
      .then((all) => { if (!cancelled) setRows(all.filter((r) => r.decision === "REJECTED")); })
      // A failure here must not take the History page down with it: the
      // feeding log below is the primary content.
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [services]);

  return (
    <Card className="p-5">
      <SectionHead
        title="Refused feeds"
        subtitle="Every time the feeder declined to dispense, and why."
        right={rows && rows.length > 0 ? <Badge tone="warning">{rows.length}</Badge> : undefined}
      />
      {rows === null && <p className="text-sm text-muted">Loading…</p>}
      {rows !== null && rows.length === 0 && (
        <EmptyState
          icon={ShieldAlert}
          title="No refusals"
          message="Nothing has been declined. Refusals appear here with the reason — a cooldown, a daily limit, an unrecognised animal."
        />
      )}
      {rows !== null && rows.length > 0 && (
        <ul className="divide-y divide-line-soft">
          {rows.slice(0, 12).map((r) => {
            const { title, message } = r.reason
              ? rejectionMessage(r.reason, { petName: r.petName })
              : { title: "Refused", message: "No reason was recorded." };
            return (
              <li key={r.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="text-sm text-muted">{message}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted tabular-nums">{fmtTime(r.timestamp)}</p>
                  <p className="text-xs text-muted">{timeAgo(r.timestamp)}</p>
                  <p className="text-xs text-muted mt-0.5">{r.trigger} · {r.requestedG} g</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

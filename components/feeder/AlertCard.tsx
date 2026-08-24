import { Clock, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TONE } from "@/components/ui/tone";
import type { Alert } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

type AlertCardProps = { alert: Alert; onRead: (id: string) => void };

export function AlertCard({ alert, onRead }: AlertCardProps) {
  const t = TONE[alert.severity] || TONE.info;
  const Icon = t.Icon;
  return (
    <Card className={`p-4 sm:p-5 flex items-start gap-4 ${alert.read ? "" : "border-slate-300"}`}>
      <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${t.bg} ${t.text}`}><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-slate-900">{alert.title}</p>
          <Badge tone={alert.severity}>{alert.severity === "info" ? "Information" : alert.severity === "warning" ? "Warning" : "Critical"}</Badge>
          {!alert.read && <span className="w-2 h-2 rounded-full bg-amber-500" />}
        </div>
        <p className="text-sm text-slate-500 mt-1">{alert.message}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Clock size={12} /> {timeAgo(alert.timestamp)}</span>
          <span className="inline-flex items-center gap-1"><Cpu size={12} /> {alert.source}</span>
          <span>{alert.type}</span>
        </div>
      </div>
      {!alert.read && <Button variant="subtle" size="sm" onClick={() => onRead(alert.id)}>Mark read</Button>}
    </Card>
  );
}

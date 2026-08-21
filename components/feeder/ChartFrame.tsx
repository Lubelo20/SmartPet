import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";

type ChartFrameProps = { title: string; subtitle?: string; children: ReactNode; height?: number; right?: ReactNode };

export function ChartFrame({ title, subtitle, children, height = 260, right }: ChartFrameProps) {
  return (
    <Card className="p-5">
      <SectionHead title={title} subtitle={subtitle} right={right} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </Card>
  );
}

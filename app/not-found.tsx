import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <EmptyState
          icon={Compass}
          title="Page not found"
          message="That address does not match any screen in the dashboard."
          action={
            <Link href="/">
              <Button>Back to dashboard</Button>
            </Link>
          }
        />
      </Card>
    </div>
  );
}

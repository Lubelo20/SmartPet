import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Pet } from "@/lib/types";
import { PetAvatar } from "@/components/feeder/PetAvatar";
import { MiniStat } from "@/components/feeder/MiniStat";

type PetCardProps = { pet: Pet; todayG: number; onView: () => void; onEdit: () => void };

export function PetCard({ pet, todayG, onView, onEdit }: PetCardProps) {
  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start gap-4">
        <PetAvatar pet={pet} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 truncate">{pet.name}</h3>
            <Badge tone={pet.status === "Active" ? "success" : "neutral"} dot>{pet.status}</Badge>
          </div>
          <p className="text-sm text-slate-500 truncate">{pet.breed}</p>
          <p className="text-xs font-mono text-slate-500 mt-0.5">{pet.id}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 mt-4">
        <MiniStat label="Body weight" value={`${pet.weightKg} kg`} />
        <MiniStat label="Portion" value={`${pet.portionG} g`} />
        <MiniStat label="Meals / day" value={pet.mealsPerDay} />
        <MiniStat label="Eaten today" value={`${todayG} g`} />
      </dl>
      <div className="flex gap-2 mt-5">
        <Button variant="dark" size="sm" className="flex-1" onClick={onView}>View profile</Button>
        <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>
      </div>
    </Card>
  );
}

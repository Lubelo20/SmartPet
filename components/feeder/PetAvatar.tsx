import { PawPrint } from "lucide-react";
import type { Pet, PetColour } from "@/lib/types";
import { PET_COLOUR } from "@/components/feeder/pet-colour";

type PetAvatarProps = { pet: Pet | null; size?: number };

export function PetAvatar({ pet, size = 44 }: PetAvatarProps) {
  const cls = PET_COLOUR[pet?.colour as PetColour] || PET_COLOUR.amber;
  return (
    <div className={`shrink-0 rounded-2xl flex items-center justify-center font-bold ${cls}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {pet ? pet.name.charAt(0) : <PawPrint size={size * 0.42} />}
    </div>
  );
}

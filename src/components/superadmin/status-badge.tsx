import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PHASE_LABELS, type SubscriptionPhase } from "@/domain/subscription";

const TONES: Record<SubscriptionPhase, BadgeTone> = {
  trial: "sky",
  active: "green",
  grace: "amber",
  expired: "red",
  suspended: "red",
};

export function PhaseBadge({ phase }: { phase: SubscriptionPhase }) {
  return <Badge tone={TONES[phase]}>{PHASE_LABELS[phase]}</Badge>;
}

"use client";

import type { PhaseId } from "./phase-types";

const PHASE_ORDER: PhaseId[] = ["storyboard", "animatic", "playblast", "render"];

export function PhaseSwitcher({
  value,
  onChange,
  t
}: {
  value: PhaseId;
  onChange: (phase: PhaseId) => void;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
      {PHASE_ORDER.map((phase) => {
        const active = phase === value;
        return (
          <button
            className={[
              "relative shrink-0 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide transition",
              active ? "text-fg-strong" : "text-muted hover:text-fg"
            ].join(" ")}
            key={phase}
            onClick={() => onChange(phase)}
            type="button"
          >
            {t(`scene.phase.${phase}`)}
            {active ? (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-red-500" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

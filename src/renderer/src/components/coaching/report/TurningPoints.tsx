import { TurningPoint } from '../TurningPoint'
import { GatedBlock } from './GatedBlock'
import { UnavailableNote } from './ReportNotes'
import type { NarrationOutput } from '@shared/types'

// Turning points — AI read, gated. NOT chat-referenceable: they're model output
// with no entry in the main-side anchor catalog (which only mints ids for stats,
// spec-003 highlights and deaths), so any id minted here would ground as "not
// found". Point at the timeline marker instead.
export function TurningPoints({ narration, timelineAvailable, analyzing, onAnalyze }: {
  narration: NarrationOutput | null; timelineAvailable: boolean; analyzing: boolean; onAnalyze: () => void
}) {
  if (narration) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {narration.turningPoints.map((t, i) => (
          <TurningPoint key={i} time={t.time} swing={t.swing} swingDir={t.dir} you={t.you} event={t.event} objective={t.objective} what={t.what} better={t.better} />
        ))}
      </div>
    )
  }
  return timelineAvailable
    ? <GatedBlock title="The moments that decided the game" hint="Corky pinpoints each swing on the map and shows the better play." analyzing={analyzing} onAnalyze={onAnalyze} />
    : <UnavailableNote what="Turning points" />
}

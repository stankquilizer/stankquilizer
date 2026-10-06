# stankquilizer — observatory feature map

The observatory is an external control/observability surface. It does not replace public-site behavior.

## v3.7 systems

| Main-site system | Observatory view | Useful controls / diagnostics |
|---|---|---|
| AudioReactive analyser | Audio / Live | analyser active, gain calibration, signal level, bass/treble/overall activity, inactive-processing rate |
| MoodController / time mood | Atmosphere | current mood, time-based mood, temperature, transitions, reduced-motion state |
| ParticleController / symbols | Atmosphere | active/disabled, desktop/mobile, reduced-motion, symbol lifecycle |
| SessionEvolution | Sessions / Atmosphere | 5/10/20/30-min milestones, real listening time, paused-vs-playing correctness |
| SiteMemory | Memory | visits, first visit, tracks heard, album visits, radio sessions; storage fallback status |
| Radio / TRACKS | Radio | queue, current track, starts, skips, meaningful plays, completions, no-repeat behavior |
| Media Session / keyboard controls | Player health | play/pause/next/media-session events and browser compatibility aggregates |
| Fullscreen radio | Radio / Sessions | opens, duration, fullscreen log usage, track-specific state transitions |
| Transmission log | Sessions | chronological heard-track history and session-specific transmission events |
| Track identity / favicon / title | Identity | track-specific title/favicon transitions and failures |
| Theme toggle | Interface | light/dark usage and transition events |
| Volume / remembered volume | Player health | volume interactions, mute/unmute, restore success |
| Shuffle | Radio | shuffle requests, adaptive queue ordering, immediate-repeat violations |
| Boot sequence / flicker | Interface | boot timing and returning-visitor variation |
| Late-night behavior | Atmosphere / Memory | late-night sessions, line shown, duplicate/reload suppression |
| Returning visitor behavior | Memory | first/returning/5+ visit states, glow evolution |
| Idle dimming / whispers | Interface | idle duration, whisper triggers, reset correctness |
| Cursor / ghost cursor | Atmosphere | desktop availability, reduced-motion behavior |
| VHS/glitch effects | Atmosphere / System | trigger counts, cleanup success, corruption presentation events |
| Share / last-played | Discovery | share attempts, last-played state, failure/fallback counts |
| Responsive/mobile behavior | System | mobile feature skips, safe-area behavior, performance signals |
| Reduced motion | System | preference detection and feature suppression |
| Light mode | System | mode distribution and visual feature compatibility |
| Error/fallback handling | System | storage failures, playback errors, analyser failures, event-ingestion failures |

## v3.6 / Category 5 foundation

The existing local memory remains private. The observatory receives only event summaries and deliberately selected aggregate signals.

- visit count / first-visit behavior
- meaningful-play threshold (10 seconds)
- album visit behavior
- radio-session behavior
- late-night behavior
- session evolution
- transmission log activity
- reset activity
- memory fallback / corruption handling

## Category 5 v2

All 21 features get a health card, trigger count, recent events, and (where safe) current state:

1. behavioral memory
2. listener profile
3. track & album affinity
4. avoidance memory
5. memory decay
6. adaptive radio
7. anti-personalization / exploration
8. rediscovery
9. session archetypes
10. session temperature
11. adaptive atmosphere
12. memory-driven UI
13. site state
14. relationship age
15. memory ghosts
16. session milestones
17. progressive unlocking
18. discovery ledger
19. presentation-only memory corruption
20. completion state
21. res(e)t / new lives / rebirth

## Recommended additional observatory pages

### Player laboratory
A diagnostic view for the entire player/analyser chain. Show current track, audio signal, gain, analyser state, playback state, volume, Media Session state, fullscreen state and recent player errors.

### Experience timeline
One unified timeline combining radio, memory, UI, atmosphere, album and system events. This becomes the easiest way to understand what a session actually experienced.

### Feature matrix
Every v3.7 + Category 5 feature in one table: status, last trigger, trigger count, affected surface, current state, errors, and build introduced.

### Visitor journey
A privacy-safe aggregate journey: entry → boot → first interaction → radio → album → fullscreen → rediscovery → completion/reset. Never show identifying information.

### Album laboratory
For each project: visits, entry source, track order, meaningful plays, completions, skips, rediscoveries, temperature changes, atmosphere changes and memory interactions.

### Radio laboratory
Show adaptive score components separately: familiarity, completion rate, recency, rediscovery, exploration and session mood, plus why a track was selected.

### Memory laboratory
Show the engine's model without exposing raw visitor memory: affinity changes, avoidance, decay, relationship state, generation, milestones, discoveries and reset/rebirth events.

### Live transmission
A restrained real-time screen showing anonymous active sessions, current tracks, state changes, temperature movement and feature triggers.

### QA / test console
A private control area for generating synthetic events, forcing late-night mode, simulating returning visits, testing reduced motion, triggering reset/rebirth, and verifying that each telemetry event arrives correctly.

### Deployment diff
Track build versions and show which features changed between deployments, so a regression can be correlated with a release.

### Privacy monitor
Explicitly report what the telemetry pipeline is accepting/rejecting: IP absent, location absent, raw local-memory object absent, unknown fields rejected, payload size, rate limits and failed ingestion.

## The most important connection

The observatory should be able to answer three questions for every feature:

1. **Is it alive?** — has it triggered recently?
2. **Is it behaving correctly?** — are expected events and transitions occurring?
3. **What did it change?** — which public-site surface reacted?

That makes the observatory a real control room rather than a generic analytics page.

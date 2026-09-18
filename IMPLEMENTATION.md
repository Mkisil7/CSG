# Tower Town: a place worth returning to

The full objective is to improve beauty, realism, and satisfying play across all
eight areas below. Completion requires runtime and visual verification, not just
passing unit tests. Work is on `codex/living-tower`, based on upstream `24c70b9`.

## Delivery and verification checklist

Delivery audit, 2026-09-18: all eight requested implementation areas are complete.
See [ACCEPTANCE.md](ACCEPTANCE.md) for the evidence matrix, final checks and
explicit limits. Older open-item statements below are chronological progress
notes, not the current delivery status. Completion means the requested systems
are implemented and checked; it does not certify human enjoyment or every device.

- [x] Resident identity and persistent stories: portraits, meaningful thoughts,
  friendships formed in the simulation, career memories, move-out warnings.
- [x] Construction reveals and distinct scenes for every business subtype,
  including opening sounds and visible arrivals.
- [x] More realistic visual direction: architectural styles, room activity,
  pets, rooftops, weather (rain, umbrellas, snow, wet reflections), contextual
  ambient sound and a distinctive dusk transition.
- [x] Congestion: visible queue pressure, stair abandonments, lost business,
  actionable improvements and measured before/after relief.
- [x] Three goal horizons: 3–5 visible, rewarding goals; persistent progress.
- [x] Neighborhood identity: derived character, named towers and districts,
  shareable skyline postcard.
- [x] Contextual surprises: critic, park band, growing startup, town character,
  festival; understandable causes and meaningful player responses.
- [x] Visible progression: architectural upgrades, landmarks, signage, public
  art, rooftop rewards, business variants, attractiveness score.

## Verification

Test simulation boundaries, persistence/old saves/sharing, and actual UI actions.
Review desktop and phone layouts, keyboard access, reduced motion, visiting mode,
and production build. The repository initially had 118 missions, procedural
rooms, city events, and existing career/need systems; extend those systems.

## Initial evidence

- Upstream HEAD verified at `24c70b9506d96c6dd8a234893f75727f7bc72ff1`.
- Workspace was empty and is now populated from the inspected upstream copy.
- Dependencies installed from the existing lockfile.
- Baseline preview loads with no console errors. Initial camera frames mostly
  roof and existing desktop dock consumes three rows at 1280×720; both need care.
- Mission streaks were not persisted. Existing saves use version 4.

## Implemented so far (2026-09-16)

- Resident portraits, descriptive traits, actionable thoughts, persistent career
  and arrival/departure memories, concern/recovery stories, mutual friendships
  after meeting at work or leisure on three different game days.
- Collapsible journal with three goal horizons, actual mission rewards/progress,
  neighbor directory and individual histories. Mission streaks now survive saves.
- Floor construction rise/reveal with a sign fade, subtype-specific dressing and
  muted wall colors, lower camera angle, named floor signs. Rebuilds release owned
  GPU resources. Desktop framing reserves space for the journal.
- Real stair journeys after abandoned lift waits, cancelled discretionary visits,
  per-business missed-visit counts, queue signs, and a lift-management panel.
  Upgrade comparisons start provisionally at 10 trips and finish at 20, including
  abandonments; daily totals stay accurate
  beyond the bounded sample buffer. Restoring saves retains transit-zone bonuses.
- Optional synthesized sound: unique opening motifs for all thirteen business
  subtypes, apartments and three public landmarks, using soft, plucked, bell,
  glass and wood-like harmonic envelopes. Ambient room/street/air/rain beds blend
  continuously with camera scale (including portrait framing), daylight, evening
  activity, population and weather. Rain gains a close-up low-pass shelter effect;
  snow quiets streets, and concert music fades with listener distance.
- Audio remains gesture-only and local. Muting cancels queued voices and suspends
  its context; hiding the tab also cancels one-shots. Return resumes the ambient
  bed without replaying a backlog. Mix automation is limited to ten updates per
  second, voices are capped at 32, ended nodes disconnect, and disposal removes
  sources, nodes and listeners. Rapid toggles and asynchronous resume failures
  are guarded; smoothing has a fallback for older audio implementations.
- Isolated `/?preview=sound` auditions all seventeen opening motifs through the
  real soundscape, with weather/daylight controls and visible audio-state/voice
  diagnostics. No save access and no production preview code.
- Editable town/tower/district names; district character derived from built uses;
  attractiveness calculated from variety, quality, wellbeing, parks, movement.
- Permanent skyline rewards: entrance canopies, modern/garden architecture,
  rooftop gardens, public sculptures, landmark crowns. Signature businesses earn
  gold signs, a journal story, and a 15% visitor premium through actual operation.
- Actual-scene PNG postcard export with town statistics and district names.
- Saved seasonal weather and deterministic half-day forecasts; continuous exposed
  street commutes, umbrellas, weather/shelter travel times, actual-visit cafe
  premium. Wetness/snow accumulation uses timestep-independent integration.
- Rain/snow particles, gradual cloud lighting, wet-street sign/window glints,
  rooftop/road-edge snow, rain sound layers. Reduced-motion disables precipitation
  motion. A forecast disclosure explains effects and the next interval.
- Small-screen HUD/forecast separation; Build/Manage dock now responds to narrow
  windows as well as touch devices, including live resizing. City happenings are
  grouped in a disclosure instead of stacking over the game.
- Isolated development weather study (`/?preview=weather`) without save access;
  production excludes it. Browser checks found and fixed far-plane sky clipping
  and stale events being announced during large time jumps.
- Contextual critic, park concert, startup expansion, neighborhood host and
  festival invitations, with explicit eligibility explanations and paid choices.
  Real lift-riding guests generate spending only on arrival, miss visits when
  queues fail, and never count as residents or renters. Festivals award their
  special storefront after twelve completed visits; critics must actually arrive.
- Permanent critic/festival storefront variants, founder and innovation studios,
  a lit wooden bandstand with musicians and timed audience paths, and named host
  benches. Park trees and benches now leave a clear audience/stage sightline;
  broadleaf crowns and rough materials replace the old bright conical park trees.
- Event save validation rejects invalid locations, duplicate guests and impossible
  park paths. Missed guests cannot restart a purchase on reload. Trip outcomes are
  consumed once. Earned bandstands survive pruning of the bounded event archive.
- Event counters update in place rather than detaching controls during arrivals.
  Inspector scroll position is retained on refresh; the close button stays at the
  top of its scroll area. Development controls no longer cover that close button.
- Simulation-grounded room staging: real baristas, cooking staff with aprons and
  pans, coffee collection followed by seating, two-person office meetings and
  typing, household reading and bedtime rest. Furniture and actor targets share
  coordinates. The four household seats no longer stack everyone in one corner.
- Named household cats persist through stable resident identity, remain at home
  during commutes, and link to their owner when picked. Profiles name the pet.
  Cats and steam have bounded, disposable geometry; steam requires a physically
  present worker. Dynamic reduced-motion preferences stop new gestures and steam.
- Portraits and procedural characters now share skin, hair and clothing colors.
  Muted wood/fabric/metal materials and slimmer, higher signs improve room
  visibility. The barista stands beside, rather than behind, the espresso machine.
- Isolated `/?preview=rooms` study with replay and floor framing, excluded from
  production and never reading/writing player saves.
- Unified solar lighting: sunrise/sunset follow the visible sun's elevation,
  with a moving warm golden-hour key, a smooth moonlight handover, separate
  rose/blue/horizon sky bands, matching fog and cloud attenuation. Reduced bloom
  plus one shadowless front fill keep rooms readable without per-room lights.
- Occupancy-aware window panes with staggered evening thresholds and varied warm
  tones; empty rooms stay cool, homes dim toward bedtime, lobby doors stay lit.
  Owned pane materials are released during shaft and subtype rebuilds. Weather
  and room studies now expose more lighting phases for repeatable inspection.
- Dedicated public landmark floors: earned conservatory, gallery and observatory
  choices, with one permanent addition per Mixed-Use/Transit tower. Unlocks are
  persistent; observatories require eight existing floors. Costs and restrictions
  are explicit, and building never removes homes or jobs. Build-menu, skyline,
  lobby and earned-goal entry points navigate to the landmark choices.
- Free landmark leisure uses actual residents and lift arrivals, can fail from
  congestion, restores entertainment only on arrival, and forms friendships
  through repeat co-location. Daily/lifetime visit counts and the once-per-day
  benefit survive save/share restoration. No invented rents, staff or purchases.
- Distinct owned landmark geometry: garden arches, reading benches/specimen trees
  and reflecting pool; freestanding paintings and a sculpture court; telescopes,
  star chart and orrery. Real actors read, admire art and use the telescopes.
  Models use no extra lights or decorative resident actors, and release their
  geometry/materials on rebuild. Attractiveness includes public places within
  the existing 20-point greenery cap. Desktop dock width now avoids a third row.
- Isolated `/?preview=landmarks` eligible town and minute-by-minute evening
  advance, excluded from production and never touching the player's save.
- Fireworks now rise as golden rockets before soft round bursts with falling
  trails. Shared radial texture and screen-sized points remove zoom-dependent
  squares; four pooled bursts (932 points total) stay behind and above nearby
  roofs. Analytic drag/gravity keeps trajectories frame-rate independent.
  Pause freezes spawning/positions/fading; live reduced motion hides the effect
  immediately, and background gaps cannot trigger catch-up barrages. Geometry,
  materials, texture and preference listener have idempotent cleanup.
- The neighborhood development study offers one-hour simulation steps for
  inspecting genuine guest trips and reward thresholds, and collapses afterward.
- Replaced the flat pastel landscape/conical trees with muted, softly varied
  ground, stone paving and a deterministic broadleaf grove. Background trunks,
  crowns and snow use five instanced batches, with fewer than 70,000 triangles
  including snow. Unlocked plots gain entrance aprons, planted edges, slatted
  benches and emissive street lamps with soft ground pools (no new light sources).
- Snow accumulation now also whitens the ground and park lawns/paths and adds
  crown caps and planting-bed snow; clearing the saved snow restores the greens.
  Paving roughness follows wetness. Actual street routes and walking heights are
  unchanged. Landscape resources are stable during updates and disposed once;
  park disposal now releases its owned geometry and lamp materials as well.
- Architecture now has style-specific exterior finishes and roof silhouettes:
  heritage masonry with constant-scale filtered brickwork, stone courses and
  cornice, a water tank and chimney; modern metal framing, glass fins and screened
  roof plant; garden timber screens, trailing planters and a pergola. Earned
  gardens, crowns, canopies and art remain independent of the selected style.
  Rebuild cleanup now releases owned Standard-material textures as well as sign
  textures, deduplicated without disposing shared floor palettes or GLB assets.
- Replaced width-only tower and fixed-distance town cameras with perspective
  bounds fitting. Both reserve persistent HUD/journal/dock space. Up to eight
  floors fit from street through the earned crown; taller towers retain a
  readable scroll window, while explicit floor links retain a closer framing.
  Town framing includes actual tower heights, parks and the next lot, and adapts
  on resize/growth without resetting ordinary orbit/zoom each frame. Far-plane,
  zoom bounds and fog support distant portrait surveys. A larger two-triangle
  grass plane removes the exposed edge of the old disk at these distances.
- The scene is keyboard-focusable (arrow/Page scrolling, Home street, End roof).
  A desktop-open journal collapses when the layout becomes compact. No player
  simulation or save schema changed during this camera pass.
- Coordinated the 2.2-second opening: room/facade rise, later furnishings, then
  nameplate fade/lighting and a one-time subtype sound cue. Shaft height, roof
  and cornice follow the total unfinished stack, including rapid additions.
  Paused/hidden tabs do not advance reveals, real-time pacing is independent of
  simulation speed, and large frame gaps are bounded. Live reduced motion finishes
  the scene without a paused cue backlog. Loads and shaft/subtype rebuilds never
  replay historical openings. Steady completed towers skip reveal traversal.
- Normal builds bring the new floor into view. Room nameplates hang below the
  heritage cornice; the lobby sign remains above its canopy. The isolated
  `/?preview=construction` study builds through ordinary purchase logic and can
  hold the actual visual clock at structural, furnished and lit-sign phases.
  It never accesses player saves and is excluded from production.
- Added actual-resident retail and factory activity: grocery browsing/baskets,
  clothing inspection, device trials, late-visit checkout with a present clerk,
  stocking/folding/demonstration staff, assembly work, processing controls,
  fabrication panels and foreman inspections. Old untimestamped visits keep
  browsing; staging never changes purchases, production, resident state or jobs.
- Work accessories are allocated only for participating actors, reused, cleared
  on departure (including commuting), and disposed with their owner. Individual
  gesture phases avoid synchronized workers; pause/reduced-motion keep work
  gestures stable. Grocery/electronics rooms no longer contain mannequins, shop
  stock materials vary, and workshops have assembly pieces and tank valves.
- `/?preview=trades` stages twelve real residents in a disposable shop/workshop
  town with six subtype selectors and browse/checkout phases; no player save or
  production preview controls are involved.

## Current verification and remaining work

TypeScript passes. All **516 tests across 72 files pass**, including seventeen
neighborhood simulation/persistence tests and three event-panel tests. New coverage
includes one-time charges, eligibility, staff transfers, physical-location-based
innovation wages, real critic/festival visits, queue failures, temporary benefit
expiry, permanent rewards, archive pruning, malformed references, stable markup
and visiting-mode controls. Eleven new room-life tests cover actual staff
presence, café visit phases, old activity timestamps, timed meetings, household
seats and individual bedtimes, bounded staging, pet persistence and cleanup,
portrait/model palette consistency and dynamic reduced motion. Seven lighting
tests cover solar timing, midnight wrap, bounded/cloud-attenuated values, smooth
light handovers, sky/fog agreement, focused shadows, actual occupancy, bedtime
dimming and pane-material disposal/recreation. Fourteen landmark tests cover
unlock persistence, costs/zoning/height/duplicate guards, no eviction, real lift
arrivals and misses, free leisure and daily reset, save/share round-trips,
friendship persistence, actual-actor poses, bounded distinct models, disposal,
pose cleanup and read-only panel controls. Nine firework tests cover radial
alpha/screen sizing, rocket/burst/trail phases, roof/depth placement, pause,
frame-rate agreement, event-end/daylight behavior, live reduced motion, bounded
resource reuse, invalid inputs/background gaps and disposal. Fourteen sound tests
cover unique bounded motifs, continuous zoom/weather/day/night targets, empty-town
silence for human activity, concert attenuation, opt-in behavior, mute/re-enable,
tab suspension, no backlog, automation frequency, legacy smoothing fallback,
voice bounds/cleanup, rejected starts, resume races and disposal. Six landscape
tests cover deterministic bounded groves, instancing/triangle bounds, no added
lights or actors, unlock visibility without simulation changes, all-tower route
clearance, walking height, material/weather changes, park snow/melt and resource
reuse/disposal. Five architecture tests cover distinct bounded models, central
room and both lift waiting-lane clearance, constant-scale masonry, resource
disposal on style/height/shaft rebuilds, and preservation of earned decorations
without simulation changes. Five framing tests project all eight bounds corners
across six viewport sizes and three orbit directions, test parks/next-lot/height
coverage, tall-tower scroll limits, selected-floor framing, resize/growth refits,
manual town camera preservation and extended clipping/zoom limits. Twelve opening
tests cover staged timing and invalid/background deltas, coordinated geometry,
sign clearance, one-time cues, pause/resume, rapid stacks, live reduced motion,
style changes, shaft/subtype rebuilds and loaded-town suppression. Six trade-life
tests cover subtype staging, actual worker presence/assignment, late checkout,
unchanged transactions/state, old visits, crowd bounds/order independence,
foreman roles, prop transitions/commute cleanup, pause/reduced motion, reuse and
one-time resource disposal. Earlier story,
congestion, identity and seasonal weather coverage remains green. Production
build passed; Vite still warns about the large main chunk. Current output:
941.27 kB main JS (266.14 kB gzip), 23.49 kB CSS (5.95 kB gzip);
large-chunk warning remains.
TypeScript and
`git diff --check` pass; development-study controls do not occur in the generated
assets. A final 390x844 screenshot confirms the green action button, reachable
sticky close control and development panel clear of the inspector. The viewport
override was reset after checking.

Browser smoke check confirmed construction, named rooms, moving residents, three
goal cards, journal, lift-flow control and sound toggle, with no console errors
at that point. A subsequent browser pass verified rain, overcast scene, wet-street
glints, snowfall, visible street residents, warm evening windows, and the revised
390x844 phone layout/build-menu opening and closing, without captured console
errors. The browser is available again. Some district/architecture/postcard changes
still need interactive verification; subjective audio quality and reduced-motion
behavior across the whole game remain unverified.

Neighborhood browser pass: accepted critic, band, startup and neighborhood-host
invitations through the UI; observed an actual critic review, staff transfer
outcome, concert musicians and arriving audience. The first screenshot exposed a
tree hiding the stage; a subsequent screenshot verified the cleared sightline,
wooden stage, warm lights and broadleaf trees. Accepted a festival in a 390x844
viewport and observed four completed purchases. This initial pass confirmed the
12-visit reward only via simulation tests; the later fireworks pass below now
also verifies it through browser gameplay. Captured console checks
had no warnings/errors. Browser interaction calls intermittently timed out;
state was rechecked before retrying. Phone concert/startup actions succeeded on
the revised UI while paused; a complete unpaused interaction/performance audit
remains necessary. The stable counter markup has a regression test. All preview
work used an isolated town, never the player's save.

Room browser pass: inspected coffee collection/seating, visible barista and chef,
office coworkers at the meeting table, windowsill cats, and household reading.
The first views caught espresso-machine/sign occlusion and stacked household
poses; coordinates, signs and seating were revised. Noah's profile explicitly
names Pebble, matching the household pet feature. Captured console checks had no
warnings/errors. A final screenshot confirmed the separated household seats with
books visible after reversing the obscuring seat backs. The disposable room tab
was closed afterward. This is desktop visual evidence; mobile room legibility,
large-population performance and long-running animation quality still need checks.
Reduced-motion coverage for these new scenes is automated, not an OS/browser
visual acceptance test.

Lighting browser pass: compared the old flat dusk with the new occupied-night
café, sunset skyline, rainy dusk and rainy night. The first sunset looked muddy;
a separate rose middle band corrected the orange/blue blend. A 390x844 room
check confirmed visible warm household windows, cool vacant floors and reachable
phone controls after collapsing the journal. Small character details remain
hard to read at that width; this is not a complete phone/performance acceptance
test. A temporary hot-reload mismatch occurred while the Sky API and its caller
were being edited; fresh weather and room tabs loaded and rendered without
captured warnings/errors. The viewport was reset and disposable tabs closed.

Landmark browser pass: built all three variants through the UI. The initial
conservatory recorded five real visits with readers visible on the benches;
the observatory recorded five, then seven in the final refined run, with actual
residents at telescopes. Inspected the gallery's art panels and sculpture, garden
arches and revised splayed telescope supports. The first added build button
caused a third desktop dock row; an explicit desktop width restored two rows.
The goal now names its target tower. Built an observatory in the 390x844 layout;
shortening/collapsing the debug panel after its action leaves the inspector close
control unobstructed. Captured logs were empty. One close-click transport timeout
was re-observed before retrying. Viewport reset and preview closed. Browser
save/share/reduced-motion and long-session landmark balance remain unverified;
those lifecycle/guard paths have automated coverage, not full runtime acceptance.
Existing festival fireworks appeared as large square particles in these views;
the subsequent fireworks pass replaces that treatment.

Fireworks/festival browser pass: accepted the critic, band, startup, host and
festival via actual UI in `/?preview=neighborhood`. Normal minute-by-minute
simulation produced a critic review, 27 concert arrivals, and twelve served
festival guests with zero misses by day 11, 21:19. The event outcome and journal
reported the earned distinction; following the event's location link opened
Pocket Shop with “Festival favorite · +10% visitor spending.” Its phone inspector
showed the reward and a reachable close button. Desktop screenshots captured a
rising rocket and rounded falling trails above the roofs, without the old square
particles. Pausing/resuming was exercised; exact animation freeze and live
reduced-motion behavior additionally have automated coverage. A 390x844 screenshot
also captured the new burst; the journal still occludes part of the sky at this
width, so this is not a full mobile composition audit. Captured warning/error
logs were empty. Preview controls remain excluded from the production assets.
No player save was read or written. OS-level motion-preference changes, festival
expiry/reload and subjective audio are still unverified in the browser.

Sound browser pass: the isolated sound study remained off on load and explicitly
refused an audition before enabling sound. After the real Sound on gesture,
Coffee Shop, Assembly Plant and Skyline Observatory each scheduled eight Web
Audio tones; the live engine reported running and returned to zero active tones
after envelopes completed. Switched rainy morning to snowy night and tower to
town view without captured warnings/errors. Muting prevented another cue;
re-enable and a lounge cue were exercised afterward. These are actual browser
API/lifecycle checks, not a claim of subjective listening quality. Continuous
mix targets, voice bounds and hidden-tab races have automated tests; live tab
switching, speaker/headphone balance and all-cue auditory acceptance remain open.

Landscape browser pass: inspected clear morning, rainy dusk, and accumulating
snow in the isolated weather town. The first grass material showed a distracting
woven grid; seamless low-contrast value noise removed that pattern in the next
daylight screenshot. The initial snowy trees above a green lawn exposed a surface
mismatch; ground and park colors/crowns now follow the same saved snow value.
Screenshots show broadleaf groves, benches, planted edges and a clear promenade;
the dusk view includes warm street lamps. A 390x844 winter view confirms the park
and surrounding ground respond consistently and the mobile dock remains visible.
Captured warning/error logs were empty. These are visual checks, not real-phone
performance measurements or proof of the full realism requirement. Further tower
architecture, richer room detail and overall camera composition remain open.

Architecture browser pass: switched all three styles through the real lobby
selector in the isolated weather preview. Golden-hour close-ups show heritage
brickwork, slimmer modern framing and garden planting without hiding the central
room scenes. Desktop town view shows the modern side treatment and roof plant;
the 390x844 garden tower view retains readable rooms and a reachable mobile dock.
Captured warnings/errors were empty. The phone town-wide view crops the leftmost
tower; close desktop framing also omits the rooftop. These remain camera-
composition issues, not a verified all-style roof/detail audit. Unit tests cover
roof shape bounds and retained rewards. Actual mobile performance and construction
reveal/architecture coordination still need acceptance. Player saves were untouched.

Camera browser pass: the golden-hour desktop screenshot now contains the full
five-floor heritage tower, roof planting and water tank, with the journal and
build dock clear of the building. Phone tower view likewise includes street and
roof. At 390x844, town view contains both towers, park and next lot; the previously
cropped left tower is visible. Checked 844x390 landscape composition and an
expanded desktop journal collapsing on resize to phone. The first pulled-back
phone view exposed the old grass disk rim; a final screenshot after the plane
replacement has no visible ground edge. Captured warning/error logs were empty.
The viewport was restored and disposable preview closed. This does not verify
all keyboard/touch gestures, live large-town performance or every inspector/sheet
occlusion case; those remain acceptance work. The wide portrait town is necessarily
small on screen, with tower focus available for detail.

Opening browser pass: built a Coffee Shop in the isolated construction study.
Screenshots at 0.35 seconds show a partially risen empty shell with facade,
cornice and roof aligned; at 1.00 seconds furnishings appear before the nameplate.
Pausing at 1.00 and requesting the next phase kept the visible clock at 1.00;
resuming reached the 1.70-second lit-sign phase. That view exposed the cornice
covering the nameplate, so room signs were lowered and a clearance assertion added.
Built apartments through the normal phone Build menu; the sheet closed and camera
followed the new floor. The final desktop screenshot shows its full readable
nameplate under the cornice. Warning/error logs were empty, viewport reset and
preview closed. This is not an all-subtype visual/audio acceptance pass or an
OS-level reduced-motion test. Actual newly housed residents' arrival timing and
simultaneous-build actor alignment still need runtime acceptance.

Trade-life browser pass: inspected Grocery Store browsing and checkout, Clothing
Boutique, Electronics Shop, Assembly Plant, Food Processing and Electronics Fab
through the isolated study. Real shoppers moved from displays to the cashier;
factory line staff stood at three stations with a separate helmeted foreman.
Initial back-facing clothing/device poses hid held props, so those browsing poses
were turned to a three-quarter view; the final boutique screenshot shows the
held garments clearly. Assembly worktops gained parts and processing tanks gained
valves to match staff gestures. A 390x844 processing view retained the complete
tower and dock, but accessory detail is very small at this scale. Final desktop
processing screenshot inspected the added controls. Captured warnings/errors were
empty; viewport restored and preview closed. This is not measured real-phone
performance, full live-motion acceptance or final mobile prop legibility.

Postcard pass: replaced viewport copying with a dedicated 1504 × 730 full-town
capture inside the 1600 × 1100 editorial card. It includes actual unlocked towers,
roof features and parks, hides unowned plot signs, and retains current daylight.
Capture reuses the renderer and bloom chain and restores camera/projection,
pixel ratio, dimensions, sky and plot visibility, including encoding failures.
A native modal previews the same PNG used by its Download link; close restores
focus to the current skyline button. Filename fallback handles Unicode town names.
Five new tests cover full-town bounds, restoration on success/failure, composition
and filenames. TypeScript, all 252 tests and production build pass.
Browser inspected desktop and 390 × 844 preview, with all three fixture towers
and park present and no portrait letterboxing. Download PNG was clicked; the
actual saved file has not yet been independently opened/inspected. Intermediate
HMR saw an export-renaming error; a fresh-load check had no captured warnings or
errors, rendered the centered desktop card, and confirmed focus returned to
Save a skyline postcard after closing. Both disposable tabs were closed and
the desktop viewport restored.

Goal-loop pass: session cards now compare progress toward nearby milestones
instead of following five fixed missions and then the first unfinished entry.
Staffing requires a real restaurant, shaft installation must be available, and
expansion requires an affordable/population-unlocked lot with enough remaining
buildable sites. Family candidates need meaningful existing progress. First
Neighbors remains the introductory goal. Daily-income cards explain day-end
checking; display never changes reward or streak state. Completed happiness
goals advance to an unearned streak instead of showing an earned goal at zero.
Three core horizons remain after every mission is earned, with Signature-business
or district-character ambitions and no fictitious coin rewards. Chapter button
focus uses stable goal identity, not an index that may now refer to another goal.
Following a session card pins its exact mission first in the ledger, including
an explicit already-received receipt if that mission completes while open.
Eleven new tests cover selection, prerequisite gates, saved progress, exhausted
ledgers, reward purity and mission navigation. Browser followed Big Earner 1k
into the ledger and advanced 360 actual game minutes through day rollover:
the selected mission was marked paid, the completion count changed from 20 to
23, and the session card advanced. That check exposed a population-locked tower
goal; the additional gate and regression test fix it. Final 390 × 844 browser
check showed the selected income mission first and the planning rail collapsed,
with no captured warnings/errors. Viewport restored and disposable tab closed.
All 263 tests, TypeScript and production build pass. Long-session pacing, measured
5–15 minute reachability and real-phone performance are not proved by this pass.

Continuity pass: v4 saves now preserve net daily earnings (including negative
upkeep), with zero for old/malformed missing counters. Floor/resident/visitor
snapshots are detached from the running town, and restored resident needs,
traits and activity objects are detached from save input. Interrupted trips
restore same-day pre-departure need flags before replanning, so an unserved
purchase is not remembered as completed. Older city-wide events now save active
effects and scheduling; restoration uses known definitions, removes invalid or
expired entries, and never announces a saved event again. Older saves start
their future event schedule quietly rather than inventing past conditions.
The preview Friends panel can generate/visit codes but has no gift or persistent
player-setting controls; preview gift URLs no longer consume redemption state.
Five integration tests exercise actual compressed share codes, named friendships,
memories, Signature places, identities, goal/streak progress, snapshot isolation,
daily net earnings, interrupted visits and offline day-end reward-once behavior.
Two event tests cover schedule/effect restoration and old/invalid event saves.
Browser generated a code from the isolated landmark town and used the real Visit
form: the visited town retained its name, 32 neighbors, 3 towers, rain and more
than 2100 daily earnings, with its Big Earner goal still ready for day end.
Read-only skyline had no rename inputs; landmark offers had no buy buttons;
neighborhood invitations had no accept/decline spending controls. No captured
browser warnings/errors; the disposable visit tab was closed. Final TypeScript,
targeted continuity/event tests and production build pass. This does not verify all normal-autosave UI paths,
gift-redemption storage failure handling, every event lifecycle or full offline
balance. Automated save/share coverage is distinct from those runtime gates.

Congestion-relief pass: a failing real-rider regression demonstrated that a newly
bought shaft left the existing queue entirely assigned to the old shaft. Purchase
now redistributes queued riders oldest-first through the normal pickup estimator,
preserving destinations and original wait clocks; boarded riders and car state
are untouched. Charges and duplicate purchase guards remain unchanged. The goal
card now states that the shaft is available for 1500 coins when already unlocked.
The browser also exposed a biased early comparison: a quick first batch gave
96% shorter waits while 18 people still waited. Reports now show an explicitly
provisional result after ten trips, continue sampling through twenty, include
abandonments, and warn when recent waits remain high. Partial sampling survives
saves; later reports do not invent relief when waits worsen or no baseline exists.
DEV-only `/?preview=transit` stages 32 actual residents, 30 rush journeys and
80 simulated baseline minutes; replay stages journeys but never inserts wait
samples or visit income. The real controls purchase upgrades and advance traffic.
Five new tests cover immediate queue relief, car/passenger conservation, charge
once, sample continuation/restoration, worse-result honesty and read-only controls.
Browser verified 30 waiting, 18 earlier abandonments and 14 missed visits, bought
the shaft through the inspector, and advanced actual traffic. In the final replay,
an early 12/20 sample showed 57.1 → 3.3 min; the complete sample corrected to
57.1 → 29.6 min (48% shorter sampled waits), without declaring the tower solved.
Phone inspector showed actual residual daily totals (30 abandonments, 26 missed
visits) after the queue emptied. These are staged stress-study measurements, not
a general promise of upgrade effectiveness or proof of long-session balance.
No captured warnings/errors; viewport restored and disposable tab closed.
All 275 tests, TypeScript and production build pass; transit-study strings absent
from production assets. Live stair-motion legibility, different commute mixes,
and measured performance remain part of full acceptance.

Contextual-event alignment pass: removed the older random event generator,
including arbitrary recessions/heatwave penalties and announcements of crowds
or residents that did not exist. All new happenings now originate in the existing
neighborhood invitation system. Saved positive legacy bonuses retain their known
effects until original expiry, with explicit compatibility labels and no invented
guests; saved penalties are dropped. Old scheduling fields remain readable but
never restart the generator. This supersedes the scheduling behavior described
in the earlier continuity pass. Fireworks now require an actual hosted festival.
The top disclosure lists contextual invitations and hosted happenings, links to
the real choice panel, and distinguishes remaining saved bonuses. Eight event
tests now cover no future random events, positive expiry, penalty removal,
untrusted save validation, save/share compatibility and thirty simulated days.
The full suite remains 275 tests across 43 files; TypeScript and production build
pass. Browser checked desktop and 390 × 844 invitation navigation: declining the
critic left 24038 coins unchanged; booking the concert charged exactly 80 and
showed its actual duration/audience count. Phone disclosure showed Hosted versus
Invitation states and opened the choice panel, with no captured warnings/errors.
The isolated study overlay covered part of the desktop critic button, so the
unobstructed band button was used to open the same panel; this development-only
overlay is not shipped. Viewport reset and disposable tab closed. This pass does
not prove every hosted-event lifecycle, subjective audio or real-phone speed.

Earned-place pass: runtime inspection found that startup memories only linked
back to the original office and both variants shared their decoration. The
chosen destination is now saved as a detached, validated studio reference;
completed memories link separately to the original room and Innovation hub in
owned/shared towns. Missing old-save references are not guessed. Event floor
navigation now frames the selected level. Founders keep a warm early-computer
and sketch archive; the new hub has a metal-framed prototype workbench and
project board. Four additional tests cover exact destination/staff retention,
one-time charges, detached save input, invalid/older references, visiting controls,
distinct room geometry, envelope bounds, reuse and saved interior reconstruction.
Browser followed the new link to floor four with the two actual transferred
staff, and inspected the distinct rooms at desktop scale. At 390 × 844 the same
link reached the correct office and exposed its wage benefit/staff. Maya's real
120-coin host action produced the named bench beside Willow House and the
resident's +2 community-mood role. No captured warnings/errors; viewport reset
and disposable tab closed. All 279 tests, TypeScript and production build pass.
A rapid chained click immediately after expansion hit another card while a new
invitation was inserted; repeating after observing the settled panel worked.
Stabilizing that live-panel reflow remains an interaction gate, not a passed check.
Small-phone prop detail, full event expiration and runtime saved/shared scenery
remain distinct from this pass's automated save coverage.

Stable-interaction pass: the neighborhood inspector no longer replaces its
open card list during background refreshes. A fixed-height update control offers
new invitations/outcomes explicitly; accepting or declining remains an intentional
refresh. Attendance, remaining time, completion/archive status, affordability and
the actual selected studio's eligibility update in place, even with keyboard focus
inside the panel. Reserved status space prevents those lines from moving buttons.
Refreshing keeps keyboard focus in the new panel. Core response checks still run
before payment; stale actions cannot charge. Four DOM-boundary tests verify no
destructive markup writes/scroll changes, explicit refresh, focus-time eligibility,
expired/archived progress and studio-selection retention. Browser repeated the
previously failing rapid expansion-to-hub sequence and reached floor four with
the two actual staff. A real hosted concert updated to three arrivals after one
hour without replacing the cards; after its two-day period, the phone panel kept
its layout and reported Finished. Explicit refresh revealed the 34-listener town
memory and the newly eligible festival invitation. This resolves the observed
reflow gate above; it is not a blanket claim about every UI or input modality.
All 283 tests, TypeScript and production build pass. Large-bundle warning remains.
No captured browser warnings/errors; viewport restored and disposable tab closed.

Motion-consistency pass: a shared bounded decorative clock now reaches floor
reveals, character interpolation/poses, room details, neighborhood performers,
weather and fireworks. Pausing or hiding the page supplies zero visual seconds;
resuming cannot catch up a large frame gap. Rain/snow no longer recycle their
positions when a paused camera moves, and wet reflection phases stay fixed.
Initial paused weather still has a static particle field and correct cloud cover.
Reduced motion retains surface snow/wetness and actual arrival locations while
hiding precipitation and stopping decorative sway/bob. Walking limbs no longer
settle per frame while paused; normal settling is frame-time-based. Reduced-motion
toasts now omit animation instead of racing to the fade's invisible final frame,
leaving the normal three-second message lifetime intact. Six added tests cover
pause/visibility/invalid deltas, both precipitation types, reflection freezing,
live media-query changes, surface cues, concert guests and walking transforms.
Browser compared two later paused dusk-rain frames: the clock stayed at 18:31,
rain lines/reflections and residents remained still. Resuming to 1× advanced to
18:40 with new precipitation positions and real umbrella-wearing commuters.
No captured warnings/errors; disposable tab closed. All 289 tests, TypeScript
and production build pass. OS/browser reduced-motion switching and actual toast
readability under that preference remain runtime gates; unit media-query stubs
are not a substitute for those checks. The bundle warning also remains.

Fresh-town pacing pass: a measured fifteen-minute 1× run following the old
Right now cards built 48 residents and zero jobs. Guidance repeatedly asked
for apartments. Early goals now introduce missing food/shopping and employment
for actual unemployed neighbors, respecting population/zoning and showing a
specific saving gap when needed. Business goals choose the cheapest legal tower
for their priority. Build targets open normal subtype choices without purchase;
apartment targets expose/focus the existing build control. Shared towns cannot
invoke purchasing. Restored town/home population gates are now correct before
the first tick; goal eligibility uses actual town population even between frames.
Three seeded tests follow ordinary paid actions every thirty seconds, at half-
game-minute simulation steps, with no grants, fabricated residents or forced
mission completions. All three reached ten neighbors at ~8.5 real minutes,
served the first paid meal at 63–64 seconds, and finished fifteen minutes with
16 neighbors, 15 employed, 17–18 completed decisions and nonnegative funds.
There is still a roughly 3.5-minute saving stretch in this policy; these are
controlled trajectory checks, not proof of subjective engagement or all build
orders. An additional goal test covers service/job priority and render purity;
existing save/share tests caught and verified the population-gate fix.
Browser checked desktop and 390 × 844 shop-goal navigation: both opened the
three priced subtype choices with the same 18055-coin balance. The phone sheet
was readable and buying its 233-coin grocery option was a separate action,
leaving exactly 17822 coins. No captured warnings/errors; viewport reset and
disposable tab closed.
All 293 tests, TypeScript and production build pass; the large bundle remains.

Rendering-work pass: static, opaque procedural room details sharing a palette
material now merge within their existing parent before the first render. Named
controls, dynamic window/sign materials, imported assets and construction parent
boundaries stay separate. Retired owned geometries are disposed only when no
protected mesh in the room still uses them. Four tests cover transformed bounds,
triangle counts, ray hits, shadow flags, parent/control preservation, disposal,
idempotence and actual residential floor ownership. All 297 tests, TypeScript
and the production build pass. The large-bundle warning remains.

A DEV-only visible measurement panel counts all shadow/post-processing passes
and reports bounded frame/CPU samples and GPU resource counts. A DEV-only
unbatched switch permits comparison without altering a saved town. Comparable
paused three-tower landmark overviews measured 2826 versus 2168 draw calls
(about 23% fewer), and 1869 versus 1221 uploaded geometries. Textures stayed at
39. These were comparable views, not identical simulation snapshots or a pixel
equivalence test. Close-up inspection retained furnishings, room signs and warm
windows. Automated-browser frame intervals were approximately one second and
are not valid evidence of real-device frame-rate improvement. CPU timings are
diagnostic only, not a controlled benchmark. One hot-reloaded development tab
reported duplicate Three.js imports; a fresh tab had no captured warnings/errors.
All disposable measurement tabs were closed after inspection.
The instrumentation and bypass strings are absent from the production assets.
Real-phone/GPU timing and long-session resource behavior remain acceptance gates.

Winter-surface pass: snow now caps actual flat roof surfaces, parapets and
style-specific flat details, with sloping shoulders rather than a single floating
white sheet. One opaque instanced batch per roof follows the construction parent
and inherits current accumulation on style/height/shaft rebuilds. Entrance
canopies and promenade benches/lamp tops gain matching caps. Saved simulation
snow controls thickness and coverage; unchanged values do not reupload instance
matrices. Thawing hides the caps without allocating replacement geometry. The
existing ground, grove, park and curb snow remain coordinated with this value.
Roof rebuild cleanup now releases instance buffers as well as owned geometry
and material. Caps never add gameplay obstacles or change residents/saves.

Four new tests verify top alignment, footprint/height growth, invalid-value
handling, unchanged-update reuse, local coordinates under nested/translated
parents, construction/pause/reduced-motion continuity, rebuild disposal and
street-route clearance. All 301 tests, TypeScript and production build pass.
Desktop and 390 × 844 browser inspection showed snowy parapets/canopies and
furniture; switching the disposable preview to clear weather removed the snow
and restored green ground. This reset checks visual response, not accelerated
natural-thaw timing. No captured browser warnings/errors. Viewport restored and
preview tab closed. Browser skill guided visual checks; OS-level reduced motion,
real-phone performance and further close-up snow/foliage refinement remain open.

Connected-stair pass: the former same-direction flights reset their x coordinate
at every floor, while character y snapped ahead of horizontally eased motion.
Alternating flights now share a geometry/path definition, landings connect to
the room slab, and a slim outer handrail traces each flight. Stair characters
use full simulation-timed path positions, as street commuters do, instead of
independently easing one axis. Vertical travel contributes to the walking pose.
Small deterministic monotone cadence differences spread simultaneous departures
along the route while preserving exact departure and arrival times. This does
not change patience, stair duration, earnings, missed visits or the transit ledger;
it is not a pedestrian collision-avoidance simulation.

Four tests cover ascending/descending boundary continuity, tread/path alignment,
landing connection, pause/reduced-motion position updates, identity preservation
and cadence bounds/monotonicity/endpoints. The transit preview can now advance
normal simulation ticks to a real abandonment and then step quarter minutes.
Browser inspection initially exposed fully overlapping simultaneous stair users;
after cadence separation, the same rush showed distinct people along the first
and second flights. Further quarter-minute ticks showed continued ascent at
390 × 844. These are controlled paused snapshots of real journeys, not a
frame-rate or every-traffic-mix acceptance test. No captured browser warnings or
errors; viewport restored and disposable tab closed. All 305 tests, TypeScript
and production build pass. The large-bundle warning remains.

Individual-host pass: multiple Neighborhood hosts previously created overlapping
benches at one coordinate. Their dedications now occupy separate spots along
their home tower's side, sorted by resident identity rather than changing commute
array order. Each bench and its plaque select the actual resident through normal
scene picking. Name changes repaint the existing texture; removal releases the
complete owned dedication, including snow instance buffers. Seat/back snow follows
saved accumulation. Invitation/outcome text now explicitly states the existing
non-stacking +2 home-tower mood benefit. Charges and eligibility are unchanged.

The browser exposed another defect: separate benches extended beyond locked
tower framing. Tower, town and postcard bounds now include actual host scenery,
including rear rows and the camera-facing plaques. Framing cache keys track host
counts, while towns without hosts retain their original bounds. Four host tests
cover two normal paid dedications, detached save/compressed share reconstruction,
no repeated charges, non-stacking mood, order-stable placement, street-route
clearance, pointer picking, renaming, snow and complete removal. A further camera
test projects host bounds at six viewport sizes and multiple orbit angles.

DEV-only `/?preview=hosts` stages friendship history/age, discovers and pays for
two real dedications, and rebuilds from a detached save. Desktop browser checks
confirmed both plaques fit; clicking Maya's plaque opened her portrait, friends
and dedication memory. At 390 × 844, clicking the second plaque opened Noah's
corresponding story. Phone overview labels remain small; these clicks do not
prove ideal finger-target sizes or text readability. After the old preview
process disappeared, the local-only server was restarted and a fresh in-app
browser completed the checks. No captured game warnings/errors; viewport reset
and working preview tab closed. Cleanup of the earlier connection-error tab was
rejected by the browser's URL policy. All 310 tests, TypeScript and production build pass.
The large-bundle warning and wider real-device/long-session acceptance remain.

Readable-host-directory pass: tower lobbies now list their resident hosts as
large portrait buttons, sorted by name, alongside explicit shared/non-stacking
mood copy. Host profiles link back to this directory. Navigation transfers focus
to the inspector so keyboard users can continue through the new view; stale
resident cards refresh safely if the person has departed. Read-only visiting
mode exposes the same stories without edit controls or town mutations.

Four new tests cover membership, removal, ordering, escaped names, stale clicks,
correct profile/home navigation, focus transfer and visiting mode. The Browser
skill's 390 × 844 visual check confirmed readable names and large card targets;
selecting Noah opened his story. Tab/Return navigation returned to the lobby,
visibly focused Maya's card and opened her profile. This provides an alternative
to the still-small scenery labels, not evidence that those labels are now larger.
All 314 tests, TypeScript and production build pass. The bundle warning remains.

Landmark destination/night-lighting pass: built all three landmark kinds through
normal UI controls in the eligible development town (1200, 1500 and 2400 coins).
Ordinary lift journeys produced six conservatory, four gallery and one observatory
arrival by the first paused readout, with entertainment increasing from 45 to 70.
The study now has small-step simulation controls, a read-only visit report and a
link generated by the real compressed town encoder. Opening that link used the
normal visiting flow: all three landmarks and their history survived, visitors
continued arriving, and editing controls were absent. The visiting simulation
runs until paused; this was not a frozen, bit-for-bit rendered snapshot test.

The Browser skill's night inspection showed overly dark landmark displays.
Gallery picture bars, conservatory reading strips and low amber observatory
guides now accompany subtle warm material illumination. A shared daylight curve
drives them; real floor occupants brighten the room, while empty public floors
retain 22% guide lighting. Daylight switches the finishes off. No added Three.js
lights, shadow passes, scenery actors, purchases or visit credits. Five new tests
cover all three lighting styles, daylight/occupancy changes, independent materials,
pause-stable updates, complete material disposal/rebuild and readout purity.

Desktop and 390 × 844/320 × 704 checks exposed a separate visiting-banner overlap;
it now occupies the unused bottom dock with an unwrapped return button, clear of
speed controls and desktop HUD. Gallery lighting and observatory guides were
visually inspected after the change; conservatory guide lighting was inspected
on the phone with no occupants. Fine room props remain small in phone overview.
No captured browser warnings/errors; viewport restored and study tab closed.
All 319 tests, TypeScript and production build pass. Development readout/share
controls are absent from production. The bundle-size warning remains.

Room-exploration pass: the phone overview correctly fits the complete tower, but
that fit left individual room stories too small. Every floor inspector now offers
Explore this room, including visiting mode. The deliberate crop has zoom and
bounded left/right movement, screen-scale dragging and full-tower reset. Arrow
keys move across/between floors; plus/minus zoom; Escape resets from either the
scene or its controls. Camera bounds reserve space for the new controls and keep
the full overview/postcard framing unchanged. Leaving or changing towers resets
exploration. Navigation does not mutate simulation state or charge coins.

Picking now rejects cancelled/multi-touch gestures and any drag exceeding the
threshold, even if it returns to its starting point. Nine additional tests cover
crop fitting across six viewports, panning clamps, enlargement, resize continuity,
keyboard/reset/town transitions, non-mutating inspector entry in visiting mode,
and gesture-versus-tap behavior. Browser-skill checks at 390 × 844 and 320 × 704
confirmed larger café furnishings/residents, reachable zoom/pan controls, maximum
zoom disabling, keyboard horizontal/floor movement, Escape focus return and full
overview reset. A separate 1280 × 720 check confirmed desktop control clearance.
The café activity study stages resident activity; these checks concern camera/UI,
not arrival timing or natural traffic. No physical-device drag/pinch or FPS claim.
Captured browser logs were clear. Working tabs closed and viewport reset.
All 328 tests, TypeScript and production build pass; the bundle warning remains.

Opening milestone and pacing follow-up: first paid shop/restaurant arrivals now
earn one-time 60/90-coin mission rewards, with permanent journal memories and
the existing saved completion ledger preventing repeat payments. Waiting in a
queue, workers, unpaid visits and revenue in a different venue do not qualify.
The relevant opening mission becomes the visible session goal once its venue
exists; there are now 120 missions. Full homes before ten residents take priority
over optional renovations, while seriously neglected businesses remain urgent.
Housing guidance includes the actual price and saving shortfall.

The same three seeded, ordinary-purchase fifteen-minute runs now reach ten
neighbors at 4–4.5 minutes (previously ~8.5). Their largest purchase gap in the
first five minutes is 90 seconds, down from 180–210. They complete 18–20 paid
actions, finish with 16–20 neighbors and 14–16 employed, and retain nonnegative
funds. Visible-then-earned session milestones include daily income at ~6:40 and
~10:40, and tower/employment milestones at 9–10.5 minutes. Two seeds buy a second
shaft at 14–14.5 minutes; the third does not within fifteen minutes. Later gaps
still reach 90–150 seconds. These results establish controlled reachability,
not engagement for every build order or subjective playtesting acceptance.

Three new paid-arrival/save/share tests and an early-housing priority test cover
the change; an existing goal-order assertion now checks the new meal goal before
staffing. Browser-skill verification used `/?preview=opening`, an isolated normal
starting town with no staged funds/residents/rewards or save access. Normal UI
purchases and quarter-minute simulation steps produced actual café and shop
milestones, advanced the displayed goal to First Neighbors, and preserved both
named memories in the journal. At 390 × 844 the reward text wraps inside the
scrollable journal. No captured warnings/errors. This preview does not establish
real-time wall-clock pacing; the seeded simulation tests provide that evidence.
All 332 tests, TypeScript and production build pass. The main bundle is 898.71 kB
(251.01 kB gzip), and the existing large-chunk warning remains.

Return-to-town report pass: catch-up now snapshots at most three actual new
journal memories, with the town name, without including old memories or retaining
live references. The report distinguishes net losses from earnings, labels wait
samples honestly, explains the simulated-time cap and says completed rewards
are already received. It opens as a native modal dialog, with background controls
inert, headline autofocus, bounded scrolling and 44px actions. Read town journal
opens/focuses the actual journal; Back to town or Escape restores canvas focus.
The simulation and visual motion pause until dismissal (no zero-time ticks while
paused), and processed catch-up is saved before presenting its report.

Six additional core tests cover new/detached memories, malformed durations,
bounded direct catch-up calls and restored rewards/time. Four UI tests cover
negative balances, cap copy, escaped names/stories, autofocus and single-shot
dismissal routing. The isolated `/?preview=return` stages buildings but uses real
move-ins/trips, a detached save restore and actual catch-up, with no player save
access. Browser checks confirmed the clock/balance stayed at Day 2 14:00/1460
while the report remained open, then resumed after journal navigation. Checked
1280 × 720, 390 × 844 and 320 × 704 layouts, keyboard reachability and Escape.
The narrow layout initially scrolled to the autofocus button; heading autofocus
fixed it. No captured warnings/errors. All 342 tests, TypeScript and production
build pass; the main bundle remains large (~900 kB / 252 kB gzip).

Previously observed offline accuracy gap: catch-up advanced in
15-game-minute steps, but lifts perform one dispatch/move/load transition per
tick. The eight-resident return study reported 51–62 minute average waits.
This was strong evidence of timestep-induced congestion, not proof of a real
player transport problem. The following pass compares identical seeded restored
towns and addresses that cause; the report UI alone did not close the gate.
Ordinary browser storage reload/failure tests also remain distinct from the
detached persistence tests in this pass.

Offline accuracy/responsiveness pass: three identical restored eight-resident
towns (seeds 7/71/701) were compared at 0.1-, 0.25-, 0.5-, 1- and 15-minute
steps. Legacy 15-minute steps produced 51.9–56.7 minute mean waits and 51–54
happiness; quarter-minute steps produced 10.9–12.8 minute waits and 73–75
happiness. Quarter-minute results stayed within three wait minutes, two happiness
points and 25 coins of the 0.1-minute reference. The retained three-seed test
checks fine/quarter/legacy trajectories and the production catch-up result.

Catch-up now shares one quarter-minute simulation iterator between synchronous
tests and asynchronous startup. It checks its work budget every 32 ticks and
yields after eight batches or ~8 ms, whichever arrives first. One batch may
overrun that time target; it is not a real-device frame-time guarantee. UI shows
progress before work, remains modal, and supports an explicit early finish via
Return now or Escape. Its copy explains that unprocessed time is skipped. Only
actually simulated time/rewards reach the report/save. A saved original remains
untouched until processing completes or the player chooses early return.

New tests prove yielded/synchronous town snapshots and reward reports match,
progress stays monotonic with at most 64 simulated minutes per reported slice,
early return preserves only processed state, and both stop controls keep the
loading dialog present until work stops. The real full-cap regression simulates
216,000 game minutes with residents and finishes with finite economy/population.
It took ~25–26 seconds on this test machine, with over 3,300 progress updates.
This is not a claim about maximum-size towns or phone performance.

The Browser skill checked the normal four-minute return at 390 × 844: the live
town ended with ~12-minute waits and 71 happiness, and the report stayed paused.
A separate capped return showed a usable progress screen; clicking Return now
opened an honest partial report (1h 28m processed of 10h), retained eight
neighbors, and included real friendship/promotion memories. No captured console
warnings/errors. An uninterrupted browser cap run also completed at Day 151,
14:00 with eight neighbors, 70 happiness and ~11-minute current lift waits; it
showed the full-ten-hour report with 22 mission completions and real memories.
The displayed 18-minute peak was a sampled historical wait, not the current
average. Disposable browser tab closed and viewport reset after verification.
All 350 tests, TypeScript and production build pass; the bundle
is ~902 kB / 252 kB gzip and the existing chunk warning remains. Large-town and
real-phone catch-up performance, ordinary browser storage failure/reload, and
long-term economic balance remain acceptance work.

Resident recognition follow-up: the capped-run friendship audit checks canonical
resident-ID pairs and found no repeated friendship event for the same pair.
Repeated-looking journal titles came from different residents sharing a small
name pool. Ordinary new arrivals now resolve name collisions across the whole
living population, including commuters in other towers. Selection uses no extra
random draws: schedules, traits and economic trajectories stay unchanged. Names
remain short first names while available, then first/family combinations; an
extreme-size numeric fallback prevents exhaustion. Saved and shared residents
are never silently renamed, even if an old town contains duplicate names.

The directory now adds escaped home-tower/floor context, wraps long labels and
uses left-aligned cards with a 48px minimum hit area. Four core tests cover a
256-person naming pool, no additional randomness, commuters, new arrivals after
save/share restoration, and preservation of old duplicate names. Two owner/visitor
UI cases verify escaped home context and correct resident-ID navigation without
mutation. All three seeded pacing trajectories remain unchanged. A Browser-skill
check in the isolated return study confirmed eight distinct live names, readable
portrait/trait/home cards at 390 × 844 and correct profile navigation from Pia’s
card. No captured console warnings/errors. All 356 tests, TypeScript and build
pass; the main bundle remains ~903 kB / 253 kB gzip. Existing duplicate saved
names are preserved intentionally; identical roommates can still share display
names, so portrait/context remain important rather than pretending to migrate
their historical identities.

Construction-to-life handoff: separate resident, pet, steam, queue and lift
renderers now consult the floor renderer's actual reveal readiness. They cannot
float above a not-yet-finished room, and hidden residents/pets cannot be picked.
Positions and the simulation continue normally; there is no delay to hiring,
journeys, visits or income. Reduced-motion rooms are ready immediately. Three
additional tests cover both motion modes, paused reveals, completed reveals,
stair users and riding cabs, and unchanged resident/car/economy state. All nine
construction tests pass.

The disposable construction study exposes the actual reduced-motion preference
and can advance to the next 10:00 workday through quarter-minute simulation
ticks. Browser inspection confirmed reduced motion is currently requested; the
finished café correctly appears immediately while paused. In a fresh run, a
normal café purchase followed by workday advancement produced two real servers.
The inspector showed Coffee Shop, staff 2/3, zero morning visits and 95 coins of
expenses, rather than invented opening sales. At 390 × 844, room zoom/pan worked,
and tapping Rio's visible model opened the correct AT WORK profile, workplace
and first-job memory. The town remained paused at Day 12, 10:00. No captured
console warnings/errors. This does not verify normal-motion browser phases,
subjective sound, physical-device gestures or real-phone frame rate.

Business identity follow-up: all thirteen business subtypes now generate names
suited to their actual rooms, including coffee, nightlife, grocery, fashion, law
and circuit fabrication. The resolved default subtype also drives naming.
Generation still consumes exactly two random draws, preserving subsequent
simulation randomness. Existing generic callers retain their behavior; saved,
shared, legacy and player-edited names are never rewritten. Sixteen new tests
cover every pool's variety, trade-specific endings and 30-character limit,
default subtypes, invalid type/subtype fallback, random draws and save/share
round-trips. All three opening pacing trajectories remain unchanged. Browser
inspection showed Little Lantern Café on the room sign, inspector, Rio's job
and career memory. All 375 tests, TypeScript and production build pass; the main
bundle is 905.56 kB / 253.45 kB gzip, with the existing chunk-size warning.

Resident feedback follow-up: a happy worker with the ordinary full-apartment
housing score (60) no longer repeats a crowding complaint. Read-only thoughts
rank actionable concerns in happiness points, retain the real move-out warning,
distinguish a home-tower average wait from an individual's wait, and describe
commute minutes as the base street route rather than a weather-adjusted ETA.
Blocked-career copy no longer asserts that every senior position is still full.
When no concern takes priority, thoughts can name a real current workplace,
meal or landmark, a household pet while actually at home, or an established
friend physically sharing that room/activity. No new friendship, story, job,
reward, random draw or resident movement is created by reading a profile.

Profile help buttons navigate to the relevant home-lift panel, workplace or
wellbeing report without spending, including in read-only shared towns. They
re-resolve the resident and concern on activation, safely handling changed jobs,
resolved concerns and departures. Keyboard focus stays in the destination panel.
The existing weakest-factor label now compares weighted need deficits and travel
penalties on the same scale and receives the resident's actual travel penalties.
Daily happiness and diagnostics share one travel calculation; this fixes the
Happiness panel's previously overstated commute penalty when either home or
workplace is transit-zoned, without changing the simulation formula.

Copy now distinguishes daily happiness/recorded needs from current travel
conditions. Housing advice does not imply that new apartments relocate existing
households; meal/leisure advice includes staffing and access, and lift advice
asks the player to compare real outcomes. Sixteen added tests cover all four
home/work transit combinations against the actual daily score, weighted ranking,
read-only thoughts, happy full homes, stronger food concerns, relief, career
wording, grounded friend/pet presence, owner/visitor navigation, stale actions,
escaped names and honest timing/housing explanations. All three opening pacing
trajectories and the full-cap offline result remain unchanged.

Using the Browser skill at 390 × 844, Ava's measured 67-minute home-tower wait
linked to Crossroads House's real lift history (42 stair abandonments, 28 missed
visits in the disposable stress study) and normal upgrade controls. Coins stayed
15012; navigation did not purchase anything. A separate normally purchased café
and simulated workday produced Cleo at work in Copper Kettle Coffee House with
77 happiness and the new on-shift thought, readable on desktop and phone width.
No captured console warnings/errors; the disposable tab was closed and viewport
reset. All 391 tests, TypeScript, diff whitespace check and build pass. Main
bundle: 909.24 kB / 254.91 kB gzip; existing chunk-size warning remains. Actual
OS motion switching, audio listening and physical-phone performance remain open.

Full-motion construction acceptance follow-up: the isolated development study
now provides explicit system/full/reduced opening modes. Only the floor reveal
can be overridden, only in development; actors, weather and other effects retain
the real system preference. Production ignores even an explicitly supplied
override. Returning to reduced motion immediately completes the reveal, including
the study readout; returning to full does not replay it. Three renderer tests and
one development-control test cover these boundaries, pause, and new-floor reset.

Browser-skill inspection ran with the actual system still requesting reduced
motion. A normal Juniper Coffee purchase using the development full-motion
override showed bare structure at 0.35 seconds, furnishings at 1.00, the sign
phase at 1.70 and completion at 2.20. Roof and facade stayed aligned; people were
absent during the reveal. Ordinary next-workday simulation then produced Ava
and Juno as two of three staff, verified in the actual room inspector. Desktop
and 390 × 844 compositions were inspected, but the overview sign was too small
to establish close-up phone readability.

A second normal purchase, Wren & Willow Wardrobe, was held at its structure
phase, paused, and switched back to the system preference. Its furnished room,
sign and real staff appeared immediately without advancing the clock or coins.
Full-motion openings of Meridian Technologies and Bright Circuit Microdevices
also completed with their real workers, subtype-specific furniture and aligned
envelopes. No captured console warnings/errors; the tab was closed and viewport
reset. This verifies four examples, not all thirteen subtypes, and does not
establish physical-touch performance, actual OS preference switching or sound
quality. The final development-only readout correction was unit-tested after
the visual pass rather than presented as a second browser run.

All 395 tests across 60 files, TypeScript and production build pass. The full
ten-hour offline cap still yields 149747 coins with eight residents; the build
retains its existing large-chunk warning. Development study labels and the
override accessor are absent from production assets. The close-ups identified
cone-shaped indoor plants as a concrete next target for more natural room art.

Indoor greenery follow-up: procedural lobby, restaurant and office plants now
have tapered terracotta pots, a rounded rim, visible soil, slender stems and
curved, folded leaf blades in two muted greens. Leaf orientation varies
deterministically by floor/location. Small and large plants remain below 1.3
and 2.05 world units respectively, fitting under the three-unit room ceiling.
They use five opaque draw batches and fewer than 1,000 triangles each, with no
extra lights, shadow-casting furniture, actors or animation. Imported furniture
still takes the existing replacement path. Resources are owned by the floor and
released on rebuild; the greenery inherits the actual furnishings reveal.

Four new tests cover both sizes' geometry, normals, finite positions, bounds,
draw/triangle budgets, deterministic variation, construction visibility, unchanged
floor/economy state and exactly-once geometry/material disposal on subtype rebuild.
The Browser skill was used to inspect daylight café/lobby silhouettes, a close
technology-office view, and the café at dusk in 390 × 844 room exploration. Leaves
read as foliage rather than stacked cones; the small office plant remains behind
the meeting area. These checks used the isolated staged room study, not a claim
about naturally occurring staffing or gameplay balance. No captured console
warnings/errors; browser tab closed and viewport reset. Physical-device FPS,
touch gestures and subjective sound remain unverified. All 399 tests, TypeScript,
production build and whitespace checks pass; the existing large-chunk warning
remains (910.53 kB JS, 255.47 kB gzip).

Technology-office sightline follow-up: moved the two tall server cabinets from
the front of the office into a compact back-wall equipment area between the
desks and meeting corner. Added cabinet rails, ventilation slots and small green
status indicators without extra lights. All equipment remains inside the room
envelope, below two units tall and behind z=-1.9, with three opaque static batches
and fewer than 1,000 triangles. Existing desk, meeting and resident coordinates,
simulation, economics and saved floor data are unchanged.

Four new tests cover geometry/batching budgets, clearance from desk and meeting
footprints, rays from three front-facing camera directions to all four worker
poses at both meeting and typing times, no resident-state mutation, reuse,
subtype-rebuild disposal and normal save-data reconstruction. Construction and
earned-startup-interior regressions remain green. Browser-skill checks in the
isolated room study confirmed all three occupied desks are visible at 1280 × 720
and 390 × 844 after live movement settled, and selecting Juno's visible head
opens the correct profile on both sizes. A phone-width click on the desk/body
instead selected the room; small-model selection still needs an ergonomic
alternative such as tappable staff names in the floor panel. This was not a
physical-phone or live-meeting animation acceptance test. No captured console
warnings/errors; tab closed and viewport reset. All 403 tests across 62 files,
TypeScript, whitespace checks and production build pass. Existing main-chunk
warning remains: 910.84 kB JS / 255.63 kB gzip.

Floor-to-person navigation follow-up: business staff, apartment households and
present landmark visitors now have named portrait buttons with explicit inspect
labels, visible arrows, focus outlines and at least 56-pixel card heights. Staff
remain assigned regardless of physical location; current status is shown rather
than implying they are all at work. Household cards similarly distinguish living
there from being home. Cards sort by name and stable ID without changing the
underlying array, and names/status text are escaped.

Opening a roster profile retains the current camera context, including for
commuters, and exposes a 44-pixel-minimum Back button to the originating floor.
Keyboard focus moves into the profile and back into the floor panel. The origin
is cleared on unrelated navigation. Revalidation handles changed jobs/homes,
departures, removed return floors and stale controls from a different selection.
All actions remain available in visiting mode without spending or mutating town
data. Five new tests cover these behaviors, duplicate names and escaped labels,
actual landmark presence and empty lists; the host/navigation suite has 18 tests.

Browser-skill verification at 390 × 844 showed all three Firefly Studio staff
cards, Juno's correct profile and return destination. Tab/Enter worked through
the return button and staff card; clock (12:13) and coins (17248) stayed unchanged
while paused. The four-person Meadow Flats household opened Maya's workplace
story and returned to the correct apartment. At 320 × 720 the roster scrolls;
the last Otis card remained reachable and opened his profile. No captured console
warnings/errors. These were isolated room-study UI checks, not physical-phone
gesture tests or a runtime shared-town check. The tab was closed and viewport
reset. All 408 tests, TypeScript, whitespace check and production build pass.
Existing chunk warning remains: 912.56 kB main JS / 256.08 kB gzip; CSS 21.65 kB
/ 5.56 kB gzip. The wider gameplay, visual, audio and device acceptance gates
below remain open.

Save-protection follow-up: core writes now return success/failure rather than
silently swallowing errors, including a denied localStorage getter. Read results
distinguish empty, loaded, unavailable and invalid; malformed/unsupported records
are not silently replaced by an autosaving fresh town. Startup requires Retry or
an explicit temporary-session choice. Temporary sessions have no autosave,
player-settings writes, gifts or save reset, preserving the original stored town.
Escape does not choose a load-recovery action. SaveSession supplies a common
write gate and disables writes after successful reset, fixing the unload handler
that could otherwise resurrect the town immediately after New town cleared it.
Failed resets leave the town open and saveable. Pagehide/hidden-page transitions
also attempt a normal guarded save.

Failed writes expose a persistent warning and native modal with retry and JSON
backup export; an actual successful write clears the warning and updates the
dialog title/status. The simulation pauses while these options are open. Backup
copy explicitly says restoration currently needs manual assistance, and reports
only that a download was requested, not that the browser completed it. Ten added
core tests cover denied/quota storage, original-snapshot preservation and retry,
invalid records, protected sessions and reset/unload safety. Five UI tests cover
warning persistence/recovery, protected controls, explicit load choices, Escape,
detached export contents and download-URL cleanup.

Browser-skill checks at 390 × 844 used the isolated saving study's in-memory
storage, never player storage. A failed write retained the 0-resident/3000-coin
snapshot while the running town had 1 resident/3320 coins. Failed retry remained
visible; allowing writes and retrying produced a 1-resident/3320-coin snapshot
and cleared the warning. Clock stayed 09:51 throughout the open failed-save
dialog, then resumed on closing. The load dialog survived Escape and accepted
both explicit choices in separate study runs. No captured warnings/errors; tab
closed and viewport reset. All 423 tests, TypeScript, production build and
whitespace checks pass; study labels are absent from production assets. Main
bundle is 918.15 kB / 257.80 kB gzip, with the existing chunk warning. Actual
browser-storage reload, independent backup download inspection/restoration and
gift-save failure handling remain separate acceptance work; this study does not
prove those paths.

Gift-persistence follow-up: sends and redemptions now update the wallet and gift
metadata through a single synchronous save-key write. A failed send restores its
deduction and returns no code; a failed redemption restores both coins and daily
income without consuming the nonce. Successful sends persist a private outbox of
the last twenty codes, available when Friends reopens or the town reloads. Gift
replays check the town's committed nonce list and the legacy device ledger;
inaccessible or malformed legacy ledgers prevent redemption rather than granting
unchecked coins. Before New town clears a saved wallet, its committed nonces are
copied to the device ledger; a failed copy aborts the reset. Both lists retain
the existing latest-500 redemption bound. This is local durability/replay
protection, not server authentication or multi-tab transaction coordination.

Gift metadata defaults safely in old saves and is detached in normal snapshots.
Read-only visit codes omit the private outbox and redemption IDs. Amount/nonce
validation rejects non-integer, unsafe and partially parsed amounts, invalid
nonces and oversized codes. Player-name storage access is caught inside the
guarded helpers. Friends and invitation acceptance both report failure inline,
stay open for retry, and report write outcomes to the persistent save warning.
Saved outbox textareas have explicit accessible labels.

Eighteen new tests verify one-write commits, balance/income rollback, retry,
before/after-load replay rejection, legacy/reset preservation and failed reset,
denied storage access, old/malformed metadata, privacy of visit codes, outbox
bounds and invalid/insufficient amounts. All 441 tests across 64 files, TypeScript,
production build and whitespace checks pass. The main bundle is 920.83 kB /
258.65 kB gzip; its existing large-chunk warning remains.

Browser-skill verification at 390 × 844 used only disposable memory/test codes.
Failed invitation acceptance and failed Friends sending both left 3120 coins
unchanged; no send code was created. After allowing writes, sending 250 produced
2870 coins and a code that remained identical when Friends reopened. Accepting
the test invitation restored the balance to 3120, with the saved snapshot showing
one sent and one redeemed gift. Repeating acceptance reported already redeemed
and did not alter the balance. Time stayed paused at 09:08 during the checks.
No captured warnings/errors; the tab was closed and viewport reset. Test-only
gift labels/nonces are absent from production assets. Actual browser-storage
reload, independent backup restoration, multi-tab behavior and full social-dialog
keyboard/accessibility acceptance remain unverified.

Social-dialog follow-up: Friends and gift invitations now use named native modal
dialogs. The heading receives initial focus, background game controls are inert,
Escape closes without redeeming, and focus returns to the connected opener (or
the scene if it was removed). Both simulation and scene motion pause while a
social dialog is open, resuming the selected speed when closed. A fixed header
keeps its 44-pixel close button outside the scrolling body; inputs have explicit
accessible names and visible keyboard focus. A failed modal opening cleans up
its pause registration. Existing gift transactions and retry behavior remain.

Six new tests cover dialog lifecycle/focus, disconnected opener, protected preview
controls, failed/successful gift acceptance, Escape cancellation and failed native
opening. All 447 tests across 65 files pass; TypeScript and production build pass.
Browser-skill checks at 390 × 844 and 320 × 720 confirmed that only modal controls
appear in the accessibility tree, Tab reaches every field and returns to Close,
and Escape restores the opener. The live clock held at 08:00 throughout Friends,
then resumed; the gift invitation held at 09:38 and Escape resumed it at 09:39
with 3320 coins unchanged and zero saved redemptions. The narrow-screen screenshot
caught inherited inspector positioning on Close; it now sits at the header's
upper right and remains visible while the body scrolls. No captured console
warnings/errors. These checks used disposable memory, not player storage, and do
not prove actual screen-reader output, phone touch/keyboard behavior, browser-save
reload, multi-tab safety or independent backup restoration. The bundle warning
remains at 921.84 kB JS / 258.97 kB gzip.

Restaurant-interior follow-up: replaced the generic dining room plus disconnected
front props with four coherent, owned procedural interiors. Coffee houses have
planked floors, slatted cabinetry, an espresso machine, grinder and ceramic cups;
diners have checker tile, red seats, trays and a working-range silhouette; fine
dining has supported linen drops, place settings and framed art; lounges have
upholstery, stools, bottles and a brass foot rail. Low kitchen cabinetry, tiled
splashbacks, sinks/ranges and shallow shelves replace the large dark blocks.
Seat backs now face away from their tables, consistent with seated residents.
Independent table jitter could overlap neighboring chair backs: the whole dining
arrangement now shifts together through one shared core/render coordinate helper.
No purchase, visit, career or economy rules changed.

Pendant undersides, candles and range task strips use owned emissive materials,
warming occupied rooms at night and dimming empty rooms, with no additional
scene lights. Floor caches update and retire these materials on subtype and shaft
rebuilds. Per-style geometry stays within the room envelope, at most 32 opaque
meshes including the compound plant and fewer than 6000 triangles. This is a
bounded asset budget, not a real-device FPS benchmark.

Twelve new tests cover all four styles' geometry/budgets, nine real worker/guest
poses per style, unobstructed face sightlines at three camera angles, seating
surfaces, chair-back clearance across 100 floor levels, construction visibility,
unchanged saved simulation state, stable reuse, exactly-once resource disposal,
all-style save reconstruction and occupied/empty/day/night fixture lighting.
The room study now exposes all restaurant styles and fixes its earlier overfilled
staff assignments (including career-tier capacities). Browser-skill checks saw
coffee/diner close-ups at 1280 × 900, fine dining at 390 × 844, and the lounge
through dusk/night at phone width. Workers were allowed to reach new stations
after subtype changes; pausing correctly freezes that travel too. Real roster
buttons reported 3/3 staff. No captured browser warnings/errors. The study is
disposable, and its new controls are absent from production. Full-motion gesture
acceptance, physical-phone performance, new-art ordinary browser-save reload,
and all earned restaurant-variant combinations still need runtime checks.

All 459 tests across 66 files, TypeScript, production build and whitespace checks
pass. Main JS is 926.40 kB / 260.86 kB gzip; the existing chunk warning remains.

Restaurant-career follow-up: restaurant work staging previously gave the first
resident by ID the Chef pose regardless of actual job tier. Physically present
promoted Chefs now lead hot kitchens, while a Server can cover cooking without
the senior hat. Other workers carry a plate tray. Café/lounge counter service
prefers a Server when a Chef is present; the Chef prepares at the back counter,
or covers the front alone if no Server is there. Only a real tier-one restaurant
worker wears the hat. Position/role selection stays deterministic under resident
array reordering; absent staff and stale workplace/activity references are not
staged. Steam also rejects mismatched activity-floor references. Existing actors
and accessories are reused, hidden on leaving work and disposed on removal.

Paid promotions now commit the resident's career memory before the edit's save,
including while paused. The previous minute-sampled path could lose that memory
if the promoted town was saved and restored before the next sample. Updating the
story baseline at the same time prevents duplicate memories on subsequent ticks;
ordinary day-review promotions retain their existing sampled story path.

Ten new core tests cover all four restaurant styles, paid and automatic
promotions, absent/stale staff, solo counter cover, insufficient coins, immediate
save/restore and non-duplication. A new render test proves the same two actors
exchange stove/tray roles, only the promoted actor gets the hat, and owned GPU
resources are released exactly once. The disposable room study stages tenure and
presence, not a promotion: the ordinary inspector action still checks eligibility
and spends coins. Its controls and instructions are absent from production.

Browser-skill acceptance at 1280 × 900: Juniper Table showed Maya and Fern as
Servers, with the normal 220-coin Promote action enabled. While paused at 17:10,
the action changed 18882 coins to 18662, left daily income/time unchanged, changed
only Fern to Chef and disabled further promotion. Her profile immediately showed
one new promotion memory. After resuming, the Chef hat moved to the stove worker;
clicking that character opened Fern's profile. At 390 × 844 the story remained
readable by scrolling, with the close control reachable. No captured warnings or
errors. These are isolated development-town checks, not an ordinary browser-save
reload or a full-motion/physical-phone performance claim.

All 470 tests across 67 files, TypeScript, production build and whitespace checks
pass. Main JS is 927.35 kB / 261.18 kB gzip; the existing chunk warning remains.

Compact-goal follow-up: the collapsed journal now exposes the live immediate
goal as a direct navigation button, with a separate goal-count disclosure for
all three horizons and optional invitations. It opens choices rather than
spending. The persistent button retains focus as the goal changes; expanded
cards retain focus by identity, with a visible toggle fallback if a goal
disappears. Phone card navigation and desktop-to-phone collapse never leave
focus inside hidden goals, and navigation that already focused its destination
keeps that focus. Footer actions have a minimum 44-pixel height.

The browser check also caught an existing mismatch: before the first resident
arrived, "Meet the people moving in" opened another apartment purchase. The
goal now explains that homes are ready, mentions resuming at 1× if paused, and
opens the actual waiting apartment. Once a resident exists, it links to them.
Nine new journal interaction tests plus a core goal regression cover the change.

Browser-skill checks used the disposable opening study at 390 × 844 and
320 × 720, plus the expanded desktop default at 1280 × 900. Opening the build
suggestion left 300 coins unchanged; buying the 100-coin apartment left 200 and
updated the compact title immediately. Following the corrected arrival goal
opened the zero-of-four household panel with no extra charge. Keyboard activation
of an expanded goal collapsed the phone rail and returned focus to its visible
toggle; navigation to build choices instead retained the purchase-button focus.
Resizing a desktop-focused card to phone width also restored focus to the
collapsed toggle. No browser warnings or errors were captured.
The smaller screen scrolls expanded goals; the development overlay is visible
in the study but excluded from production. These checks do not establish
physical-phone touch performance, ordinary saved-game persistence or engagement.

All 480 tests across 68 files, TypeScript and the production build pass. Main JS
is 929.11 kB / 261.64 kB gzip; CSS is 23.49 kB / 5.95 kB gzip. The existing large
chunk warning remains. The eight-area objective is still open.

Retail-interior follow-up: replaced the shared shop furniture plus supplemental
front props with three coherent procedural interiors. Grocery stores have tiled
floors, low wooden produce bins, rounded fruit, price markers and labeled rear
stock. Boutiques have plank floors, folded clothing tables, rear hanging garments
and a framed fitting-room mirror silhouette. Electronics shops have boxed-device
showcases and laptop demo tables; their centers now share the actual shopper
coordinates with core staging. Checkout counters/registers follow the real
cashier/customer locations. The previous tall front clothing rail is gone, so
it no longer cuts across staff sightlines. No simulation/economy rules changed.

Each retail set owns its geometry/materials, uses at most 30 opaque batches and
fewer than 7500 triangles, and adds no scene lights or scenery actors. Track-light
lenses use an owned emissive material: occupied at night 0.65, empty 0.04, daytime
zero. Shop lighting caches follow subtype and second-shaft rebuilds. Eight new
tests cover all three bounds/budgets, finite geometry, eight real resident poses
per style at browsing and checkout, face sightlines from three camera angles,
waist clearance, aligned checkout/demo furniture, construction hiding/reveal,
stable reuse, unchanged saved town state, subtype save reconstruction, exactly-once
resource disposal and occupied/empty/day/night lighting with cache retirement.

Browser-skill checks used the isolated trade study: grocery room close-up and
boutique overview at 1280 × 900, boutique and night electronics room exploration
at 390 × 844. The electronics close-up used the normal zoom controls. A picked
shopper opened Fern's real profile; the floor panel reported its two assigned
staff and actual current activities. The study now includes day/dusk/night
controls, absent from production. No captured browser warnings/errors. These
are composition checks, not proof of full-motion gestures (system reduced-motion
is enabled), physical-phone performance, ordinary saved-game reload or every
earned storefront combination.

All 488 tests across 69 files, TypeScript and production build pass. Main JS is
932.23 kB / 262.99 kB gzip, CSS 23.49 kB / 5.95 kB gzip. The large-chunk warning
remains. The full eight-area objective remains active.

Factory-interior follow-up: replaced the shared conveyor/crate/drum room and
supplemental subtype props with three complete procedural workshops. Assembly
has wood-topped benches, vises, sorted parts, a rear roller line and hanging
tools. Food processing has rounded stainless vats, front valves/control panels,
connected overhead pipes, a packaging line and tiled drainage. Electronics
fabrication has open-front extraction hoods, circuit boards/components, test
cabinets and anti-static work mats. Their stations use the existing core worker
coordinates, and the foreman aisle plus both lift waiting lanes stay clear.
There are no added actors, production payouts or simulation-rule changes.

Each set owns its geometry/materials, stays below 6500 triangles and at most
30 opaque meshes, and adds no scene lights. Task-light lenses brighten in
occupied rooms after dark and dim when empty; caches retire with subtype and
second-shaft rebuilds. Eight new tests cover all three geometry/budget bounds,
finite vertices/normals, four real worker poses, face sightlines from three
angles, vertical body/lift-lane clearance, equipment at each actual workstation,
construction hiding/reveal, stable reuse, unchanged saved state, all-style save
reconstruction, exactly-once disposal and day/night/empty lighting cache behavior.

Browser-skill checks in the isolated trade study covered assembly and food
processing at 1280 × 900 and electronics fabrication at 390 × 844 with normal
room zoom controls. A food-processing close-up exposed overly metallic vats
reading nearly black under the cutaway shadow. A brighter, diffuse-biased brushed
finish corrected that; the follow-up cloudy daytime view keeps the vessels
readable. The phone electronics view showed all four staff in clear positions
at 11:03 and the naturally empty factory at 20:53. No captured warnings/errors.
These are composition/lifecycle checks, not full-motion acceptance (the system
reduced-motion preference remains enabled), physical-phone performance or an
ordinary saved-game reload. The browser viewport was restored after the study.

All 496 tests across 70 files passed; after the steel correction, 17 focused
factory/gesture/lighting tests, TypeScript and production build also passed.
Main JS is 935.50 kB / 264.12 kB gzip; CSS remains 23.49 kB / 5.95 kB gzip.
The existing large-chunk warning remains. The full objective is still active.

Office-interior follow-up: replaced shared office furniture and front-row trade
props with three coherent interiors. Tech retains the verified rear server
alcove; law has wood desks, case files and a reference library; creative has
material boards, swatches and sample storage. Three seated desks now share one
row offset so their surfaces cannot overlap at different floor levels. A fourth
standing workstation accommodates the normal four-worker staff without stacking
two people at one desk. The existing two-person meeting corner has matching
chairs; no extra actors, wages or career slots were added.

Founders' archives and innovation prototypes moved to the rear center, and the
innovation project chart now sits behind the meeting area. All four worker faces
remain clear in the geometry tests at ordinary work and both meeting times, from
three camera directions. Each office owns its resources, adds no scene lights,
and stays within 34 opaque meshes and 6500 triangles. Pendant lenses respond to
actual occupancy and daylight; subtype/shaft rebuilds retire the old lighting
cache. Twelve new tests cover these budgets, chair/desk alignment, shared desk
spacing across 100 levels, unchanged simulation/save state, construction reveal,
save reconstruction, exactly-once disposal, reward sightlines and all four
assigned workers in the isolated preview.

Browser-skill checks used the disposable room study, not player saves. At
1280 × 900, the law practice and founders' archive close-ups showed three seated
workers and one standing worker at separate stations. At 390 × 844, ordinary
room zoom controls revealed the creative studio's material boards and all four
workers. The innovation hub was inspected at dusk in tower view and at 20:22 in
desktop room exploration, then at 390 × 844 with the normal zoom buttons. The
rear prototypes and project board remained visible without covering workers.
No captured browser warnings/errors. The viewport was restored after checking.
These checks
verify composition, not normal reward acquisition, complete meeting gestures,
actual OS motion changes, physical-phone performance or ordinary save reload.

Fresh verification: TypeScript, all 508 tests across 71 files, and the production
build pass. Main JS is 938.26 kB / 265.07 kB gzip; CSS is 23.49 kB / 5.95 kB gzip.
The office-study controls are absent from generated assets; diff whitespace
checks pass.
The large-chunk warning remains. The full objective remains active.

Home-life follow-up: replaced the old two-bed/four-resident furniture with a
four-bed shared home, matched reading seats, wood floorboards and a bordered rug,
small kitchenette, bookshelf, framed keepsakes, bedside lamps and board-game
table. Fabric colors vary deterministically by floor. All four cat-window
sightlines remain clear. Home interiors own their resources and use at most 42
opaque meshes and fewer than 7000 triangles; no lights or actors are added.

Residents now lie face-up in actual beds after their own normal/night-owl
bedtimes. The same articulated resident is reused and remains pickable; the
book hides while resting, and pitch, roll and height reset before waking or
travel. Seat/bed assignment uses the full home household, including commuters
currently in another tower, so those staying home do not shuffle when someone
leaves. This is presentation only: capacity, rent, jobs, schedules, needs and
simulation transactions are unchanged. Actual present home activity determines
bedside-lamp brightness; sleeping-only homes dim but an awake night owl keeps
reading light. Lighting caches retire with the shaft/floor rebuild lifecycle.

Eight new tests cover absent-housemate stability, reordered inputs, save
reconstruction, personal bedtimes and false home activities, all four seat and
mattress surfaces, three-angle face sightlines, actual reclining actor bounds,
pause/reduced-motion poses, wake-up and commute cleanup, geometry budgets,
cat-window visibility, exact disposal, home/empty/night-owl lighting,
construction hiding/reuse and isolated preview staging. The existing batching
regression now inspects nested batches and actual mesh counts rather than
requiring them to be direct children of the furniture reveal group.

Browser-skill evidence: the isolated home study at 1280 × 900 showed all four
daytime readers in separate seats. A 23:39 view showed three resting neighbors
and one night owl still reading. That close-up exposed a floating-looking
side-resting silhouette; the corrected face-up pose and lower pillow were then
checked at 04:12 with all four neighbors on their mattresses. At 390 × 844,
normal room-zoom controls kept all four sleepers readable, and tapping a sleeping
neighbor opened Dex's actual profile. Returning to daytime cleared reclining;
after the staged home visit expired, the remaining reader kept their own seat
while housemates left. No captured warnings/errors; the tab was closed and
viewport restored. These checks do not prove physical-phone performance, normal
overnight scheduling, ordinary browser persistence or real OS-motion toggling.

All 516 tests across 72 files, TypeScript and production build pass. Current main JS is 941.27 kB / 266.14 kB
gzip, CSS 23.49 kB / 5.95 kB gzip; the large-chunk warning remains. Development
household/clock controls are absent from generated assets and diff whitespace
checks pass. The full objective remains active.

Milestone-wall follow-up: every one of the 120 known missions adds one permanent
colored enamel tile to a brass-framed display in the founding tower's lobby.
The display reconstructs directly from saved mission completions, including
shared towns; it introduces no second ledger, extra charges, or duplicate payout.
Five color families distinguish neighbors, careers, trade, journeys and places.
Missions and the founding lobby provide a readable grouped record and an ordinary
room-exploration link. Following a session goal keeps that goal above the wall
panel, so the new reward display does not bury the player's immediate ambition.
The disclosure has a 44px target and a singular label for the first milestone.

The three-mesh display uses one instanced tile mesh (under 1600 triangles with
all missions), no extra actors or lights, and unchanged completions do not
rewrite GPU buffers. Existing floor ownership handles reveal, picking and
exactly-once geometry/material/instance disposal. Seven render tests and four UI
tests cover catalog coverage, actual one-time mission earnings, save/share
reconstruction, bounds, update/reset, finite night glow and shaft rebuilds.
Two inspector integration cases cover normal and read-only exploration without
economy or completion changes. Existing selected-goal tests also check that the
selected mission precedes the wall and appears only once.

Browser inspection exposed the original display's top row behind the lobby slab.
The lowered panel was verified with a real earned Content milestone after an
ordinary apartment purchase and two real move-ins in the disposable opening
study. The tile is visible at 1280 x 720 and 390 x 844. The phone management route,
expanded readable Content record, return to lobby, and selected First Neighbors
goal placement were inspected through actual controls. New raycast tests cover
all 120 tile centers through the actual two-floor lobby geometry, furniture,
canopy and sign, with three architecture styles, either lift layout and 1280,
390 and 320px framing. This is not proof for all camera pans or future geometry.

An earlier disposable browser tab had crashed; its cause was not established.
This fresh tab completed the repeated checks with no captured warnings/errors,
but that does not establish long-session stability or resolve the earlier crash.
Player storage was not accessed. Full-catalog earned gameplay, browser-storage
reload, night appearance and physical-phone performance remain broader checks.

All 529 tests across 74 files passed after the sightline and disclosure fixes;
after the final selected-goal ordering change, 27 focused UI/integration tests,
TypeScript, production build and diff whitespace checks pass. Current main JS
is 944.84 kB / 267.44 kB gzip, CSS 23.62 kB / 5.98 kB gzip. The large-chunk warning
remains. The full eight-part objective remains active.

Real-browser persistence follow-up: added a development-only persistence study
with a lazy, allowlisted storage adapter. It maps the four known save versions
and gift ledger into a dedicated development namespace; it never enumerates,
reads, writes or clears the corresponding player keys. The main startup,
SaveSession, edit saves, autosave/unload, gift UI and reset all receive the same
adapter. Preview resets now remain in their preview instead of navigating into
the player's ordinary town. Production still uses default storage and excludes
the study module, namespace and controls from the generated bundle.

Seven new tests cover the normal empty starting state, real earned-mission save
round-trip, gift commit/reset isolation, retained gift redemption protection,
unload suppression after reset, narrowly scoped clear/enumeration, denied browser
access, invalid-save temporary-session protection and non-mutating summaries.
These tests explicitly retain sentinel player and unrelated values untouched.

Browser-skill evidence through the actual persistence-study UI:
- Purchased an apartment for 100 coins and advanced two ordinary 15-second steps.
  Saved 2 residents, 402 coins, 2 floors, one Content milestone and one arrival
  memory. A real reload reproduced those exact counts and the first enamel tile;
  Quinn's arrival memory remained in the journal.
- Purchased a grocery for 142 coins, then advanced one normal step. Reload
  preserved 3 residents, 269 coins, 3 floors, one milestone and two memories,
  including Quinn's Clerk job at Orchard Market. No duplicate 200-coin reward.
- Renamed town, district and founding tower using native input edits and blur.
  Edit-triggered saves and a subsequent reload retained Lantern Harbor, Copper
  Quarter and Copper House. Browser fill alone did not commit a native change;
  that automation limitation was distinguished from actual keyboard editing.
- No captured warnings/errors before the reset check. Clicking New town then
  stalled browser commands, apparently at its native confirmation dialog. Re-observation,
  Escape and closing the same tab also timed out; reset is NOT verified, no
  reset is claimed, and the user was asked to dismiss the pending confirmation.
  The development server was not restarted in response to observation timeouts.

The study has not yet verified the two-minute real-away catch-up, PWA/network
offline reload, multi-tab conflicts, ordinary player-origin permissions, browser
restart, landmark/event save lifecycle or downloaded JSON restoration. Its
frozen comparison mode does not prove normal long-running simulation stability.
The stored test town is disposable and separate from player progress.

All 536 tests across 75 files, TypeScript and production build pass. Current
main JS is 944.91 kB / 267.45 kB gzip; CSS 23.62 kB / 5.98 kB gzip. The existing
large-chunk warning remains. No commit, push or deployment. Full goal still active.

Exterior rendering follow-up (2026-09-17): batch opaque facade trim within each
floor and side, roof shell pieces after extracting their snow surfaces, lift
rails/back panels, and static park trunks, crowns, paths and furniture. Named
architecture, translucent glass, independently lit bulbs, snow instances and
construction ownership remain separate. Six new geometry tests compare every
world-space vertex, normal, UV, material and shadow flag, plus brick pixels,
snow transforms, cutaway-side bounds, lamp behavior and exactly-once disposal.
The tests cover all three architectural styles and both shaft positions.

The development rendering panel now offers `metrics=paused`, which freezes the
scene from startup, and `unbatched-exteriors=1` independently of room batching.
The landmark fixture has a repeatable weather seed. Names/traits remain random;
this is a matched-layout comparison, not a serialized identical town.
In a 1280 x 720, three-tower-plus-park view at clear summer 18:00, settled
180-frame observations showed:
- All-pass draw calls: 2389 unbatched -> 1989 batched (400 fewer, 16.7%).
- Uploaded geometries: 1432 -> 1230; textures: 39 -> 39.
- Triangles: 164280 -> 164280. No geometry simplification.
- Frame p50/p95: 16.7/16.8 ms in both samples. CPU p50/p95: 8.1/10.8 ->
  7.7/11.6 ms. Timing is variable; no FPS or physical-phone gain is claimed.

Browser-skill screenshots retained the facade, roof, park and lift details in
both views. At 390 x 844, a real coffee-floor purchase in the disposable opening
study showed the coordinated structure at 0.35 seconds and furnished/sign phase
at 1.70 seconds. Selecting reduced opening while paused completed it immediately;
returning to full opening did not replay it. The full completed cafe was also
inspected at 1280 x 720. This is a scoped construction override, not a full OS
motion acceptance test. No captured browser warnings/errors. The metrics panel
can obscure the phone study scene and is absent from ordinary gameplay.

The runtime inspection also exposed a startup time reversal: the first animation
callback may precede a separately sampled `performance.now()`. The main loop now
uses a frame clock initialized from that callback, ignores stale/nonfinite
timestamps, and caps long gaps once without replaying backlog. Eight regression
tests include actual town midnight/rent behavior, first-frame zero, invalid and
duplicate callbacks, and normal pacing after a long gap. Offline catch-up and
player speed choices are unchanged.

All 550 tests across 77 files, TypeScript, production build and whitespace checks
pass. Main JS is 945.46 kB / 267.71 kB gzip; CSS 23.62 kB / 5.98 kB gzip. The
large-chunk warning remains. Development rendering/persistence controls are not
in the production bundle. No commit, push or deployment; the full goal remains
active. The prior persistence-study reset is still not verified.

Visual finding from ordinary runtime behavior: three midnight milestone
messages plus an arrival can form a tall toast stack over most of a phone tower.
They expire, but interrupt the dollhouse scene. Refine/coalesce simultaneous
announcements while keeping every earned reward discoverable in Activity and
the mission wall; do not discard rewards or invent extra progress.

Notification follow-up (2026-09-18): replaced the four-toast stack with a single
compact card. Actual mission completion events now include their id, label and
paid amount as a presentation receipt; the UI never grants or claims rewards.
Simultaneous milestones report their combined amount and story-wall tile count.
Single resident updates retain the person's name. An arrow opens Missions for
pure milestone notices or Activity for mixed/other news, with focus transferred
to that panel. Explicit dismissal restores the previous connected control or
falls back to the scene. The notice uses text nodes, a polite atomic live region,
44px controls and the existing reduced-motion preference.

Unheld notices expire after six seconds; further ambient news does not reset that
deadline. Hovering or focusing holds the displayed text and destination steady;
new news accumulates separately as bounded counters. Deliberate player-action
feedback takes priority, with interrupted/pending ambient news summarized after
it. Empty frames and routine sales do not rewrite or announce the live region.
Activity keeps up to 40 highlights ahead of a disclosure of 20 routine updates
from its existing session-only 200-event log. It does not promise permanent
activity history; earned missions and the story wall retain their existing saved
ledger. Existing double mission icons in Activity were also removed.

Fourteen tests cover batch totals, singular copy, receipt-less compatibility,
one-card/timer behavior, feedback priority, hover/focus stability, dismissal focus,
safe text rendering, real earned rewards with no second payout, and normal/shared
Activity rendering with highlights ahead of a busy sequence of visits.

Browser-skill checks used the disposable landmark town, with normal simulation
steps approaching midnight and normal live ticking across the actual daily
checks. Three earned missions produced one +910-coin / three-tile notice; a real
arrival joined it as one other update. At 390 x 844 and 320 x 568 the card stayed
within the viewport, with the dock and speed buttons accessible. Native Tab held
its action beyond the reading deadline; Enter opened focused Activity showing
the +400, +310 and +200 receipts and Ada's arrival, with the treasury unchanged.
No synthesized browser events, player saves or artificial UI-only rewards were
used. A prior observation arrived after the mission notice expired and saw the
next arrival instead; that was rechecked from a fresh, paused fixture.

At 1280 x 720, an actual apartment purchase showed compact feedback. An explicit
dismissal returned focus to the Apartments button without buying again. Another
purchase during room exploration confirmed the notice sits above the pan/zoom
controls; the same composition was inspected at 390 x 844 with keyboard-held
dismissal focus. No captured browser warnings/errors. An initial dismissal check
missed the six-second lifetime; the next check performed purchase and dismissal
promptly and succeeded. No browser/server restart was used for that timeout.
These are desktop browser checks at phone sizes, not physical-device or full
screen-reader/OS-motion acceptance. Large simultaneous-story readability and
long-session notification pacing still benefit from human playtesting.

The full 564-test / 78-file suite passed. After the final Activity icon and room
control spacing adjustments, 25 focused tests, TypeScript, production build and
whitespace checks pass. Main JS is 950.04 kB / 268.91 kB gzip; CSS 24.55 kB /
6.18 kB gzip. The large-chunk warning remains. No commit, push or deployment.
This resolves the observed toast-stack issue, not the full eight-part objective.

Still required before the full objective is complete:

- Complete runtime verification of event expiry, reduced motion, saved/shared
  scenery (bench/studio desktop rendering and concert expiry now checked),
  and subjective concert audio. Contextual event source and core tests now exist.
- Further realistic material/architecture refinement and richer snow/weather surface dressing;
  verify the weather mix by listening and test reduced motion beyond particles.
- Complete mobile/performance and motion verification of the implemented chefs,
  coffee collection, meetings, reading, household pets, shoppers and factory staff;
  refine close-up/mobile prop legibility and verify live retail/workshop motion.
- Complete public-landmark reduced-motion and balance verification
  (real trips, shared-town rendering and isolated browser local-save reload checked);
  richer rare business variants (current Signature and event
  variants are a starting point, not the complete visual-progression audit).
- Complete OS/browser reduced-motion acceptance and close-up/mobile composition
  checks for the new fireworks; performance is not yet measured on a real phone.
- Visual/audio verification of construction and all rewards, full desktop/phone
  interaction checks, keyboard/reduced-motion checks, visiting/save/offline checks,
  independent downloaded-postcard inspection, balance/performance playtesting.

Next work should use this checklist without treating the completed source edits
or green tests as proof that the entire visual/gameplay objective is finished.

## Saved landmark life and first-frame resident placement

The development landmark-save study uses normal purchases, simulation and
SaveSession startup/save/reload through its own strict, allowlisted namespace.
It stages eligibility, not landmarks or successful visits. The ordinary landmark
preview stays disposable, and neither study accesses player-save keys. Four
tests cover namespace separation, real purchases/visits, unchanged restored
checkpoints, duplicate-build refusal, read-only summaries and explicit controls.

The earlier browser purchase sequence spent 5,100 coins for all three landmarks,
retained their opening memories on reload, then reached 5 conservatory visits,
6 gallery visits and 2 observatory visits through real evening simulation.
Reopening that checkpoint in this pass showed 32 residents, 19 floors, 20
milestones, 35 memories, 27,027 coins and the same visitors/entertainment values.
Eligibility was staged, so this is not a normal-earned-unlock balance test.

Browser inspection exposed a real rendering bug: the paused conservatory listed
five visitors but drew them at the same model origin. New character views now
initialize at their actual room/queue position before ordinary movement. They
immediately adopt the appropriate reading, resting or working pose. Existing
characters still walk to changed targets; pausing does not snap or move them.
Stair and street travel remain simulation-positioned, and construction readiness
still hides characters until their floor is visually ready.

Seven regression cases failed before the fix and passed afterward: all three
saved landmark types, sleeping households under both motion preferences,
workplace/construction visibility, and queue/rider placement with subsequent
walking and pause behavior. Save snapshots prove that visual reconstruction does
not award visits, change finances or otherwise mutate simulation state. The
older walking-freeze test now starts a real home-to-queue walk instead of relying
on the erroneous origin-to-seat spawn drift.

Browser-skill verification used a real save/reload, not only hot replacement.
At 1280 x 720, the frozen conservatory showed four separate seated readers and a
fifth standing visitor; the apartment below also restored its residents in their
seats. At 390 x 844 those residents remained separated and readable. Selecting
the left reader opened Tess's actual portrait, landmark activity, trait, named
cat and arrival story. The checkpoint remained at 18:20 with 27,027 coins and
unchanged visit totals. No browser warnings or errors were reported. This checks
desktop and emulated phone layouts, not physical-phone performance or all rooms'
full-motion visual acceptance.

Verification: 55 focused tests, then all 575 tests across 80 files passed;
TypeScript and whitespace checks passed. Production build passed at 950.11 kB JS
(268.94 kB gzip) and 24.55 kB CSS (6.18 kB gzip), with the existing large-chunk
warning. The compiled assets contain none of the landmark-save study markers.
No commit, push or deployment. The complete eight-part objective remains open.

## Live lift guidance and visible upgrade consequences

The preceding resident-placement pass was concrete implementation and runtime
verification progress. This pass measured the existing fifteen-minute guided
play harness before changing guidance. Across seeds 7/71/701, the original
longest gaps between successful suggested purchases were 150/120/90 seconds.
Tracing seed 7 showed repeated urgent lift prompts at 660–750 seconds, despite
zero queued riders and a recently purchased upgrade. Historical shaft wait
averages, rather than current pressure, were monopolizing the primary goal.
There were no available promotions or sub-40-quality rescues in those intervals;
inventing another cheap chore was not a supported remedy.

Urgency now comes from a nonempty queue plus either an oldest wait over 20 game
minutes, or at least three recent resolved trips averaging over 20 minutes.
The recent window is one game hour, capped at 20 trips and includes abandoned
trips. Following an upgrade, only post-purchase trips inform that average; a
long live queue still triggers immediately. The journal ranks pressured towers
by their oldest wait, names the tower, shows current pressure and an available
upgrade or exact saving gap. It does not suggest nonexistent top-speed tiers.
The inspector uses the same classification and explicitly identifies an empty
current queue, without erasing missed visits or the historical comparison.

A temporary Watch the change card now exposes the real upgrade ledger: progress
to 20 trips, a labelled early estimate from 10 trips, then the measured first-20
result. Missing baselines and worse/unchanged outcomes are stated honestly. The
card spends nothing and grants no reward; it links to the existing lobby lift
controls. It retires after 20 more trips and never pushes the journal past five
cards or displaces the three primary horizons, invitations or landmark choices.
No prices, incomes, rewards or trip behavior were changed.

Twelve new core cases cover stale averages, current long queues before any
completed trip, recent trip windows, post-upgrade evidence, sample counts,
missing baselines, worse results, exact affordability, top tiers, persistence,
read-only derivation and the five-card cap. Inspector and journal regressions
check current-vs-historical wording, keyboard focus through live sample updates,
and navigation without a second charge. The fifteen-minute harness now asserts
zero empty-queue urgent lift prompts for all three seeds.

After the change, the same scripted runs had 21/18/21 successful choices and
longest gaps of 90/150/90 seconds. First paid meals stayed near 63 seconds; ten
neighbors arrived around 240–270 seconds. These are simulations following the
first suggested action, not human engagement evidence. Seed 71 still has a
150-second late gap, and reaching a second shaft is not guaranteed within this
scripted 15-minute route. The every-minute decision objective is still unproven.

Browser-skill verification used the disposable real-rider transit study. At
1280 x 720, buying a second shaft charged exactly 1,500 coins and exposed the
0/20 observation card. After 12 real resolved trips it showed 74.2 → 8.8 minutes
as an early estimate. At an oldest live wait of 40 minutes, urgent guidance
returned even while that early result was positive. At 20 trips the result was
74.2 → 32.9 minutes, including abandonments. When queues emptied, the primary
goal moved to dining despite the HUD's older 53-minute historical average.
Opening the comparison preserved the current 13,638-coin balance.

At 390 x 844, a second independent run through normal pause/purchase controls
showed a final 56.9 → 32.8-minute sample and no current queue. Following the goal
collapsed the phone journal, opened the correct lobby and preserved 13,847
coins. Scrolling the inspector exposed the readable comparison and upgrade
controls with no clipping. The initial performance-study overlay obstructed that
area, so this composition check was repeated without the developer overlay.
No browser errors/warnings. The temporary viewport override was reset.

Interaction refinement identified in this pass (resolved below): the result opened the lobby's top,
requiring scrolling to Getting around on phones. Also the compact HUD still
shows a historical average next to the current queue count without an explicit
"average" label. Neither is evidence of every-minute pacing completion.

All 589 tests across 81 files passed; TypeScript and whitespace checks passed.
Production build passed at 952.19 kB JS / 269.75 kB gzip and 24.55 kB CSS /
6.18 kB gzip. The large-chunk warning remains. No commit, push or deployment;
the complete eight-part objective remains active.

## Direct lift-report navigation and readable historical averages

The prior pass was implementation and runtime-verification progress, with a
specific remaining interaction defect: phone users had to scroll past tower
naming, architecture and the story wall to reach the lift report they requested.
There is now a dedicated transit selection. The HUD, urgent journal goal,
measured-result card and resident lift-concern link all use it. It opens the
correct tower's live queues, missed visits, measured improvement and real upgrade
controls directly. Ordinary lobby inspection and its upgrade controls still work.
This selection is UI-only; it does not modify saves, finances or the simulation.

Opening the transit selection moves focus to the report. The inspector now
allows normal live refresh while its container itself has focus; it still
preserves a focused interactive descendant rather than replacing that control.
Lift purchases recheck the selected tower and funds, ignore controls retained
after leaving the panel, preserve the report selection, and focus the report
after rendering the new price/state. Visiting mode has no purchase controls or
listeners. Missing towers close the panel safely.

The HUD shows the current queue count and a labelled historical average, with an
expanded accessible label spelling out game minutes and the report destination.
A missing sample is shown as a dash and explicitly described, distinct from a
real measured zero. Returning to town view clears the tower-specific label.
A 320-pixel browser check found overflow in the first single-line version. The
two values now wrap as indivisible text groups, preserving both at narrow sizes
without clipping or shrinking their font. At 320 x 568 the wrapped chip remained
above the weather controls; at 390 x 844 it remained legible alongside the HUD.

Seven new inspector cases cover direct named-tower navigation, escaping,
read-only visits, selected-tower-only charges, retained lobby controls, stale
funds/selection, live report updates, focused-control preservation and missing
towers. Two HUD cases distinguish missing versus zero samples and current queue
versus historical averages, and check view-switch labels/navigation without a
charge. Existing resident-concern and journal tests now require direct transit
targets rather than lobby targets.

Browser-skill verification used the disposable transit study. At 390 x 844,
the compact urgent goal opened queue counts and both upgrade buttons immediately,
with no lobby forms. Three Tabs from the focused report reached Second shaft;
Return purchased it and retained the measurement panel. Four ordinary 20-minute
steps completed a real 74.2 → 33.6-minute sample. The observed money reconciled
from 14,841 coins plus 486 income minus 1,500 for the shaft to 13,827 coins.
Following the completed journal result reopened the dedicated report without
another charge; its comparison was visible on the initial panel screen.

At 320 x 568, the corrected HUD displayed 0 waiting and 67m avg on separate
lines. Clicking it opened the same queue diagnostics, explicitly showing nobody
waiting now despite the old average. The ordinary pause button held the town
while inspecting. One attempted urgent-goal click had no matching button because
the rush had cleared during a development reload; the next fresh observation
correctly showed the dining goal instead. No runtime errors/warnings were
reported. The viewport override was reset. These are emulated layouts, not
physical-phone performance or full screen-reader acceptance.

Verification: the full suite passed 598 tests across 83 files. After the final
HUD wrapping change, 39 focused tests, TypeScript, whitespace checks and the
production build passed. Final assets: 953.39 kB JS / 270.04 kB gzip, 24.69 kB CSS /
6.21 kB gzip. The large-bundle warning remains. No commit, push or deployment.
Late pacing gaps and the other whole-goal acceptance items remain open.

## Earned restaurant recognition integrated into the room

The preceding design-only turn did not advance implementation. Inspection found
that Critic's choice still inserted a separate tasting table across the open
front and a freestanding kitchen-side plaque. The reward now dresses the real
restaurant: a rear-wall brass frame, review lines and star seal, a picture light,
and folded linen/brass menu details on the three existing tables. All four
restaurant subtypes retain their furniture, menus, staff positions and six dining
seats. The picture light uses the room's owned occupancy-aware lamp material.
The invitation and completed review now describe these visible rewards.

Restaurant appearance keys include critic recognition. Earning or removing it
rebuilds once, releases old room resources and refreshes the lighting cache;
ordinary sync does not rebuild or replay an opening. Saves, shared-town codes
and second-shaft rebuilds reconstruct the earned room from the existing variant.
No save-schema, simulation, visitor, seating-capacity or reward-rate changes.

Nine added test cases cover the four earned subtype envelopes and rendering
budgets, real worker/guest face rays from three angles, actual chair positions,
resource disposal, idempotent sync, unchanged save state, save/share round trips,
second-shaft reconstruction and removal. The existing lighting case also checks
that the framed award shares the live lamp material and dims when empty.

Browser-skill verification used the disposable neighborhood study, not a player
save. The real 60-coin tasting invitation was accepted; ordinary town ticks to
the following evening produced one served critic, zero missed visits, the earned
variant and its journal memory. Visiting the event's venue opened Raincheck
Coffee, and Explore this room showed the rear award and unobstructed original
tables at 1280 x 720 and 390 x 844, including a phone zoom/pan check. The award
was visible without the old front table. No browser errors/warnings; the viewport
override was reset. Persistence verification here is automated serialization and
reconstruction, not a browser-storage reload. Other restaurant subtypes received
geometry/visibility tests, not individual runtime screenshot acceptance.

An initial ShapeGeometry emblem pulled in a general triangulator, increasing the
bundle to 966.54 kB. It was replaced with a ten-triangle BufferGeometry emblem;
the final build is 954.26 kB JS / 270.38 kB gzip, 24.69 kB CSS / 6.21 kB gzip.
Full suite: 607 tests in 83 files passed before final description/lighting edits;
43 focused tests then passed, and all 21 restaurant tests passed after the final
geometry change. Final TypeScript and whitespace checks passed. The large
bundle warning remains. No commit, push or deployment.

Interaction follow-up discovered: the compact earned-place story opens the first
associated staff member, because stories only retain resident IDs. The event's
Visit the place action correctly reaches the restaurant. A durable place target
for location stories would make earned rewards easier to revisit; it is not
implemented in this pass. Whole-goal acceptance and late pacing gaps remain open.

## Memories lead back to their earned places

The preceding pass was concrete implementation and browser-verification progress.
Its observed follow-up is now implemented: place stories can retain an optional
explicit floor/tower or park-slot reference. New critic reviews, signature
businesses, first paid customers, landmark openings, startup expansions, concert
invitations and festival awards record their actual destinations. Startup memories
lead to the new studio; host dedications remain personal stories. References do
not depend on names, current staff assignments or the bounded neighborhood-event
archive. Existing version-4 saves remain compatible; old memories are not guessed
or rewritten from their titles.

Restore validates and copies only the known location fields. Resolution rechecks
that the floor or unlocked park actually exists. Missing/malformed locations
fall back to the existing personal/read-only story presentation. Links from the
public journal, compact latest-story card and personal histories work in owned
and read-only shared towns without granting rewards, spending coins or mutating
the save. A personal memory remains navigable even after it leaves the public
journal. Detached inspector controls cannot navigate after leaving the panel.
Journal refresh retains story focus by story ID instead of an associated person.
Following a room centers its floor; navigation moves focus to the destination
inspector and collapses expanded phone goals.

Twelve additional tests cover detached references, same-name rooms in different
towers, rename/staff changes, absent event history, archive eviction, save/share
round trips, legacy stories, malformed destinations, stale/missing places,
phone-card focus, personal/journal navigation, visiting mode and park routing.
Existing real-event tests now require the exact critic, startup, festival and
concert location; first-sale, signature and landmark tests require theirs too.
One initial test fixture incorrectly assumed it already contained a second tower;
that fixture now explicitly creates the second tower and exercises cross-town
navigation. All 619 tests across 84 files passed.

Browser-skill checks used only the disposable neighborhood study. A real tasting
produced a Day-10 review. The journal link opened Raincheck Coffee on floor 3,
not Maya's profile, focused its inspector and preserved 29,814 coins. At
390 x 844, five Tabs from Maya's profile reached that place memory; Return opened
the same café with destination focus and an unchanged balance. Booking a concert
cost exactly 80 coins, then the latest-story card opened the actual park without
another charge and collapsed the phone journal. This exposed a camera mismatch:
the first compact park link selected the right panel but showed the whole town.
The final route now focuses an unlocked park directly (locked expansion lots
still use town view). A repeated phone check visibly framed the park and its
Lantern Trio bandstand, retained 24,323 coins, and focused the park panel.
No browser errors/warnings; viewport override reset. Persistence checks were
automated round trips, not a browser-storage reload in this pass.

Final TypeScript and production build passed after the park-camera correction.
Assets: 956.61 kB JS / 271.04 kB gzip; 24.69 kB CSS / 6.21 kB gzip. The large-chunk
warning remains. No commit, push or deployment. The full eight-part goal remains
active; late pacing gaps, physical-device performance and broader acceptance
items are not resolved by this navigation improvement.

## Festival dressing preserves the host's trade

The last pass was implementation and verification progress. This pass returned
to the visible rewards: Festival favorite previously added the same produce
counter to all seven eligible shop/restaurant subtypes, plus conical flags beyond
the room's front edge. New envelope tests first failed at z=3.38 (room edge 3).
The produce counter is removed. A supported sagging cord carries folded fabric
pennants inside the room, with a framed brass-and-ribbon rosette at the rear.
The business keeps its original furniture and subtype, including electronics
demonstration tables, clothing displays and restaurant seats.

Static opaque geometry uses existing shared materials and eight batches instead
of fourteen original meshes, with fewer than 1,100 added triangles, no extra
lights, shadows, textures or actors. Folded flags have explicit front/back faces
and finite unit normals without transparent materials or a triangulation library.
Variant decorations now attach to room-furnishings so construction hides/reveals
them with the room; removal uses the actual parent and releases geometry once.
The existing permanent variant still controls persistence and visitor spending;
no economy or event-threshold changes. The completed event describes its bunting
and award as well as the +10% spending distinction.

Nine tests cover all seven eligible venue types, finite geometry, bounded cost,
real staff/customer face rays at three angles and three visit stages, clear
waist-level space, unchanged participants, construction pause/reduced motion,
idempotent reward attachment, retained base furnishings, save/share rebuilds,
second-shaft rebuilds and disposal. The full suite passed 628 tests in 85 files;
TypeScript, whitespace and production build passed. Final assets: 957.74 kB JS /
271.50 kB gzip, 24.69 kB CSS / 6.21 kB gzip; large-chunk warning remains.

Browser-skill verification used the disposable neighborhood study. The ordinary
startup expansion (350 coins) and host dedication (120) freed invitation slots;
ordinary day advancement produced the festival invitation. Hosting cost 200.
Three evening hours of actual guest lift journeys and purchases earned the
Festival favorite memory. It opened Thread & Thimble Boutique on floor 4, showing
the unchanged clothing subtype, two assigned staff, +10% status, eight visits
today and no store visits lost to queues. The balance reconciled from 31,421
minus 200 plus 375 income to 31,596; following/exploring the memory did not spend.
The live festival also produced a genuine 36-minute lift queue and the existing
urgent lift-improvement goal, rather than hiding its traffic pressure.

Desktop (1280 x 720) and phone (390 x 844) room views retained the boutique's
clothing displays and real customers, with the framed rosette clearly visible.
The bunting is near the ceiling/nameplate and partly occluded by it; making
earned ceiling detail easier to read in close-up remains a visual-composition
follow-up. This is not full art-direction acceptance. Other subtypes received
geometry/visibility tests, not individual screenshot checks. No browser errors
or warnings; viewport override reset. Save/share verification was automated
reconstruction, not browser-storage reload. No commit, push or deployment;
the full eight-part objective remains active.

### Room exploration gives earned detail space

Close-up floor signs now use 60% scale against the ceiling trim instead of
covering the center of the room. This transforms existing meshes: no new
geometry, materials, textures, simulation state or save fields. New floors,
critic-room replacements and second-shaft rebuilds retain the selected mode;
other towers retain normal signs. Opening opacity and paused/reduced-motion
construction remain independent. Full tower view restores exact original
positions and scales.

The room toolbar now names the floor at the camera's clamped center, updates
after camera movement, follows renames, and identifies the rooftop. Names use
textContent, with one-line ellipsis for narrow screens; keyboard guidance remains
in the section description and caption title. Buttons are not recreated on
updates. Postcard capture temporarily restores overview signs and restores the
room presentation before its synchronous final redraw, on success or failure.

Six new tests cover signs and controls; postcard success/failure tests additionally
verify presentation at both render calls. Full suite: 634 tests / 87 files passed.
TypeScript, whitespace and production build passed. Assets: 958.90 kB JS /
271.88 kB gzip; 24.80 kB CSS / 6.24 kB gzip. Large-chunk warning remains.

Browser-skill verification earned the festival through the disposable study's
actual startup/host/festival choices and ordinary simulation ticks, then followed
its memory into Wren & Willow Boutique (floor 4). At 1280 x 720 and 390 x 844,
the smaller nameplate left the bunting, framed rosette, merchandise and visiting
customer visible; the toolbar clearly named the boutique. Phone zoom reached its
limit, panning and ArrowUp moved to floor 5 with the Clover Market caption, and
Escape restored overview signs and canvas focus. Navigation left the paused
balance at 31,582. The full skyline postcard preview displayed both towers, park,
town/district names and statistics correctly. No browser errors or warnings;
viewport override reset. Downloaded PNG inspection, physical-phone performance,
full art-direction acceptance and the broader eight-part acceptance remain open.
No commit, push or deployment.

### An expensive lift fix no longer hides every affordable choice

The previous room-composition turn made verified progress. This pass investigated
the remaining 150-second decision gap in the seeded 15-minute playthrough. Its
cause was an urgent but unaffordable lift upgrade replacing all immediate action
cards while staffed, sub-55-quality businesses could still be renovated. The
problem was not an absence of affordable actions in the simulation.

The urgent queue warning remains first, with its exact saving gap. When no lift
upgrade can be afforded, a staffed business that can be renovated is now an
optional fourth card. It explains the real cost and +18 quality, explicitly says
that spending competes with lift savings and does not shorten queues. It disappears
when the repair is unaffordable/unneeded/unstaffed or the lift can be purchased;
fully upgraded lifts do not manufacture a savings target. No prices, rewards,
arrival rates, queue behavior or simulation state changed. The three primary
horizons remain; invitations take priority over the fifth landmark/reminder card.

On compact screens a 44px comparison button opens and focuses the full tradeoff
card. This is navigation only; the purchase still requires the normal inspector
control. Focus is returned safely if that comparison ceases to exist. Expanded
lists remain capped at five goals, with stable goal identity during updates.

Paired playthroughs cover the same seeds (7, 71, 701), with and without choosing
the offered alternative, one decision opportunity every 30 real seconds at 1x.
Longest gaps including the trailing interval: 90/150/90 seconds when saving,
90/120/90 when considering alternatives. Decision counts: 21/18/21 versus
20/20/21; final populations 20/16/20 versus 20/20/20. Both strategies retain
earned 5–15-minute session milestones, positive balances, real first customers,
and no empty-queue lift sales prompts. These are seeded policy simulations, not
proof of fun, universal pacing, or second-shaft purchase within fifteen minutes.
The 120-second gap and longer-session human playtesting remain open.

Browser-skill verification at 390 x 844 used the existing disposable transit
study's new tight-budget condition: staged 250-coin wallet/40-quality shop,
but 26 minutes of actual rider journeys produced 24 waiting, not fake samples.
The collapsed journal exposed comparison. It focused the readable priced card;
Return opened Little Harvest Market on floor 13, without spending (250 coins).
The actual 240-coin renovation produced quality 58, grade B and 10 remaining
coins; the alternative disappeared while the genuine queue warning remained,
now correctly asking for 290 more coins. The shop's 14 lost visits remained
visible rather than being erased by renovation. Viewport reset; no browser
warnings/errors. No player autosave was touched.

Full suite: 642 tests / 88 files passed, including new affordability/navigation
and staged-budget coverage plus paired pacing cases. TypeScript, whitespace and
production build passed. Assets: 960.24 kB JS / 272.23 kB gzip; 25.02 kB CSS /
6.27 kB gzip; large-chunk warning remains. No commit, push or deployment. The
full eight-part goal remains active.

### Dusk warms inhabited rooms, not just their window panes

The previous pacing turn made verified progress. This pass inspected the actual
sunset/blue-hour neighborhood and found that emissive panes/lamps did not warm
their surrounding walls. The existing dusk sky and solar transition were kept.
Each ordinary room now owns a small, warm 64 x 32 RGBA light map on its existing
wall material, using the native lightMap shader path and existing UVs. Soft
low-level home pools and higher commercial pools approximate indirect wall
light; this is not ray-traced global illumination. Paint colors and existing
shadows remain. Landmarks keep their specialized lighting rather than receiving
an extra generic shell.

The same staggered evening curve as the windows drives intensity. Empty rooms
receive no additional wall light; lobbies remain welcoming. Residential wall
light drops to 12% when everyone present is resting, while an awake night owl
keeps it up. Occupancy/awake floors are gathered in one pass. No simulation,
reward, saved state, scene light, mesh, shadow pass or per-frame texture creation
was added. Each map is 8,192 source bytes; it is owned/disposed with the room,
including critic replacements and second-shaft rebuilds. Physical-device GPU
cost has not been measured, so this is not an FPS improvement claim.

Five tests cover bounded warm textures/UVs/soft gradients, monotonic dusk fade,
actual occupancy, sleep/night owls, zero daytime contribution, unchanged town
state, stable resource identity and exactly-once rebuild disposal. Full suite:
647 tests / 89 files passed. After consolidating the awake-occupant scan, all 12
lighting tests passed again. TypeScript, whitespace and production build passed.
Assets: 961.16 kB JS / 272.58 kB gzip; CSS remains 25.02 / 6.27 kB. Large-chunk
warning remains.

Browser-skill checks used the disposable neighborhood preview: 18:01 sunset,
19:01 blue-hour tower/close-up at 1280 x 720, then 390 x 844 room exploration.
The occupied Raincheck Coffee and homes showed warm wall gradients, readable
furnishings/people and glowing panes; the empty boutique remained subdued. The
phone view at 00:47 showed real residents in their separate beds with dimmer
walls and panes. Ordinary preview day advancement to 19:00 showed residents
awake/seated again and warm home/café walls. No purchased or fabricated lighting
occupants. Current-page browser logs were clean after fixing an initial compile
syntax error; viewport override reset. No player save, commit, push or deployment.
Full visual-direction and eight-part completion remain unproved.

## Startup rewards show their staffing immediately

The previous reply offered design recommendations rather than implementation.
This pass revalidated the pending expansion problem against current code and
the running neighborhood preview: assignment changed immediately, but the
derived staffed-floor set waited for a simulation tick. A paused Innovation hub
therefore showed two employees alongside “Closed — no staff” and dimmed walls.
The same gap existed when restoring a town and immediately after ordinary hiring.

Town.refreshStaffing now publishes assigned staffing without simulation side
effects. Expansion calls it after relocating the actual two teammates; save
restoration calls it after all towers/residents exist; normal ticks refresh it
after hiring as well as before journey planning. Existing day-rollover refresh
uses the same method. Assignment remains independent of physical presence:
off-shift staff do not close a business, and opening does not fabricate workers,
teleport them or pay wages before they arrive.

Six new tests cover same-/cross-tower expansion with a minimum three-person
team, exact one-time cost, unchanged clock/residents apart from the intended
reassignment/replanning fields, restoration, same-tick automatic hiring, pure
idempotent refresh and vacated-business closure. A real event-to-render-to-share
test verifies undimmed tech-office wall materials and the two earned displays,
without a post-purchase tick. Its initial assertion incorrectly indexed the
renderer’s insertion-ordered floor collection after rebuilding a room; it now
finds the actual floor by its stable floorLevel identity.

Browser-skill verification used only the disposable neighborhood preview:
purchase at Day 10, 18:01 changed 23,700 coins to 23,350, left income at 3,700 and
population at 16, and showed “Open” with “Staff (2/4)” while both teammates were
still at home. The earned prototype room had its green business indicator.
Desktop 1280 x 720 and phone 390 x 844 inspections agreed; time remained 18:01.
Browser warning/error logs were empty and the viewport override was reset.

Full regression suite: 653 tests / 90 files passed. TypeScript, production build
and whitespace checks passed. Build: 961.25 kB JS / 272.61 kB gzip; unchanged CSS
25.02 / 6.27 kB. Existing large-chunk warning remains. No player saves, commits,
pushes or deployments were changed. Full eight-part acceptance remains open;
this pass establishes immediate, honest feedback for an earned neighborhood
transformation, not completion of the entire objective.

## Smooth the actual scene, not only the output canvas

The previous staffing turn made verified implementation progress. This pass
inspected the current room presentation and rendering pipeline. Visible stair
rails, slab edges and furniture silhouettes were jagged despite the renderer's
antialias flag: EffectComposer's default HDR off-screen buffers had zero samples,
so canvas antialiasing did not apply to the geometry. The installed Three.js
source confirmed the default target format, depth attachment and resize path.

SceneComposer now applies hardware-supported 2x/4x multisampling to the actual
HDR scene targets before bloom/output, without a full-image blur or new render
passes. It intersects RGBA16F and DEPTH_COMPONENT24 sample support with the
renderer limit. Unsupported combinations retain single-sample rendering. The
budget uses real framebuffer dimensions, including pixel ratio: at most
4,194,304 sample-pixels per target on desktop or 3,145,728 on coarse-pointer
devices. For two 8-byte HDR color / 4-byte depth multisample buffers this is an
estimated additional storage ceiling of 96 / 72 MiB respectively, excluding
the existing resolved textures and bloom buffers; actual device allocation is
not measured. Large resolutions fall back to fewer samples or none rather than
allocating unbounded multisample storage. Redundant output-canvas antialiasing
is disabled. Resizing and postcard pixel-ratio changes automatically reapply
the budget, disposing old framebuffer resources when the sample count changes.

Four tests cover supported-count/pixel budgets, color/depth format intersection,
unsupported fallback, retained HDR/depth configuration, stable targets on
unchanged sizes, disposal when reconfiguration is required, pixel-ratio changes
and postcard-sized capture/restoration budgets. Full suite: 657 tests / 91 files
passed; TypeScript and production build passed. Build: 962.14 kB JS / 272.94 kB
gzip, CSS unchanged at 25.02 / 6.27 kB. Large-chunk warning remains.

Browser-skill checks used the isolated rooms preview with frozen rendering
metrics. Before/after 1280 x 720 Firefly Studio close-ups at Day 11 10:10 showed
smoother rails/slabs and furniture silhouettes with readable nameplates. Both
samples had 710 all-pass draw calls and 95,734 triangles; frame p50 stayed about
17.6 ms (p95 18.0 before / 18.1 after), and CPU p50 was 3.4 / 3.5 ms. These are
local observations, not an FPS improvement or physical-phone benchmark. The
fixture regenerates resident colors and home names on reload; its room layout,
camera composition and staged office workers were equivalent.

A 390 x 844 resize remained readable. The normal skyline action produced the
1600 x 1100 postcard preview and returned successfully; the download itself
was not tested. Desktop restoration and staged 18:30 dusk retained the warm
lighting/bloom. Browser warning/error logs remained empty; viewport override
reset. No player save, commit, push or deployment changed. The observed busy
desktop control layout was not altered in this rendering pass. Full eight-part
acceptance, physical-device rendering cost and broader art direction remain open.

## One desktop dock row leaves the town more room

The previous off-screen smoothing turn made verified implementation progress.
Current desktop screenshots still showed two permanent rows of controls taking
space from the tower and room exploration. Desktop now keeps the five floor
categories, Landmarks, Manage and the town/tower switch in one eight-button row.
Manage contains lift upgrades, Missions, Activity, Friends and New town, with
the mission count retained on its persistent button. The existing three-button
phone dock remains. No building, upgrade, reset, goal or economy rules changed.

Manage reuses the action sheet, without a desktop dimming backdrop. Both layouts
have an explicit close button, named regions, expanded/control relationships,
first-available-choice focus and Escape-to-trigger restoration. Outside pointer
or keyboard focus dismisses without stealing focus. Responsive rebuilding closes
menus, preserves action buttons and returns focus to View if the old dock had
focus. Successful upgrades/builds close choices to expose their result. Reset
still requires its existing confirmation. Desktop subtype choices also focus
their first available option and restore the originating category on dismissal.

The desktop dock, camera bottom inset, exploration controls and toast baseline
now agree on one row: 80 pixels of reserved space instead of 130, with unchanged
phone clearance. A browser purchase check exposed a toast covering the subtype
picker despite its local z-index, because the transformed dock created its own
stacking context. The dock's stacking order is now explicit, and notifications
sit above an open desktop subtype picker; exploration controls temporarily hide
while choices occupy that space. Choices remain selectable and the reward text
remains readable instead of sitting behind them.

Six new UI-boundary tests exercise desktop/mobile groups, Escape/focus, exact
upgrade and subtype costs, town-wide management without a selected tower,
reset rejection, goal drill-in, outside dismissal and breakpoint rebuilding.
One new framing regression fixes the intended desktop/phone clearance. Full
suite: 664 tests / 92 files passed; TypeScript, whitespace and production build
passed. Assets: 964.95 kB JS / 273.55 kB gzip, 25.66 kB CSS / 6.37 kB gzip.
The existing large-chunk warning remains.

Browser-skill checks used the disposable neighborhood preview at 1280 x 720,
901 x 720 (the narrowest desktop breakpoint) and 390 x 844. Desktop stayed one
row; Escape visibly returned to Manage. A 2,000-coin lift upgrade changed
23,700 to 21,700 and a 458-coin Creative Studio changed it to 21,242 while the
clock stayed paused. The subtype menu closed, the new room appeared and focus
returned to Office. Phone Manage, explicit close, Build → Restaurant → Back →
Escape worked without another charge. After restoration to desktop, a fresh
229-coin apartment purchase plus immediate Office opening showed the toast and
picker separately. Room exploration kept its controls above the single row.
Browser warning/error logs were empty; viewport override was reset. No player
save, commit, push or deployment changed.

The final close-up also showed a remaining art-direction issue: heritage rooftop
corbels can obscure portions of a top-floor nameplate in detail mode (the room
toolbar caption stays readable). That needs a targeted visual follow-up; this
layout pass does not establish full eight-part or visual acceptance.

## Architectural nameplates stay clear of their building

The preceding advisory turn made no implementation progress. Revalidated the
current renderer and resumed the concrete top-floor obstruction from the dock
pass. Detail signs were raised into heritage corbels; camera-to-face tests also
exposed snowy canopies covering entrance labels and roof edges clipping the
starting lobby. This pass corrects mounting positions, not depth testing.

Compact signs remain high in the room but clear the next floor belt. Roof-level
signs allow extra clearance, with a larger drop under heritage corbels. Overview
signs also clear the starting roof. Earned canopies carry the entrance sign on
their front fascia, at a width that fits the canopy in overview and detail.
Architecture changes and tower growth reposition existing signs; a former top
floor returns to its normal mounting. Sign materials/textures/geometry are
reused, and construction opacity remains independent. No added meshes, lights,
simulation changes or save-format changes.

Four added regressions cover geometry sightlines for heritage/modern/garden,
one/two/seven floors, bare/earned facades, full snow, first/second shafts,
1280 x 720 and 390 x 844 camera framing, overview and three close-up zooms.
Fifteen face samples per sign check the real solid geometry in front of each
sample. Refresh tests cover growth, architecture switching, canopy removal,
unchanged resource identities and normal-size restoration. Existing construction,
earned-variant, pause, reduced-motion and cross-tower isolation checks remain.

Full suite: 668 tests / 92 files passed. TypeScript, whitespace and production
build passed. Bundle: 965.17 kB JS / 273.63 kB gzip; the existing large-chunk
warning remains. Browser-skill visual checks used the disposable neighborhood
study: built a 229-coin apartment (23,700 to 23,471 at paused 18:00) and inspected
its unobstructed heritage label; separately switched the same fixture tower to
modern and garden styles, checked the entrance and top-floor room views, and
checked garden framing at 390 x 844. A 1600 x 1100 skyline postcard preview still
rendered (download not exercised). Browser warning/error logs were empty, and
the viewport override was reset. Snow occlusion is covered by geometry tests,
not a new snowy-browser inspection. No player saves, commit, push or deployment
changed. All eight broad acceptance areas remain open; this resolves the
specific architectural-sign obstruction rather than claiming full visual polish.

## A wooded horizon and retained twilight skylight

The previous nameplate turn made verified implementation progress. Reinspection
of the paused neighborhood screenshot and postcard still showed the towers
against a flat, dark expanse. Added three low overlapping ridges behind the
playable street, with eight loose groves of distant trees. Terrain is fixed in
world space and uses the existing scene atmosphere, not a camera-following sky
decal. All geometry stays behind z=-62, outside lots, parks and pedestrian routes.
It does not invent neighboring businesses or change town identity/attractiveness.

The first runtime comparison exposed a straight material seam at the hill foot.
Hills now share the meadow material, texture phase and 6000-unit UV scale;
submerged boundary vertices avoid a raised edge. Snow therefore matches the
actual town ground, while distant crowns whiten and recover on thaw. Tree roots
use interpolation of the actual terrain triangles, verified with downward rays,
so the analytic ridge does not leave trunks hovering above a coarse mesh.
The backdrop adds three opaque batches and 22,528 triangles, no extra textures,
lights, shadow passes, pick targets or animation. Existing landscape ownership
disposes its materials, geometries and instance buffers exactly once.

Twilight receives a bounded extra hemisphere-light contribution and a modest
warm sky tint under clear skies. Midday and full-night intensity are unchanged;
clouds temper both intensity and warmth. The key light, room occupancy lighting,
stars, weather rules and simulation clock are unchanged.

Four new backdrop tests cover deterministic geometry/instances, bounded terrain,
grounded trunks, shared material/UV alignment, snow/thaw and unchanged town
state. A fifth regression covers dawn/dusk fill and unchanged noon/night.
Existing landscape disposal/allocation, walking-clearance and smooth lighting
transition tests pass. Full suite: 673 tests / 93 files passed. After extracting
the shared ground-size constant, the 21 relevant landscape/lighting/postcard
tests and TypeScript passed again. Whitespace and final production build passed:
967.63 kB JS / 274.52 kB gzip; 25.66 kB CSS / 6.37 kB gzip. The large-chunk warning
remains; the draw/triangle bound is not a physical-phone performance claim.

Browser-skill checks used disposable, paused neighborhood/weather studies:
1280 x 720 clear 18:00 before/after, snowy 09:00, rainy 21:00, 390 x 844 town
survey at clear 18:30, and a restored-desktop 1600 x 1100 skyline postcard preview.
The backdrop stays behind the towers, snow covers the hills consistently, and
wet-street reflections remain visible. The postcard preview renders the new
setting; PNG download was not exercised. No browser warnings/errors in the final
fresh preview; viewport override reset. Player saves, commits, pushes and
deployments were not changed. All eight acceptance areas remain open, including
broader visual polish, sustained pacing and physical-device performance.

## Following a concern through to a real recovery

The preceding recommendation-only turn made no implementation progress. The
current worktree contained an unfinished resident-care pass; revalidated its
files and the still-addressable full-suite process rather than restarting it.
That process completed successfully: 682 tests / 94 files. The care work closes
a concrete emotional-loop gap: food and leisure thoughts previously led only
to town averages, and opening help lost the person whose concern prompted it.

Individual resident panels now expose four accessible needs meters. Food and
leisure help chooses an eligible destination in the resident's home/work towers,
preferring the current physical tower; unstaffed businesses and unrelated towers
are excluded, while public landmarks remain available without staff. Missing
amenities have explanatory guidance. Navigation does not dispatch the resident,
change their needs, award coins or promise that a renovation will cure hunger.

A temporary help card keeps the resident's name, starting/current happiness,
actual move-out countdown and a return button beside the destination. It clears
on unrelated navigation, rejects detached controls and handles departure without
a dead return link. Shared towns retain their read-only controls. Actual daily
recovery is shown without attributing it to the purchase. Recovery memories
remain part of the existing save/story system, not a second reward ledger.

Browser-skill verification used a disposable care study (no autosave): at
1280 x 720, followed the goal to Maya and Raincheck Coffee, renovated for 300
coins (3000 to 2700, quality 60 to 78), and checked unchanged happiness 30 and
two unhappy days. Thirty ordinary simulation minutes delivered her real meal
and first visit, still with unchanged recorded needs/mood. The daily review
raised happiness to 79, food to 100, cleared the countdown and created a recovery
memory. These initial concern/trip conditions are staged, not evidence that the
normal opening naturally reaches this scenario.

At 390 x 844, the new card initially pushed the close control below it. Fixed
its placement to preserve the existing sticky exit before the card, with a
regression assertion in both editable and visiting tests. The care study now
pauses its ordinary frame ticks independently of performance instrumentation,
so its explicit advance buttons can be tested without an overlay covering UI.
A clean phone repeat without renovation recovered from 30 to 78 at review,
returned to Maya and showed the personal recovery story after keyboard scrolling.
The different result is actual simulation output, not a prescribed target.
Browser warnings/errors were empty. This is viewport testing, not physical-phone
performance or a complete keyboard-accessibility audit.

Coverage includes destination eligibility, readonly navigation, individual needs,
help-session lifecycle and a real meal/review/save round trip. After the close
placement fix, 55 focused tests / four files and TypeScript passed. Production
build passed: 971.37 kB JS / 275.66 kB gzip; 26.13 kB CSS / 6.44 kB gzip. The
large-chunk warning remains. No player saves, commits, pushes or deployments
were changed. All eight broad acceptance areas remain open; this verifies one
care journey, not sustained playability or the whole requested visual direction.

## See who makes an opening successful

The previous care turn made verified implementation progress. The next pacing
check ran the existing six seeded, fifteen-minute guided studies: all passed,
with a first meal at roughly 63 seconds and 18-21 purchasing decisions. That is
an automated policy, not a human enjoyment finding. Inspection revealed a more
specific gap: first-sale/meal goals opened a mission list, and business panels
listed staff but did not identify the neighbors using the new place.

Opening goals now lead to the actual venue, preferring staffed businesses and
then real customer journeys/activity. Empty venues explain the staffing need.
Both shop and restaurant panels show neighbors already visiting and those on
their way as separate portrait groups. Arrival requires the matching physical
floor and activity; travel requires the matching destination and pending shop/
meal activity. Cancelled trips, work journeys, intertower commuters and equal
floor numbers in another tower are not invented customers. Classification is
read-only and never increments visits, takes payment or grants milestone coins.
Event guests are not included in these explicitly neighbor-labelled lists.

Customer cards reuse personal profiles and return-to-venue navigation, including
read-only shared towns. A stale departed customer's card refreshes its list.
Each group displays at most six name-sorted cards with the complete count and
remaining-neighbor message. Staff lists retain their existing behavior; someone
assigned here may also be a customer when their actual activity is a meal/shop.
Corrected the visible singular `1 visit` label as part of the opening payoff.

Browser-skill check used the normal, disposable opening study at 1280 x 720:
started with 300 coins, built the 100-coin apartments, advanced ordinary ticks
through the study controls, then bought the 142-coin grocery at two neighbors.
The first-sale goal opened The Corner Grocers, first showing its missing staff,
then its actual assigned clerk after time advanced. At four neighbors, bought
the 209-coin coffee shop and resumed the normal clock for its visual reveal.
At day 1, 14:35, Little Lantern Cafe had one paid visit and its 90-coin opening
memory. Otis appeared dining; Ava and Lulu appeared separately riding toward
the cafe, explicitly not yet counted as visits. Opened Otis's profile and its
real meal thought. At 390 x 844 returned to the cafe and opened Ava's incoming
profile; the cards, counts and return controls remained readable. No residents,
visits, balances or rewards were staged in this opening study. Paused stepping
compresses observation time, so this is not a naturalistic timed user session.

Eight initial regressions cover activity classification, goal routing, tower
isolation, navigation, stale customers and read-only behavior; the full suite
passed 690 tests / 95 files. After the singular visit copy and one additional
large-crowd regression, all 52 related tests / four files passed. TypeScript and
whitespace checks passed; final production build is 972.85 kB JS / 276.14 kB gzip
and 26.13 kB CSS / 6.44 kB gzip. Existing chunk warning remains. Browser warning/
error logs were empty and the viewport override was reset. No player saves,
commit, push or deployment changed. All eight broad acceptance areas remain
open; this connects a verified opening to its actual people rather than proving
the whole game's pacing, art direction or physical-device performance.

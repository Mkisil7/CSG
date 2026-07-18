# Tower Town 🏢

A cozy tower-town builder that runs in your browser. Inspired by Tiny Tower —
but instead of idle timers, it runs a **live simulation**: little residents
ride the lifts, go to work, climb career ladders, grab lunch, and even commute
between towers. Income comes from real foot traffic, so lift throughput is a
genuine gameplay constraint, not a cosmetic animation.

Free to play, no ads, no in-app purchases. Saves locally in your browser.

**Works offline.** It's an installable PWA: load it online once, then it runs
with no connection at all. On your phone or desktop, use your browser's "Add to
Home Screen" / "Install" option to launch it like a native app — no service
needed after the first visit.

## How to play

- **Build floors** with the bottom menu: Apartments bring residents; Shops,
  Restaurants, and Offices give them places to spend and work. Each business
  gets a **subtype** you pick when building — grocery/boutique/electronics,
  coffee/fast-food/fine-dining, tech/law/creative — with different costs,
  income, and appeal to different resident tastes.
- **Businesses are real**: an unstaffed business is closed (gray sign, dim
  lights, no customers). Quality grows or decays daily based on staffing,
  traffic, and staff seniority; the inspector shows each floor's letter grade
  and daily profit & loss. Residents pick where to shop by quality and taste.
  Want to steer it directly? Open any business and **Renovate** it (spend coins
  for an instant quality bump) or **Promote** a tenured worker into an open
  senior role on the spot instead of waiting for the daily review.
- **Click anything**: floors open an inspector (rename them! see the grade and
  who works there), residents show their job title, traits, and happiness,
  empty lots show the price of your next tower.
- **Getting around**: clicking a tower locks the camera onto it head-on — just
  scroll up and down to see every floor, no fiddly orbiting. Hit **Town view**
  to pull back and pan around the whole street, then click another tower to
  drop into it. Keeps things tidy as the town grows wide.
- **Careers are real**: residents start as Interns/Clerks/Servers and get
  promoted when tenure is met *and* a higher slot is free on their floor. Stay
  blocked too long and they'll jump ship to a promotion in another building —
  even another tower.
- **Keep them happy**: residents track housing, employment, food, and
  entertainment needs, plus lift waits and commute length. Happy residents
  spend more; miserable ones eventually **move out**.
- **Manage the lifts**: one cab per shaft. Buy speed tiers, and for a small
  fortune add a second shaft on the far side. Riders pick the shaft that will
  actually arrive first, and commuters leave home early enough to make their
  shift.
- **Grow the town**: unlock up to nine more lots along the street (ten in all)
  and raise a whole skyline of towers. Commute time scales with real distance
  between towers, so where you put the jobs matters.
- **Zone every new lot**: when you buy a lot you pick a municipal zone —
  Mixed-Use, Residential, Commercial, Office, Industrial, Transit-Oriented, or
  Open Space (a park) — and from then on you can only build *to code* there.
  Zoning is permanent, so plan the block. Your starting tower is Mixed-Use, and
  any town you built before zoning existed stays Mixed-Use, so nothing you
  already have becomes illegal.
- **Industry & supply chains**: Industrial lots host **Factories** (a new floor
  type with its own Line Worker → Foreman career). Staffed factories produce
  goods that give a quality boost to Commercial shops town-wide — electronics
  shops benefit most.
- **Parks**: an Open-Space lot builds no tower but lifts the mood of residents
  in nearby towers, and its lamp posts glow after dark.
- **Evenings are alive**: after work, residents keep going out — dinner at a
  restaurant, a drink at a Bar & Lounge, some evening shopping — re-deciding
  through the night until their (staggered) bedtimes, so the town's busiest,
  liveliest stretch is actually the evening rather than a dead screen once the
  shops close. **Night owls** (about a third of residents) stay out late; every
  window glows warm and park lamps come on after dark.
- **See what's wrong**: tap the Happiness meter for a breakdown of what's
  dragging the mood down (housing, jobs, food, entertainment, lift queues,
  commutes). Routine goings-on collect in an **Activity** feed instead of
  burying the screen in pop-ups.
- **Missions**: a checklist of 100+ milestones with coin rewards (🎯 in the
  menu) — population and wealth tiers, zoning goals, business grades, career
  promotions, happiness streaks, and more. Unfinished goals sort to the top.
- **Speed controls**: pause / 1× / 2× / 4× (top right). Come back later and
  get a "while you were away" report — the town keeps living without you (up
  to a cap).
- Income: rent from every resident, tier-multiplied wages from workers actually
  at work, and per-visit income scaled by business quality and shopper mood.
- Progress saves automatically to `localStorage`.

## Development

```bash
npm install
npm run dev      # dev server
npm test         # unit tests (elevator, economy, careers, town, save)
npm run build    # production build in dist/
npm run preview  # serve the production build
```

Built with [Three.js](https://threejs.org/), TypeScript, and Vite. The whole game
is static files — deploy `dist/` anywhere (GitHub Pages, itch.io, Vercel).

## Architecture

```
src/
  core/      # engine-independent simulation
    town.ts       # shared clock+wallet, tower slots, commute handoffs
    game.ts       # one tower: floors, lift shafts, residents inside it
    careers.ts    # hiring, tenure promotions, poach-switching
    elevator.ts   # per-shaft cab simulation: queueing, capacity, dispatch
    economy.ts    # traffic-driven income (visits, wages, rent)
    residents.ts  # daily-schedule "brain" incl. cross-tower commuting
  render/    # Three.js dollhouse cross-sections: floors, people, cabs, plots, parks
  input/     # raycast picking that coexists with the orbit camera
  ui/        # DOM overlay: HUD, build menu, inspector, toasts
  main.ts    # game loop wiring it all together
```

The `core/` modules have no Three.js dependency, so the simulation is fully
unit-testable (see `src/core/*.test.ts`).

Custom 3D models: drop `.glb` files under `public/models/` and point the
manifest in `src/render/assets.ts` at them — anything missing falls back to
the built-in procedural geometry automatically.

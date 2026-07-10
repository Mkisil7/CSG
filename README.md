# Tower Town 🏢

A cozy tower-town builder that runs in your browser. Inspired by Tiny Tower —
but instead of idle timers, it runs a **live simulation**: little residents
ride the lifts, go to work, climb career ladders, grab lunch, and even commute
between towers. Income comes from real foot traffic, so lift throughput is a
genuine gameplay constraint, not a cosmetic animation.

Free to play, no install, no ads, no in-app purchases. Saves locally in your browser.

## How to play

- **Build floors** with the bottom menu: Apartments bring residents; Shops,
  Restaurants, and Offices give them places to spend and work.
- **Click anything**: floors open an inspector (rename them! see who lives or
  works there), residents show their job title and tenure, empty lots show the
  price of your next tower.
- **Careers are real**: residents start as Interns/Clerks/Servers and get
  promoted when tenure is met *and* a higher slot is free on their floor. Stay
  blocked too long and they'll jump ship to a promotion in another building —
  even another tower.
- **Manage the lifts**: one cab per shaft. Buy speed tiers, and for a small
  fortune add a second shaft on the far side. Watch the average wait — when it
  climbs, your shops starve for visitors.
- **Grow the town**: unlock new lots along the street and raise more towers.
  Residents will commute to jobs in other towers (a real time cost), so a
  bedroom tower next to a jobs tower is a strategy — with a price.
- Income: rent from every resident, tier-multiplied wages from workers actually
  at work, and per-visit income when someone really walks into a shop or café.
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
  render/    # Three.js dollhouse cross-sections: floors, people, cabs, plots
  input/     # raycast picking that coexists with the orbit camera
  ui/        # DOM overlay: HUD, build menu, inspector, toasts
  main.ts    # game loop wiring it all together
```

The `core/` modules have no Three.js dependency, so the simulation is fully
unit-testable (see `src/core/*.test.ts`).

Custom 3D models: drop `.glb` files under `public/models/` and point the
manifest in `src/render/assets.ts` at them — anything missing falls back to
the built-in procedural geometry automatically.

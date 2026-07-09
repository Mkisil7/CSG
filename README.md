# Tower Town 🏢

A cozy vertical tower-builder that runs in your browser. Inspired by Tiny Tower —
but instead of idle timers, it runs a **live simulation**: little residents actually
ride the elevator, go to work, grab lunch, and shop. Shops earn money from real
foot traffic, so elevator throughput is a genuine gameplay constraint, not a
cosmetic animation.

Free to play, no install, no ads, no in-app purchases. Saves locally in your browser.

## How to play

- **Build floors** with the bottom menu: Apartments bring residents; Shops,
  Restaurants, and Offices give them places to spend and work.
- Residents follow daily schedules (home → work → lunch → shop → home), and every
  trip goes through the elevator.
- **Watch the average elevator wait.** When it climbs, your tower is congested —
  add elevator cars before your shops starve for visitors.
- Income: rent from every resident, wages from workers actually at work, and
  per-visit income when someone really walks into a shop or restaurant.
- Progress saves automatically to `localStorage`.

## Development

```bash
npm install
npm run dev      # dev server
npm test         # unit tests (elevator + economy logic)
npm run build    # production build in dist/
npm run preview  # serve the production build
```

Built with [Three.js](https://threejs.org/), TypeScript, and Vite. The whole game
is static files — deploy `dist/` anywhere (GitHub Pages, itch.io, Vercel).

## Architecture

```
src/
  core/      # engine-independent simulation: tower, elevator, residents, economy, save
  render/    # Three.js dollhouse cross-section: floors, characters, elevator cabs
  ui/        # DOM overlay: HUD chips, build menu, toasts
  main.ts    # game loop wiring it all together
```

The `core/` modules have no Three.js dependency, so the simulation is unit-testable
in isolation (see `src/core/*.test.ts`).

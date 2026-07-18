import { GAME_MINUTES_PER_SECOND, OFFLINE } from './core/types';
import { Town } from './core/town';
import { Game, isToastWorthy } from './core/game';
import { loadGame, saveGame, clearSave } from './core/save';
import { offlineGameMinutes, runOfflineCatchup } from './core/offline';
import {
  createScene,
  focusTower,
  focusTown,
  trackTowerHeight,
  updateDaylight,
} from './render/scene';
import { FloorViews } from './render/floors';
import { CharacterViews, ShaftRef } from './render/characters';
import { ElevatorViews } from './render/elevatorView';
import { PlotViews } from './render/plots';
import { preloadAssets } from './render/assets';
import {
  SHAFT_X,
  SHAFT_X_RIGHT,
  TOWER_SLOT_ORIGINS,
  WAIT_X,
  WAIT_X_RIGHT,
} from './render/layout';
import { PickingController } from './input/picking';
import { Hud, Toaster } from './ui/hud';
import { BuildMenu } from './ui/buildMenu';
import { Inspector } from './ui/inspector';
import { SpeedControl } from './ui/speedControl';
import { showOfflineModal } from './ui/offlineModal';
import { MISSION_DEFS } from './core/missions';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = createScene(canvas);
void preloadAssets();

const loaded = loadGame();
const town: Town = loaded?.town ?? new Town();

// Offline catch-up: simulate the time away (capped) and report what happened.
if (loaded && loaded.awayRealSeconds >= OFFLINE.minAwayRealSeconds) {
  const minutes = offlineGameMinutes(loaded.awayRealSeconds);
  const report = runOfflineCatchup(town, minutes, loaded.awayRealSeconds);
  showOfflineModal(document.getElementById('offline-modal')!, report);
}

interface TowerViewBundle {
  slotIndex: number;
  game: Game;
  floors: FloorViews;
  characters: CharacterViews;
  liftLeft: ElevatorViews;
  liftRight: ElevatorViews | null;
}

const bundles = new Map<string, TowerViewBundle>();
const plots = new PlotViews(ctx.scene);

function ensureBundles(): void {
  town.slots.forEach((slot, slotIndex) => {
    if (!slot.unlocked || !slot.game || bundles.has(slot.id)) return;
    const origin = TOWER_SLOT_ORIGINS[slotIndex];
    bundles.set(slot.id, {
      slotIndex,
      game: slot.game,
      floors: new FloorViews(ctx.scene, slot.id, origin),
      characters: new CharacterViews(ctx.scene, slot.id, origin),
      liftLeft: new ElevatorViews(ctx.scene, SHAFT_X, origin),
      liftRight: null,
    });
  });
}
ensureBundles();

// ---- camera focus state ---------------------------------------------------

let focusedSlot: number | null = 0; // start zoomed into the first tower
function focusedGame(): Game | null {
  if (focusedSlot === null) return null;
  return town.slots[focusedSlot]?.game ?? null;
}

function setFocus(slotIndex: number | null): void {
  focusedSlot = slotIndex;
  if (slotIndex === null) {
    const unlocked = town.slots.flatMap((s, i) => (s.unlocked ? [i] : []));
    focusTown(ctx, unlocked);
  } else {
    const game = town.slots[slotIndex]?.game;
    focusTower(ctx, slotIndex, game ? game.tower.floors.length : 1);
  }
}

// ---- UI ---------------------------------------------------------------------

const hud = new Hud(document.getElementById('hud')!, () =>
  inspector.select({ kind: 'happiness' }),
);
const toaster = new Toaster(document.getElementById('toast')!);
const speedControl = new SpeedControl(document.getElementById('speed-control')!);

const onChanged = () => {
  ensureBundles();
  saveGame(town);
};

const inspector = new Inspector(
  document.getElementById('inspector')!,
  () => town,
  () => {
    onChanged();
    // Focus a freshly bought tower so the player lands inside it.
    const newest = town.towers()[town.towers().length - 1];
    const idx = town.slots.findIndex((s) => s.id === newest.id);
    if (focusedSlot === null && idx >= 0) setFocus(idx);
  },
);

const buildMenu = new BuildMenu(
  document.getElementById('build-menu')!,
  focusedGame,
  toaster,
  onChanged,
  () => setFocus(focusedSlot === null ? 0 : null),
  () => inspector.select({ kind: 'missions' }),
  () => inspector.select({ kind: 'activity' }),
  () => {
    clearSave();
    location.reload();
  },
);

new PickingController(
  canvas,
  ctx.camera,
  () => [
    ...[...bundles.values()].flatMap((b) => [...b.floors.pickTargets(), ...b.characters.pickTargets()]),
    ...plots.pickTargets(),
  ],
  (result) => {
    if (!result) {
      inspector.select(null);
      return;
    }
    if (result.kind === 'resident') {
      inspector.select({ kind: 'resident', residentId: result.residentId });
      return;
    }
    if (result.kind === 'floor') {
      const slotIndex = town.slots.findIndex((s) => s.id === result.towerId);
      if (focusedSlot === slotIndex) {
        inspector.select({ kind: 'floor', towerId: result.towerId, level: result.floorLevel });
      } else {
        setFocus(slotIndex); // clicking a distant tower zooms into it
      }
      return;
    }
    // Ground pads: locked → purchase panel; unlocked → focus that tower.
    const slot = town.slots[result.slotIndex];
    if (slot?.unlocked) {
      setFocus(result.slotIndex);
      inspector.select(null);
    } else {
      inspector.select({ kind: 'slot', index: result.slotIndex });
    }
  },
);

// ---- main loop ----------------------------------------------------------------

let last = performance.now();
let saveTimer = 0;
let inspectorTimer = 0;

function frame(now: number): void {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // Speed control scales (or pauses) simulation; rendering always runs.
  town.tick(realDt * GAME_MINUTES_PER_SECOND * speedControl.effectiveMultiplier);
  // Routine events (visits, hires) go only to the Activity log; rare notable
  // events still pop a toast so they don't bury the screen — especially mobile.
  for (const event of town.events) {
    if (isToastWorthy(event.kind)) toaster.show(event.message);
  }

  ensureBundles();
  for (const bundle of bundles.values()) {
    const game = bundle.game;
    bundle.floors.setSecondShaft(!!game.secondElevator);
    bundle.floors.sync(game.tower.floors, game.staffedLevels);

    if (game.secondElevator && !bundle.liftRight) {
      bundle.liftRight = new ElevatorViews(
        ctx.scene,
        SHAFT_X_RIGHT,
        TOWER_SLOT_ORIGINS[bundle.slotIndex],
      );
    }
    bundle.liftLeft.sync(game.elevator);
    if (bundle.liftRight && game.secondElevator) bundle.liftRight.sync(game.secondElevator);

    const shafts: ShaftRef[] = [{ system: game.elevator, shaftX: SHAFT_X, waitX: WAIT_X }];
    if (game.secondElevator) {
      shafts.push({ system: game.secondElevator, shaftX: SHAFT_X_RIGHT, waitX: WAIT_X_RIGHT });
    }
    bundle.characters.sync(game.residents, shafts, realDt);
  }
  plots.sync(town);

  updateDaylight(ctx, town.timeOfDay);
  if (focusedSlot !== null) {
    const game = town.slots[focusedSlot]?.game;
    if (game) trackTowerHeight(ctx, focusedSlot, game.tower.floors.length);
  }

  hud.update(town, focusedGame());
  buildMenu.update(focusedSlot !== null, town.missions.completedCount, MISSION_DEFS.length);

  inspectorTimer += realDt;
  if (inspectorTimer > 0.25) {
    inspectorTimer = 0;
    inspector.refresh();
  }

  saveTimer += realDt;
  if (saveTimer > 15) {
    saveTimer = 0;
    saveGame(town);
  }

  ctx.controls.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(frame);
}

setFocus(0);
requestAnimationFrame(frame);

window.addEventListener('beforeunload', () => saveGame(town));

// Debug/testing hook (harmless in production; state is local-only anyway).
(window as unknown as { __town: Town }).__town = town;

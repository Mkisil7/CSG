import { GAME_MINUTES_PER_SECOND, OFFLINE } from './core/types';
import { Town } from './core/town';
import { Game, isToastWorthy } from './core/game';
import { loadGame, saveGame, clearSave } from './core/save';
import { decodeGift, decodeTown, isGiftRedeemed } from './core/share';
import { offlineGameMinutes, runOfflineCatchup } from './core/offline';
import {
  createScene,
  enterTowerLock,
  exitTowerLock,
  isTowerLocked,
  updateDaylight,
  updateTowerCam,
} from './render/scene';
import { FloorViews, setWindowGlow } from './render/floors';
import { CharacterViews, ShaftRef } from './render/characters';
import { ElevatorViews } from './render/elevatorView';
import { PlotViews } from './render/plots';
import { ParkView } from './render/parks';
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
import { openSocialPanel, showGiftAccept, showVisitingBanner } from './ui/social';
import { MISSION_DEFS } from './core/missions';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = createScene(canvas);
void preloadAssets();

// Register the service worker so the game installs and runs fully offline.
// Production only, so `npm run dev`'s unhashed modules are never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline support is a progressive enhancement — ignore registration failures.
    });
  });
}

interface TowerViewBundle {
  slotIndex: number;
  game: Game;
  floors: FloorViews;
  characters: CharacterViews;
  liftLeft: ElevatorViews;
  liftRight: ElevatorViews | null;
}

void start();

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);

  // Visiting a friend's shared town (read-only) or playing our own.
  const visitCode = params.get('visit');
  const visited = visitCode ? await decodeTown(visitCode) : null;
  if (visitCode && !visited) {
    // Bad/old code — fall back to our own town below.
    history.replaceState(null, '', location.pathname);
  }
  const visiting = visited !== null;
  const loaded = visiting ? null : loadGame();
  const town: Town = visited ?? loaded?.town ?? new Town();

  // Offline catch-up (own town only): simulate time away and report it.
  if (loaded && loaded.awayRealSeconds >= OFFLINE.minAwayRealSeconds) {
    const minutes = offlineGameMinutes(loaded.awayRealSeconds);
    const report = runOfflineCatchup(town, minutes, loaded.awayRealSeconds);
    showOfflineModal(document.getElementById('offline-modal')!, report);
  }

  const persist = () => {
    if (!visiting) saveGame(town);
  };

  const bundles = new Map<string, TowerViewBundle>();
  const parkViews = new Map<string, ParkView>();
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

  /** A park lot is unlocked but has no tower/game; give it a ParkView. */
  function ensureParkViews(): void {
    town.slots.forEach((slot, slotIndex) => {
      if (!slot.unlocked || slot.game || parkViews.has(slot.id)) return;
      parkViews.set(slot.id, new ParkView(ctx.scene, TOWER_SLOT_ORIGINS[slotIndex]));
    });
  }
  ensureParkViews();

  // ---- camera focus state -------------------------------------------------

  let focusedSlot: number | null = 0; // start zoomed into the first tower
  function focusedGame(): Game | null {
    if (focusedSlot === null) return null;
    return town.slots[focusedSlot]?.game ?? null;
  }

  function setFocus(slotIndex: number | null): void {
    focusedSlot = slotIndex;
    if (slotIndex === null) {
      const unlocked = town.slots.flatMap((s, i) => (s.unlocked ? [i] : []));
      exitTowerLock(ctx, unlocked);
    } else {
      const game = town.slots[slotIndex]?.game;
      enterTowerLock(ctx, slotIndex, game ? game.tower.floors.length : 1);
    }
  }

  // ---- UI -----------------------------------------------------------------

  const hud = new Hud(document.getElementById('hud')!, () =>
    inspector.select({ kind: 'happiness' }),
  );
  const toaster = new Toaster(document.getElementById('toast')!);
  const speedControl = new SpeedControl(document.getElementById('speed-control')!);

  const onChanged = () => {
    ensureBundles();
    persist();
  };

  const inspector = new Inspector(
    document.getElementById('inspector')!,
    () => town,
    () => {
      onChanged();
      const newest = town.towers()[town.towers().length - 1];
      const idx = town.slots.findIndex((s) => s.id === newest?.id);
      if (focusedSlot === null && idx >= 0) setFocus(idx);
    },
    visiting, // read-only when visiting a friend's town
  );

  const buildMenuEl = document.getElementById('build-menu')!;
  let buildMenu: BuildMenu | null = null;
  if (visiting) {
    // No building in someone else's town — swap the build bar for a banner.
    buildMenuEl.style.display = 'none';
    showVisitingBanner(() => {
      location.href = location.origin + location.pathname;
    });
  } else {
    buildMenu = new BuildMenu(
      buildMenuEl,
      focusedGame,
      toaster,
      onChanged,
      () => setFocus(focusedSlot === null ? 0 : null),
      () => inspector.select({ kind: 'missions' }),
      () => inspector.select({ kind: 'activity' }),
      () => openSocialPanel(town, (m) => toaster.show(m)),
      () => {
        clearSave();
        location.href = location.origin + location.pathname;
      },
    );
  }

  new PickingController(
    canvas,
    ctx.camera,
    () => [
      ...[...bundles.values()].flatMap((b) => [
        ...b.floors.pickTargets(),
        ...b.characters.pickTargets(),
      ]),
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
      const slot = town.slots[result.slotIndex];
      if (slot?.unlocked && slot.game) {
        setFocus(result.slotIndex);
        inspector.select(null);
      } else {
        inspector.select({ kind: 'slot', index: result.slotIndex });
      }
    },
  );

  // A friend's gift link (own town only): offer to accept it.
  if (!visiting) {
    const giftCode = params.get('gift');
    if (giftCode) {
      const gift = decodeGift(giftCode);
      if (gift && !isGiftRedeemed(gift.nonce)) {
        showGiftAccept(town, gift, () => {});
      }
      history.replaceState(null, '', location.pathname);
    }
  }

  // ---- main loop ----------------------------------------------------------

  let last = performance.now();
  let saveTimer = 0;
  let inspectorTimer = 0;

  function frame(now: number): void {
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;

    town.tick(realDt * GAME_MINUTES_PER_SECOND * speedControl.effectiveMultiplier);
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

    const daylight = updateDaylight(ctx, town.timeOfDay);
    setWindowGlow(daylight);
    ensureParkViews();
    for (const park of parkViews.values()) park.updateNight(daylight);

    hud.update(town, focusedGame());
    buildMenu?.update(focusedSlot !== null, town.missions.completedCount, MISSION_DEFS.length);

    inspectorTimer += realDt;
    if (inspectorTimer > 0.25) {
      inspectorTimer = 0;
      inspector.refresh();
    }

    saveTimer += realDt;
    if (saveTimer > 15) {
      saveTimer = 0;
      persist();
    }

    if (isTowerLocked() && focusedSlot !== null) {
      const game = town.slots[focusedSlot]?.game;
      updateTowerCam(ctx, game ? game.tower.floors.length : 1);
    } else {
      ctx.controls.update();
    }
    ctx.renderer.render(ctx.scene, ctx.camera);
    requestAnimationFrame(frame);
  }

  setFocus(0);
  requestAnimationFrame(frame);

  window.addEventListener('beforeunload', persist);

  // Debug/testing hook (harmless in production; state is local-only anyway).
  (window as unknown as { __town: Town }).__town = town;
}

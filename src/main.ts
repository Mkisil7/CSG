import { GAME_MINUTES_PER_SECOND, OFFLINE } from './core/types';
import { Town } from './core/town';
import { FrameClock } from './core/frameClock';
import { Game } from './core/game';
import { readGame, SaveSession } from './core/save';
import { decodeGift, decodeTown } from './core/share';
import { offlineGameMinutes, runOfflineCatchupAsync, type OfflineReport } from './core/offline';
import {
  createScene,
  enterTowerLock,
  lookAtFloor,
  exploreRoom,
  zoomRoom,
  panRoom,
  resetTowerView,
  roomViewState,
  navigateTowerKey,
  exitTowerLock,
  isTowerLocked,
  renderScene,
  updateDaylight,
  updateTowerCam,
  updateTownCam,
  setSceneInset,
  IS_COARSE_POINTER,
} from './render/scene';
import { Fireworks } from './render/fireworks';
import { FloorViews, setWindowGlow } from './render/floors';
import { CharacterViews, ShaftRef } from './render/characters';
import { ElevatorViews } from './render/elevatorView';
import { PlotViews } from './render/plots';
import { ParkView } from './render/parks';
import { preloadAssets } from './render/assets';
import {
  FLOOR_HEIGHT,
  SHAFT_X,
  SHAFT_X_RIGHT,
  TOWER_SLOT_ORIGINS,
  WAIT_X,
  WAIT_X_RIGHT,
} from './render/layout';
import { PickingController } from './input/picking';
import { EventTicker, Hud, Toaster } from './ui/hud';
import { BuildMenu } from './ui/buildMenu';
import { Inspector } from './ui/inspector';
import { SpeedControl } from './ui/speedControl';
import { showOfflineModal, showCatchupProgress } from './ui/offlineModal';
import { openSocialPanel, showGiftAccept, showVisitingBanner, isSocialDialogOpen } from './ui/social';
import { MISSION_DEFS } from './core/missions';
import { TownJournal } from './ui/townJournal';
import { QueueViews } from './render/queueViews';
import { Soundscape } from './audio/soundscape';
import { concertLevel } from './audio/design';
import { createPostcard, showPostcard } from './ui/postcard';
import { capturePostcard } from './render/postcard';
import { WeatherViews } from './render/weather';
import { NeighborhoodViews } from './render/neighborhood';
import { RoomLifeViews } from './render/roomLife';
import { visualDelta } from './render/motion';
import { RoomControls, roomCaption } from './ui/roomControls';
import { SaveStatus, showLoadFailure } from './ui/saveStatus';

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
  roomLife: RoomLifeViews;
  liftLeft: ElevatorViews;
  liftRight: ElevatorViews | null;
  queues: QueueViews;
}

void start();

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const previewModule: {
    createPreviewTown(): Town;
    mountPreview(town: Town, focusRoom?: (level: number) => void, persist?: () => void): void;
    storage?: Storage;
    revealDelta?: (dt: number, paused: boolean) => number;
    openingReducedMotion?: () => boolean | undefined;
    awayRealSeconds?: () => number;
    isPaused?: () => boolean;
  } | null = import.meta.env.DEV && (params.get('preview') === 'weather' || params.get('preview') === 'sound') ? await import('./dev/weatherPreview') :
    import.meta.env.DEV && params.get('preview') === 'neighborhood' ? await import('./dev/neighborhoodPreview') :
    import.meta.env.DEV && params.get('preview') === 'hosts' ? await import('./dev/hostPreview') :
    import.meta.env.DEV && params.get('preview') === 'care' ? await import('./dev/carePreview') :
    import.meta.env.DEV && params.get('preview') === 'opening' ? await import('./dev/openingPreview') :
    import.meta.env.DEV && params.get('preview') === 'return' ? await import('./dev/returnPreview') :
    import.meta.env.DEV && params.get('preview') === 'saving' ? await import('./dev/savePreview') :
    import.meta.env.DEV && params.get('preview') === 'persistence' ? await import('./dev/persistencePreview') :
    import.meta.env.DEV && params.get('preview') === 'landmark-save' ? await import('./dev/landmarkPersistencePreview') :
    import.meta.env.DEV && params.get('preview') === 'rooms' ? await import('./dev/roomPreview') :
    import.meta.env.DEV && params.get('preview') === 'construction' ? await import('./dev/constructionPreview') :
    import.meta.env.DEV && params.get('preview') === 'trades' ? await import('./dev/tradePreview') :
    import.meta.env.DEV && params.get('preview') === 'transit' ? await import('./dev/transitPreview') :
    import.meta.env.DEV && params.get('preview') === 'landmarks' ? await import('./dev/landmarkPreview') : null;

  // Visiting a friend's shared town (read-only) or playing our own.
  const visitCode = params.get('visit');
  const visited = visitCode && !previewModule ? await decodeTown(visitCode) : null;
  if (visitCode && !visited) {
    // Bad/old code — fall back to our own town below.
    history.replaceState(null, '', location.pathname);
  }
  const visiting = visited !== null;
  const storage = previewModule?.storage;
  let savingEnabled = !visiting && (!previewModule || !!storage);
  let read = savingEnabled ? readGame(storage) : { status: 'empty' as const };
  while (read.status === 'invalid' || read.status === 'unavailable') {
    const choice = await showLoadFailure(document.getElementById('save-status')!, read.status);
    if (choice === 'temporary') { savingEnabled = false; break; }
    read = readGame(storage);
  }
  const loaded = read.status === 'loaded' ? read.result : null;
  const town: Town = visited ?? loaded?.town ?? previewModule?.createPreviewTown() ?? new Town();
  const saveSession = new SaveSession(town, savingEnabled, storage);
  const saveStatus = !visiting && (!previewModule || !!storage) ? new SaveStatus(document.getElementById('save-status')!, () => town,
    savingEnabled ? () => saveSession.save() === true : null) : null;
  const persist = () => { const saved = saveSession.save(); if (saved !== null) saveStatus?.report(saved); };
  previewModule?.mountPreview(town, (level: number) => { setFocus(0); lookAtFloor(level); }, persist);
  const performanceStudy = import.meta.env.DEV && previewModule && params.has('metrics') ?
    (await import('./dev/performanceStudy')).mountPerformanceStudy(ctx.renderer) : null;

  // Offline catch-up (own town only): simulate time away and report it.
  let returnReport: OfflineReport | undefined;
  const awayRealSeconds = loaded?.awayRealSeconds ?? previewModule?.awayRealSeconds?.() ?? 0;
  if (awayRealSeconds >= OFFLINE.minAwayRealSeconds) {
    const progress = showCatchupProgress(document.getElementById('offline-modal')!);
    try {
      returnReport = await runOfflineCatchupAsync(town, offlineGameMinutes(awayRealSeconds), awayRealSeconds,
        { signal: progress.signal, onProgress: progress.update });
    } finally { progress.finish(); }
    // Persist processed time/rewards before the player can refresh this report.
    if (loaded) persist();
  }

  const bundles = new Map<string, TowerViewBundle>();
  const parkViews = new Map<string, ParkView>();
  const plots = new PlotViews(ctx.scene);
  const fireworks = new Fireworks(ctx.scene);
  const weatherViews = new WeatherViews(ctx.scene, IS_COARSE_POINTER);
  const neighborhoodViews = new NeighborhoodViews(ctx.scene);
  const soundscape = new Soundscape(document.getElementById('sound-control')!);
  if (import.meta.env.DEV && params.get('preview') === 'sound') {
    (await import('./dev/soundPreview')).mountSoundPreview(soundscape);
  }

  function ensureBundles(): void {
    town.slots.forEach((slot, slotIndex) => {
      if (!slot.unlocked || !slot.game || bundles.has(slot.id)) return;
      const origin = TOWER_SLOT_ORIGINS[slotIndex];
      bundles.set(slot.id, {
        slotIndex,
        game: slot.game,
        floors: new FloorViews(ctx.scene, slot.id, origin),
        characters: new CharacterViews(ctx.scene, slot.id, origin),
        roomLife: new RoomLifeViews(ctx.scene, slot.id, origin),
        liftLeft: new ElevatorViews(ctx.scene, SHAFT_X, origin),
        liftRight: null,
        queues: new QueueViews(ctx.scene, origin),
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

  function hostCount(towerId: string): number {
    return town.homeResidentsOf(towerId).filter((resident) => resident.townRole === 'Neighborhood host').length;
  }

  function frameSlots() {
    return town.slots.flatMap((slot, index) => slot.unlocked ? [{ index, floors: slot.game?.tower.floors.length ?? 0, hosts: hostCount(slot.id) }] : []);
  }

  function setFocus(slotIndex: number | null): void {
    focusedSlot = slotIndex;
    if (slotIndex === null) {
      const unlocked = frameSlots();
      exitTowerLock(ctx, unlocked);
    } else {
      const game = town.slots[slotIndex]?.game;
      enterTowerLock(ctx, slotIndex, game ? game.tower.floors.length : 1, hostCount(town.slots[slotIndex].id));
    }
  }

  // ---- UI -----------------------------------------------------------------

  const hud = new Hud(document.getElementById('hud')!, () => inspector.select({ kind: 'happiness' }), () => {
    const game = focusedGame() ?? town.towers().slice().sort((a, b) => b.averageWait() - a.averageWait())[0];
    if (game) inspector.select({ kind: 'transit', towerId: game.id });
  });
  const toaster = new Toaster(document.getElementById('toast')!, (kind) => {
    inspector.select({ kind });
    const panel = document.getElementById('inspector')!;
    panel.tabIndex = -1; panel.focus({ preventScroll: true });
  }, () => canvas.focus({ preventScroll: true }));
  const eventTicker = new EventTicker(document.getElementById('event-ticker')!, () => inspector.select({ kind: 'neighborhood' }));
  const speedControl = new SpeedControl(document.getElementById('speed-control')!);

  const onChanged = () => {
    ensureBundles();
    const game = focusedGame();
    const previousFloors = game ? bundles.get(game.id)?.floors.renderedFloorCount : undefined;
    if (game && previousFloors !== undefined && previousFloors > 0 && game.tower.floors.length > previousFloors) {
      lookAtFloor(game.tower.floors.length - 1);
    }
    persist();
  };

  let inspectorTowerCount = town.towers().length;
  const inspector = new Inspector(
    document.getElementById('inspector')!,
    () => town,
    () => {
      onChanged();
      const newest = town.towers()[town.towers().length - 1];
      const idx = town.slots.findIndex((s) => s.id === newest?.id);
      if (town.towers().length > inspectorTowerCount && focusedSlot === null && idx >= 0) setFocus(idx);
      inspectorTowerCount = town.towers().length;
    },
    visiting, // read-only when visiting a friend's town
    () => {
      const detail = roomViewState().active;
      try {
        const slots = frameSlots();
        const postcard = capturePostcard(ctx, slots, (source) => createPostcard(source, town), {
          overview: () => { for (const bundle of bundles.values()) bundle.floors.setRoomDetail(false); },
          restore: () => { for (const bundle of bundles.values()) bundle.floors.setRoomDetail(detail && bundle.slotIndex === focusedSlot); },
        });
        showPostcard(postcard, town.identity.name);
      } catch {
        toaster.show('The postcard could not be created. Your town is unchanged; please try again.');
      }
    },
    (id, level) => { const index = town.slots.findIndex((s) => s.id === id); if (index >= 0) { setFocus(index); if (level !== undefined) lookAtFloor(level); } },
    (id, level) => {
      const index = town.slots.findIndex((slot) => slot.id === id);
      if (index < 0) return;
      setFocus(index); exploreRoom(level); canvas.focus({ preventScroll: true });
    },
  );
  const roomControls = new RoomControls(canvas, { state: () => {
    const game = focusedGame();
    return { ...roomViewState(), label: roomCaption(game?.tower.floors ?? [], ctx.controls.target.y, game?.name ?? '') };
  }, zoom: zoomRoom, pan: panRoom, reset: resetTowerView,
    key: (key) => navigateTowerKey(key, ctx.controls.target.y) });
  const returnDialog = returnReport ? showOfflineModal(document.getElementById('offline-modal')!, returnReport, (openJournal) => {
    if (openJournal) {
      inspector.select({ kind: 'journal' });
      const panel = document.getElementById('inspector')!;
      panel.tabIndex = -1; panel.focus({ preventScroll: true });
    } else canvas.focus({ preventScroll: true });
  }) : null;

  const buildMenuEl = document.getElementById('build-menu')!;
  const journal = new TownJournal(document.getElementById('town-journal')!, (target) => {
    if (target.kind === 'build') {
      const index = town.slots.findIndex((s) => s.id === target.towerId);
      if (index >= 0) setFocus(index);
      inspector.select(null);
      if (!visiting) buildMenu?.showBuildOptions(target.floorType);
      return;
    }
    if (target.kind === 'floor' || target.kind === 'transit') {
      const index = town.slots.findIndex((s) => s.id === target.towerId);
      if (index >= 0) setFocus(index);
      if (index >= 0 && target.kind === 'floor') lookAtFloor(target.level);
    } else if (target.kind === 'resident') {
      const resident = town.allResidents().find((r) => r.id === target.residentId);
      const index = town.slots.findIndex((s) => s.id === resident?.homeTowerId);
      if (index >= 0) setFocus(index);
    } else if (target.kind === 'slot') {
      const slot = town.slots[target.index];
      setFocus(slot?.unlocked && slot.zone === 'park' ? target.index : null);
    } else if (target.kind === 'town') setFocus(null);
    inspector.select(target);
    if (target.kind === 'floor' || target.kind === 'slot') {
      const panel = document.getElementById('inspector')!;
      panel.tabIndex = -1; panel.focus({ preventScroll: true });
    }
  }, () => inspector.select({ kind: 'journal' }), () => { setFocus(null); inspector.select({ kind: 'town' }); }, (inset) => setSceneInset(ctx, inset));
  journal.update(town);
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
      () => openSocialPanel(town, (m) => toaster.show(m), savingEnabled, storage, (saved) => saveStatus?.report(saved)),
      () => {
        if (!previewModule || storage) {
          if (!savingEnabled) { toaster.show('Your original save is protected. Reload to retry opening it.'); return; }
          if (!saveSession.reset()) { saveStatus?.report(false); toaster.show('Could not clear the save. Your town is still open.'); return; }
          // The unload handler must not immediately put the cleared town back.
          savingEnabled = false;
        }
        location.href = previewModule ? location.href : location.origin + location.pathname;
      },
      () => { const game = focusedGame(); if (game) inspector.select({ kind: 'landmarks', towerId: game.id }); },
    );
  }

  new PickingController(
    canvas,
    ctx.camera,
    () => [
      ...[...bundles.values()].flatMap((b) => [
        ...b.floors.pickTargets(),
        ...b.characters.pickTargets(),
        ...b.roomLife.pickTargets(),
      ]),
      ...plots.pickTargets(),
      ...neighborhoodViews.pickTargets(),
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
  if (savingEnabled) {
    const giftCode = params.get('gift');
    if (giftCode) {
      const gift = decodeGift(giftCode);
      if (gift) {
        showGiftAccept(town, gift, () => {}, storage, (saved) => saveStatus?.report(saved));
      }
      params.delete('gift');
      history.replaceState(null, '', location.pathname + (previewModule ? `?${params}` : ''));
    }
  }

  // ---- main loop ----------------------------------------------------------

  const frameClock = new FrameClock();
  let saveTimer = 0;
  let inspectorTimer = 0;

  function frame(now: number): void {
    performanceStudy?.begin(now);
    const realDt = frameClock.step(now);

    const simulationSpeed = returnDialog?.open || saveStatus?.isOpen || isSocialDialogOpen() || previewModule?.isPaused?.() || performanceStudy?.paused ? 0 : speedControl.effectiveMultiplier;
    if (simulationSpeed > 0) {
      town.tick(realDt * GAME_MINUTES_PER_SECOND * simulationSpeed);
      toaster.showEvents(town.events);
    }

    ensureBundles();
    const revealPaused = simulationSpeed === 0 || document.hidden;
    const motionDt = visualDelta(realDt, simulationSpeed > 0, !document.hidden);
    const revealDt = previewModule?.revealDelta ? previewModule.revealDelta(realDt, revealPaused) : motionDt;
    for (const bundle of bundles.values()) {
      const game = bundle.game;
      bundle.floors.setRoomDetail(roomViewState().active && bundle.slotIndex === focusedSlot);
      bundle.floors.setAppearance(game.architecture, town.identity.unlocked, game.name);
      bundle.floors.setSecondShaft(!!game.secondElevator);
      const openings = bundle.floors.sync(game.tower.floors, game.staffedLevels, revealDt,
        import.meta.env.DEV ? previewModule?.openingReducedMotion?.() : undefined);
      if (game === town.towers()[0]) bundle.floors.syncMilestones(town.missions.completed);
      bundle.floors.updateSnow(town.weather.snow);
      for (const floor of openings) soundscape.opening(floor);

      if (game.secondElevator && !bundle.liftRight) {
        bundle.liftRight = new ElevatorViews(
          ctx.scene,
          SHAFT_X_RIGHT,
          TOWER_SLOT_ORIGINS[bundle.slotIndex],
        );
      }
      bundle.liftLeft.sync(game.elevator, bundle.floors.isFloorReady);
      if (bundle.liftRight && game.secondElevator) bundle.liftRight.sync(game.secondElevator, bundle.floors.isFloorReady);

      const shafts: ShaftRef[] = [{ system: game.elevator, shaftX: SHAFT_X, waitX: WAIT_X }];
      if (game.secondElevator) {
        shafts.push({ system: game.secondElevator, shaftX: SHAFT_X_RIGHT, waitX: WAIT_X_RIGHT });
      }
      bundle.characters.sync([...game.residents, ...game.visitors], shafts, motionDt, town.time, town.weather.kind, game.tower.floors, bundle.floors.isFloorReady, town.homeResidentsOf(game.id));
      bundle.roomLife.sync(game.tower.floors, game.residents, town.homeResidentsOf(game.id), town.time, motionDt, bundle.floors.isFloorReady);
      bundle.queues.sync(game, town.time, bundle.floors.isFloorReady);
    }
    plots.sync(town);
    neighborhoodViews.sync(town, motionDt);

    const daylight = updateDaylight(ctx, town.timeOfDay, weatherViews.cloudCover);
    for (const bundle of bundles.values()) {
      bundle.floors.updateLighting(daylight, [...bundle.game.residents, ...bundle.game.visitors], town.timeOfDay);
    }
    weatherViews.update(town, ctx.controls.target, daylight, motionDt, focusedSlot === null);
    ctx.landscape.update(town, daylight);
    setWindowGlow(daylight);
    const viewWidth = 2 * ctx.camera.position.distanceTo(ctx.controls.target) *
      Math.tan(ctx.camera.fov * Math.PI / 360) * Math.min(1, ctx.camera.aspect);
    soundscape.update({ daylight, timeOfDay: town.timeOfDay, viewWidth, population: town.population, weather: town.weather.kind });
    let concertProximity = 0;
    if (town.timeOfDay >= 1020 && town.timeOfDay < 1320) {
      for (const event of town.neighborhood.active('band')) {
        const park = TOWER_SLOT_ORIGINS[event.parkIndex!];
        const distance = Math.hypot(park.x - ctx.camera.position.x, ctx.camera.position.y, park.z - ctx.camera.position.z);
        concertProximity = Math.max(concertProximity, concertLevel(distance));
      }
    }
    soundscape.concert(concertProximity);
    ensureParkViews();
    for (const park of parkViews.values()) park.updateNight(daylight, town.weather.snow);
    let skylineHeight = 12;
    for (const bundle of bundles.values()) {
      if (Math.abs(TOWER_SLOT_ORIGINS[bundle.slotIndex].x - ctx.controls.target.x) < 65) {
        skylineHeight = Math.max(skylineHeight, bundle.game.tower.floors.length * FLOOR_HEIGHT);
      }
    }
    fireworks.update(town.neighborhood.active('festival').length > 0,
      1 - daylight, ctx.controls.target.x, motionDt, skylineHeight);

    hud.update(town, focusedGame());
    eventTicker.update(town);
    buildMenu?.update(focusedSlot !== null, town.missions.completedCount, MISSION_DEFS.length);

    inspectorTimer += realDt;
    if (inspectorTimer > 0.25) {
      inspectorTimer = 0;
      inspector.refresh();
      journal.update(town);
    }

    saveTimer += realDt;
    if (saveTimer > 15) {
      saveTimer = 0;
      persist();
    }

    if (isTowerLocked() && focusedSlot !== null) {
      const game = town.slots[focusedSlot]?.game;
      updateTowerCam(ctx, game ? game.tower.floors.length : 1, hostCount(town.slots[focusedSlot].id));
    } else {
      updateTownCam(ctx, frameSlots());
      ctx.controls.update();
    }
    roomControls.update(inspector.current !== null);
    renderScene(ctx);
    performanceStudy?.end(now);
    requestAnimationFrame(frame);
  }

  setFocus(0);
  requestAnimationFrame(frame);

  window.addEventListener('beforeunload', persist);
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

  // Debug/testing hook (harmless in production; state is local-only anyway).
  (window as unknown as { __town: Town }).__town = town;
}

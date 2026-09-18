import { afterEach, describe, expect, it, vi } from 'vitest';
import { Town } from './town';
import { Game } from './game';
import { buildLandmark, landmarkOffer } from './landmarks';
import { createResident, maybeEveningOuting, resetDailyFlags } from './residents';
import { MISSION_DEFS } from './missions';
import { toSaveData, townFromSaveData } from './save';
import { encodeTown, decodeTown } from './share';
import { attractiveness } from './identity';
import { visibleGoals } from './goals';
import { roomPoses } from './roomLife';
import { updateHappinessAndEvict } from './happiness';

function fixture() {
  const town = new Town(), game = town.towers()[0];
  town.economy.coins = 50000; town.time = 1080;
  for (let i = 0; i < 8; i++) game.tower.addFloor('residential');
  game.residents = Array.from({ length: 32 }, (_, i) => createResident(1 + Math.floor(i / 4), game.id));
  town.missions.completed = new Set(MISSION_DEFS.slice(0, 12).map((m) => m.id));
  town.slots[1] = { id: 't1', unlocked: true, zone: 'park', game: null };
  return { town, game };
}
afterEach(() => { vi.restoreAllMocks(); });

describe('earned public landmarks', () => {
  it('requires actual milestones and keeps earned permits when a population later falls', () => {
    const town = new Town(); town.economy.coins = 50000;
    expect(landmarkOffer(town, 't0', 'conservatory')).toMatchObject({ ok: false, reason: 'Welcome 12 neighbors and open a park' });
    expect(landmarkOffer(town, 't0', 'gallery').ok).toBe(false);
    const { town: grown, game } = fixture();
    grown.identity.update(grown); game.residents = [];
    expect(landmarkOffer(grown, 't0', 'observatory').ok).toBe(true);
    const restored = townFromSaveData(toSaveData(grown))!;
    expect(landmarkOffer(restored, 't0', 'observatory').ok).toBe(true);
  });

  it('appends one chosen floor, charges exactly once and never evicts people or replaces a floor', () => {
    const { town, game } = fixture(), before = [...game.tower.floors], coins = town.economy.coins;
    const cost = landmarkOffer(town, game.id, 'conservatory').cost;
    expect(buildLandmark(town, game.id, 'conservatory')).toBe(true);
    expect(game.tower.floors.slice(0, before.length)).toEqual(before);
    expect(game.tower.floors[game.tower.height - 1]).toMatchObject({ type: 'landmark', landmark: 'conservatory', name: 'Sky Conservatory', landmarkVisits: 0 });
    expect(town.population).toBe(32); expect(game.tower.homeCapacity()).toBe(32);
    expect(town.economy.coins).toBe(coins - cost);
    expect(buildLandmark(town, game.id, 'gallery')).toBe(false);
    expect(town.economy.coins).toBe(coins - cost);
    expect(game.buildFloor('landmark')).toBe(false);
    expect(town.stories.journal.some((s) => s.title.includes('Sky Conservatory opened'))).toBe(true);
    expect(town.stories.journal.find(s => s.title.includes('Sky Conservatory opened'))?.place)
      .toEqual({ kind: 'floor', towerId: game.id, level: game.tower.height - 1 });
  });

  it('rejects unaffordable, short observatory, invalid and non-public-zone builds without charging', () => {
    const { town, game } = fixture();
    game.tower.floors = game.tower.floors.slice(0, 4);
    expect(landmarkOffer(town, game.id, 'observatory').reason).toContain('8 floors');
    town.economy.coins = 1;
    expect(buildLandmark(town, game.id, 'gallery')).toBe(false); expect(town.economy.coins).toBe(1);
    town.economy.coins = 50000;
    for (const zone of ['office', 'industrial', 'commercial', 'residential'] as const) {
      town.slots[2] = { id: 't2', unlocked: true, zone, game: new Game('t2', town.economy, zone) };
      expect(buildLandmark(town, 't2', 'gallery')).toBe(false);
    }
    expect(buildLandmark(town, 't1', 'gallery')).toBe(false);
    expect(buildLandmark(town, 'absent', 'gallery')).toBe(false);
    expect(town.economy.coins).toBe(50000);
  });

  it('offers up to five visible ambitions and gives civic attractiveness rather than fake commerce', () => {
    const { town, game } = fixture();
    const before = attractiveness(town), goals = visibleGoals(town);
    expect(goals.length).toBeLessThanOrEqual(5);
    expect(goals.some((g) => g.target.kind === 'landmarks')).toBe(true);
    buildLandmark(town, game.id, 'gallery');
    const after = attractiveness(town);
    expect(after.greenery - before.greenery).toBe(3);
    expect(after.diversity).toBe(before.diversity); expect(after.quality).toBe(before.quality);
    expect(visibleGoals(town).some((g) => g.target.kind === 'landmarks')).toBe(false);
  });

  it('plans a real lift trip and credits free leisure only on physical arrival, once per day', () => {
    const { town, game } = fixture(); buildLandmark(town, game.id, 'gallery');
    const floor = game.tower.floors[game.tower.height - 1], resident = game.residents[0]; game.residents = [resident];
    resident.didDinner = resident.didShop = resident.didNightlife = true; resident.needs.entertainment = 40;
    resident.state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 1080 };
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const coins = town.economy.coins;
    game.tick(0, 1080);
    expect(resident.state.kind).toBe('waiting'); expect(resident.pendingActivity?.activity.kind).toBe('leisure');
    expect(resident.didLandmark).not.toBe(true); expect(floor.visitsToday).toBe(0);
    for (let minute = 1; minute <= 65; minute++) { town.time = 1080 + minute; game.tick(1, town.time); }
    expect(resident.didLandmark).toBe(true); expect(floor.visitsToday).toBe(1); expect(floor.landmarkVisits).toBe(1);
    expect(resident.needs.entertainment).toBe(65); expect(town.economy.coins).toBe(coins); expect(floor.revenueToday).toBe(0);
    expect(maybeEveningOuting(resident, (type) => type === 'landmark' ? floor : null, () => 0)).toBeNull();
    updateHappinessAndEvict([game], 2);
    expect(resident.needs.entertainment).toBeGreaterThanOrEqual(65);
    resetDailyFlags([resident]); expect(resident.didLandmark).toBe(false);
    expect(maybeEveningOuting(resident, (type) => type === 'landmark' ? floor : null, () => 0)?.activity.kind).toBe('leisure');
  });

  it('misses the outing when the lift queue fails, without awarding leisure or inventing income', () => {
    const { town, game } = fixture(); buildLandmark(town, game.id, 'gallery');
    const floor = game.tower.floors[game.tower.height - 1], resident = game.residents[0]; game.residents = [resident];
    resident.state = { kind: 'waiting', floor: 1, to: floor.level };
    resident.pendingActivity = { activity: { kind: 'leisure', floor: floor.level }, duration: 45 };
    vi.spyOn(game.elevator, 'tick').mockReturnValue({ arrivals: [], boardings: [], abandonments: [{ residentId: resident.id, floor: floor.level, waitMinutes: 76 }] });
    const coins = town.economy.coins; game.tick(1, 1160);
    expect(floor.missedVisitsToday).toBe(1); expect(floor.landmarkVisits).toBe(0); expect(resident.didLandmark).not.toBe(true);
    expect(town.economy.coins).toBe(coins); expect(resident.state).toMatchObject({ kind: 'idle', floor: 1 });
  });

  it('round-trips visits, free-leisure flags and names through saves and shared towns', async () => {
    const { town, game } = fixture(); buildLandmark(town, game.id, 'observatory');
    const floor = game.tower.floors[game.tower.height - 1]; floor.landmarkVisits = 17; floor.visitsToday = 4;
    game.tower.renameFloor(floor.level, 'The Moon Room');
    const resident = game.residents[0]; resident.didLandmark = true;
    resident.state = { kind: 'idle', floor: floor.level, activity: { kind: 'leisure', floor: floor.level }, until: town.time + 40 };
    const saved = JSON.parse(JSON.stringify(toSaveData(town)));
    for (const restored of [townFromSaveData(saved)!, (await decodeTown(await encodeTown(town)))!]) {
      const restoredGame = restored.towers()[0], restoredFloor = restoredGame.tower.floors[floor.level];
      expect(restoredFloor).toMatchObject({ landmark: 'observatory', landmarkVisits: 17, name: 'The Moon Room' });
      expect(restoredGame.residents[0].didLandmark).toBe(true);
      restoredGame.tick(0, restored.time);
      expect(restoredFloor.landmarkVisits).toBe(17);
    }
    saved.towers[0].floors[floor.level].landmark = '__proto__'; saved.towers[0].floors[floor.level].landmarkVisits = -50;
    expect(townFromSaveData(saved)!.towers()[0].tower.floors[floor.level]).toMatchObject({ landmark: 'gallery', landmarkVisits: 0 });
    delete saved.towers[0].residents[0].didLandmark;
    expect(townFromSaveData(saved)!.towers()[0].residents[0].didLandmark).toBe(false);
  });

  it('stages only real leisure visitors at benches, artwork and telescopes', () => {
    const { town, game } = fixture(); buildLandmark(town, game.id, 'conservatory');
    const floor = game.tower.floors[game.tower.height - 1];
    const visitors = game.residents.slice(0, 4);
    for (const r of visitors) r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'leisure', floor: floor.level }, until: 1200 };
    expect(roomPoses(game.tower.floors, visitors, game.id, 1100).size).toBe(4);
    expect([...roomPoses(game.tower.floors, visitors, game.id, 1100).values()].every((p) => p.action === 'reading' && p.seated)).toBe(true);
    floor.landmark = 'observatory';
    expect([...roomPoses(game.tower.floors, visitors, game.id, 1100).values()].filter((p) => p.action === 'stargazing')).toHaveLength(2);
    visitors[0].state = { kind: 'waiting', floor: 0, to: floor.level };
    expect(roomPoses(game.tower.floors, visitors, game.id, 1100).has(visitors[0].id)).toBe(false);
  });

  it('lets repeat co-located landmark visits create a lasting friendship', () => {
    const { town, game } = fixture(); buildLandmark(town, game.id, 'gallery');
    const floor = game.tower.floors[game.tower.height - 1]; game.residents = game.residents.slice(0, 2);
    for (let day = 0; day < 3; day++) {
      town.time = day * 1440 + 1100;
      for (const r of game.residents) r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'leisure', floor: floor.level }, until: town.time + 45 };
      town.stories.update(town);
    }
    expect(town.stories.journal.some((s) => s.kind === 'friendship' && s.text.includes(floor.name))).toBe(true);
    const restored = townFromSaveData(toSaveData(town))!;
    expect(restored.stories.journal.some((s) => s.kind === 'friendship')).toBe(true);
  });
});

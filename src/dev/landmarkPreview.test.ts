import { expect, it } from 'vitest';
import { createPreviewTown, landmarkVisitReport } from './landmarkPreview';
import { buildLandmark } from '../core/landmarks';
import { toSaveData } from '../core/save';

it('reports actual landmark counts and present leisure visitors without altering the study', () => {
  const town = createPreviewTown(), game = town.towers()[0];
  expect(landmarkVisitReport(town)).toBe('No public landmarks built yet.');
  expect(buildLandmark(town, game.id, 'conservatory')).toBe(true);
  const floor = game.tower.floors[game.tower.height - 1];
  floor.visitsToday = 2; floor.landmarkVisits = 5; floor.missedVisitsToday = 1;
  const [present, waiting] = game.residents; present.name = 'Reader'; waiting.name = 'Waiting';
  present.needs.entertainment = 70;
  present.state = { kind: 'idle', floor: floor.level, activity: { kind: 'leisure', floor: floor.level }, until: town.time + 45 };
  waiting.state = { kind: 'waiting', floor: 0, to: floor.level };
  const before = toSaveData(town), report = landmarkVisitReport(town);
  expect(report).toContain('2 today / 5 lifetime / 1 missed');
  expect(report).toContain('Here: Reader (entertainment 70)'); expect(report).not.toContain('Waiting');
  expect({ ...toSaveData(town), savedAtWallClock: before.savedAtWallClock }).toEqual(before);
});

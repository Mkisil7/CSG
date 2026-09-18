import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { toSaveData, townFromSaveData } from '../core/save';

/** Synthetic friendship/age setup, real discovered invitations and paid actions,
 * then a detached save restore. Never accesses the player's save or storage. */
export function createPreviewTown(): Town {
  const town = new Town(), game = town.towers()[0];
  town.identity.name = 'The welcome walk'; game.rename('Willow House');
  game.tower.addFloor('residential'); game.tower.addFloor('residential');
  town.time = 6 * 1440 + 1020; town.economy.coins = 2000;
  town.identity.unlocked = new Set(['heritage', 'canopy', 'public-art']);
  for (const [index, name] of ['Maya', 'Noah', 'Lulu', 'Fern'].entries()) {
    const resident = createResident(1 + index % 2, game.id); resident.name = name; resident.happiness = 90;
    resident.state = { kind: 'idle', floor: resident.homeFloor, activity: { kind: 'home', floor: resident.homeFloor }, until: town.time + 30 };
    game.residents.push(resident);
  }
  town.stories.update(town);
  for (const resident of game.residents.slice(0, 2)) {
    town.stories.people[resident.id].arrivalDay = 1;
    town.stories.people[resident.id].friends = game.residents.slice(2).map((friend) => ({ residentId: friend.id, daysTogether: 4, lastDay: town.day }));
    town.neighborhood.discover(town);
    const invitation = town.neighborhood.pending().find((event) => event.kind === 'character');
    if (!invitation || !town.neighborhood.respond(town, invitation.id)) throw new Error('Host study dedication failed');
    town.time += 13 * 1440;
  }
  return townFromSaveData(toSaveData(town))!;
}

export function mountPreview(): void {
  const panel = document.createElement('details'); panel.className = 'weather-study';
  panel.innerHTML = '<summary>Development host study</summary><p>Two paid dedications restored from a detached save. Friendship history and age are staged. Select either bench to meet its host. No autosave.</p>';
  document.body.append(panel);
}

import type { Town } from './town';
import { assignedStaff, businessCustomerPhase, isJobFloorType } from './business';
import { MISSION_DEFS } from './missions';
import { BUSINESS, FLOOR_CONFIG, SECOND_SHAFT, type JobFloorType } from './types';
import { LANDMARK_KINDS, LANDMARKS, landmarkOffer } from './landmarks';
import { attractiveness, districts, SKYLINE_REWARDS } from './identity';
import { liftActionDetail, liftResultGoal } from './liftGoals';
import { liftPressure } from './transit';

export type GoalTarget =
  | { kind: 'build'; towerId: string; floorType: 'residential' | JobFloorType }
  | { kind: 'resident'; residentId: string }
  | { kind: 'floor'; towerId: string; level: number }
  | { kind: 'transit'; towerId: string }
  | { kind: 'slot'; index: number }
  | { kind: 'happiness' }
  | { kind: 'town' }
  | { kind: 'neighborhood' }
  | { kind: 'landmarks'; towerId: string }
  | { kind: 'missions'; missionId?: string };
export interface VisibleGoal {
  id: string;
  horizon: string;
  title: string;
  detail: string;
  current?: number;
  total?: number;
  reward?: number;
  target: GoalTarget;
}

/** A small, explainable set of goals, using the actual mission reward ledger. */
export function visibleGoals(town: Town): VisibleGoal[] {
  const residents = town.allResidents();
  const games = town.towers();
  const canExpand = town.slots.some((slot, index) => !slot.unlocked && town.canUnlockSlot(index).ok);
  const possibleTowers = games.length + town.slots.filter((slot) => !slot.unlocked).length;
  const floorTarget = { kind: 'floor' as const, towerId: games[0]?.id ?? 't0', level: 0 };
  const goals: VisibleGoal[] = [];
  const worried = [...residents].sort((a, b) => b.unhappyDays - a.unhappyDays)[0];
  const jammed = games.map(g => ({ g, pressure: liftPressure(g, town.time) })).filter(({ pressure }) => pressure.urgent)
    .sort((a, b) => b.pressure.longest - a.pressure.longest)[0];
  const weak = games.flatMap((g) => g.tower.floors.map((f) => ({ g, f })))
    .find(({ g, f }) => isJobFloorType(f.type) && f.quality < 55 &&
      assignedStaff(residents, g.id, f.level).length > 0 && g.canRenovate(f.level).ok);
  const unemployed = residents.filter((r) => r.jobFloor === null).length;
  const homes = games.reduce((n, g) => n + g.tower.floors.filter((f) => f.type === 'residential').length * FLOOR_CONFIG.residential.homes, 0);
  const vacancies = homes - residents.length;
  const has = (type: JobFloorType) => games.some((g) => g.tower.floors.some((f) => f.type === type));
  const needed: JobFloorType[] = [];
  if (residents.length >= 4 && !has('restaurant')) needed.push('restaurant');
  if (residents.length >= 2 && !has('shop')) needed.push('shop');
  if (unemployed >= 4 && residents.length >= 8) needed.push('office');
  // Industrial-only towns still have a viable job-building path.
  if (unemployed >= 4 && !games.some((g) => g.zone === 'mixed' || g.zone === 'office')) needed.push('factory');
  const development = needed.flatMap((type) => [...games].sort((a, b) => a.tower.nextFloorCost(type) - b.tower.nextFloorCost(type))
    .map((g) => ({ type, g, check: g.canBuild(type, residents.length) })))
    .find(({ check }) => check.ok || check.reason === 'Not enough coins');
  if (worried?.unhappyDays > 0) {
    goals.push({ id: `help-${worried.id}`, horizon: 'Right now', title: `Give ${worried.name} a reason to stay`,
      detail: 'Read their concern and improve the part of town they need.', target: { kind: 'resident', residentId: worried.id } });
  } else if (jammed) {
    const { g, pressure } = jammed;
    goals.push({ id: `lift-${g.id}`, horizon: 'Right now', title: 'Give the neighborhood its time back',
      detail: `${g.name}: ${pressure.waiting} waiting · ${pressure.longest > 20 ? `oldest wait ${Math.round(pressure.longest)} min` :
        `recent trips averaged ${Math.round(pressure.recentWait!)} min`}. ${liftActionDetail(g, residents.length, town.economy.coins)}`,
      target: { kind: 'transit', towerId: g.id } });
  } else if (development) {
    const { type, g, check } = development, cost = g.tower.nextFloorCost(type);
    const purpose = type === 'restaurant' ? 'Give your neighbors a place to eat' : type === 'shop' ? 'Open your first neighborhood shop' : 'Give more neighbors a place to work';
    goals.push({ id: `build-${g.id}-${type}`, horizon: 'Right now', title: check.ok ? purpose : `Save for ${type === 'office' ? 'an' : 'a'} ${FLOOR_CONFIG[type].label.toLowerCase()}`,
      detail: `${type === 'restaurant' ? 'Dining and three career places' : type === 'shop' ? 'Everyday shopping and two career places' : `${unemployed} neighbors are looking for work`}. Choose a business from ${cost} coins${check.ok ? '.' : ` · ${Math.ceil(cost - town.economy.coins)} more to save.`}`,
      target: { kind: 'build', towerId: g.id, floorType: type } });
  } else if (weak && !(residents.length < 10 && vacancies <= 0 && weak.f.quality >= 40)) {
    goals.push({ id: `renovate-${weak.g.id}-${weak.f.level}`, horizon: 'Right now', title: `A fresh start for ${weak.f.name}`,
      detail: `Renovation adds ${BUSINESS.renovateBoost} quality for ${weak.g.renovateCost(weak.f.level)} coins.`,
      target: { kind: 'floor', towerId: weak.g.id, level: weak.f.level } });
  } else {
    const homeCost = games[0]?.tower.nextFloorCost('residential') ?? FLOOR_CONFIG.residential.baseCost;
    const awaitingArrival = homes > 0 && residents.length === 0;
    const firstHome = games.flatMap(g => g.tower.floors.filter(f => f.type === 'residential').map(f => ({ kind: 'floor' as const, towerId: g.id, level: f.level })))[0];
    goals.push({ id: 'welcome', horizon: 'Right now', title: homes === 0 ? 'Make room for your first neighbors' : awaitingArrival ? 'Watch your first neighbors arrive' : vacancies > 0 ? 'Meet the people moving in' : 'One more floor, four new stories',
      detail: homes === 0 ? 'Build Apartments from the dock. Your first residents arrive by lift.' : awaitingArrival ? `${vacancies} homes are ready. If paused, choose 1× to let your first neighbors arrive. No more building needed yet.` : vacancies > 0 ? `${vacancies} homes are waiting. Get to know a neighbor while the town grows.` :
        `Add apartments for ${homeCost} coins to welcome four more residents.${town.economy.coins < homeCost ? ` ${Math.ceil(homeCost - town.economy.coins)} more to save.` : ''}`,
      target: awaitingArrival && firstHome ? firstHome : vacancies > 0 && residents[0] ? { kind: 'resident', residentId: residents[0].id } :
        { kind: 'build', towerId: floorTarget.towerId, floorType: 'residential' } });
  }

  const candidates: { id: string; current: number; total: number; ready?: boolean; detail?: string; target?: GoalTarget }[] = [
    ...(['first-shop-customer', 'first-meal'] as const).map((id) => {
      const type = id === 'first-meal' ? 'restaurant' : 'shop';
      const venues = games.flatMap(g => g.tower.floors.filter(f => f.type === type).map(f => {
        const staffed = assignedStaff(residents, g.id, f.level).length > 0;
        const phases = g.residents.map(r => businessCustomerPhase(r, f));
        return { g, f, staffed, score: (staffed ? 4 : 0) + (phases.includes('on-way') ? 2 : 0) + (phases.includes('here') ? 1 : 0) };
      })).sort((a, b) => b.score - a.score);
      const venue = venues[0];
      return { id, total: 1,
        current: MISSION_DEFS.find((mission) => mission.id === id)!.check(town) ? 1 : 0,
        ready: !!venue,
        detail: `${id === 'first-meal' ? 'Serve a first paid meal' : 'Make the first shop sale'}.${venue ? ` Follow ${venue.f.name}.` : ''} ${venue && !venue.staffed ? 'It needs a teammate before customers can visit.' : 'Watch neighbors arrive; waiting in a lift queue does not count.'}`,
        target: venue ? { kind: 'floor' as const, towerId: venue.g.id, level: venue.f.level } : undefined };
    }),
    { id: 'first-neighbors', current: residents.length, total: 10 },
    { id: 'fully-staffed', current: Math.max(0, ...games.flatMap((g) => g.tower.floors.filter((f) => f.type === 'restaurant').map((f) => assignedStaff(residents, g.id, f.level).length))), total: FLOOR_CONFIG.restaurant.jobs,
      ready: games.some((g) => g.tower.floors.some((f) => f.type === 'restaurant')) },
    { id: 'lift-second', current: games.some((g) => g.secondElevator) ? 1 : 0, total: 1,
      ready: games.some((g) => g.canUnlockSecondShaft().ok), detail: `Install a second lift shaft for ${SECOND_SHAFT.cost} coins. Compare actual waits after ten trips.` },
    { id: 'skyscraper', current: Math.max(0, ...games.map((g) => g.tower.floors.length)), total: 10,
      ready: games.some((g) => g.tower.floors.length >= 5) },
    { id: 'mogul', current: games.length, total: 3, ready: games.length >= 2 && (games.length >= 3 || canExpand) && possibleTowers >= 3 },
  ];
  // Offer the nearest milestone within each family. The reward ledger remains
  // authoritative: goal display never awards coins or advances a daily streak.
  const floors = games.flatMap((g) => g.tower.floors);
  const measures: Record<string, number> = {
    pop: residents.length, rich: town.economy.coins, 'day-income': town.economy.incomeToday,
    towers: games.length, tall: Math.max(0, ...games.map((g) => g.tower.floors.length)),
    floors: floors.filter((f) => f.type !== 'lobby').length,
    shops: floors.filter((f) => f.type === 'shop').length, rest: floors.filter((f) => f.type === 'restaurant').length,
    off: floors.filter((f) => f.type === 'office').length, fac: floors.filter((f) => f.type === 'factory').length,
    employed: residents.filter((r) => r.jobFloor !== null).length,
  };
  const considered = new Set<string>();
  for (const mission of MISSION_DEFS) {
    if (town.missions.completed.has(mission.id)) continue;
    const match = /^(pop|rich|day-income|towers|tall|floors|shops|rest|off|fac|employed)-(\d+)$/.exec(mission.id);
    if (!match || considered.has(match[1])) continue;
    considered.add(match[1]);
    const current = measures[match[1]], total = Number(match[2]);
    if (match[1] === 'towers' && (possibleTowers < total || (current < total && !canExpand))) continue;
    // A late-game thousand-resident ambition isn't a short-session task.
    if (current <= 0 || current / total < 0.4) continue;
    candidates.push({ id: mission.id, current, total });
  }
  const eligible = candidates.filter((c) => c.ready !== false && !town.missions.completed.has(c.id));
  const next = eligible.find((c) => c.id === 'first-shop-customer' || c.id === 'first-meal') ?? eligible.find((c) => c.id === 'first-neighbors') ??
    eligible.sort((a, b) => Math.min(1, b.current / b.total) - Math.min(1, a.current / a.total))[0];
  if (next) {
    const mission = MISSION_DEFS.find((m) => m.id === next.id)!;
    goals.push({ id: mission.id, horizon: 'This session', title: mission.label,
      detail: `${next.detail ?? mission.description}${mission.cadence === 'daily' ? ' · Checked at day’s end.' : ''}`,
      current: Math.min(next.current, next.total), total: next.total, reward: mission.reward, target: next.target ?? { kind: 'missions', missionId: mission.id } });
  } else {
    const business = games.flatMap((g) => g.tower.floors.map((f) => ({ g, f })))
      .filter(({ f }) => isJobFloorType(f.type) && !f.signature).sort((a, b) => b.f.quality - a.f.quality)[0];
    goals.push(business ? { id: `signature-${business.g.id}-${business.f.level}`, horizon: 'This session',
      title: `Make ${business.f.name} a local favorite`,
      detail: business.f.type === 'shop' || business.f.type === 'restaurant' ?
        'Earn a gold Signature sign: reach 85 quality, have at least one worker and serve 8 visits in a day.' :
        'Earn a gold Signature sign: reach 85 quality and build a team of at least two, including a promoted worker.',
      target: { kind: 'floor', towerId: business.g.id, level: business.f.level } } :
      { id: 'next-chapter', horizon: 'This session', title: 'Shape a neighborhood of your own',
        detail: 'Mix studios, shops, dining and parks to give your district its own character. Open your skyline and choose where to grow next.', target: { kind: 'town' } });
  }
  const park = MISSION_DEFS.find((m) => m.id === 'first-park')!;
  if (!town.missions.completed.has(park.id) && town.slots.some((s) => !s.unlocked)) {
    const index = town.slots.findIndex((s) => !s.unlocked);
    goals.push({ id: park.id, horizon: 'Your growing town', title: 'A place to breathe',
      detail: 'Zone an empty lot as Open Space. Give your neighbors a park.', reward: park.reward,
      current: town.parkOrigins().length, total: 1, target: index >= 0 ? { kind: 'slot', index } : { kind: 'missions' } });
  } else {
    const mission = ['happy-town', 'happy-90-3', 'happy-85-5', 'happy-80-7']
      .map((id) => MISSION_DEFS.find((m) => m.id === id)!).find((m) => !town.missions.completed.has(m.id));
    if (mission) goals.push({ id: mission.id, horizon: 'Your growing town', title: mission.label,
      detail: `${mission.description}. Progress is counted at day’s end.`,
      current: Math.min(town.missions.streaks[mission.id] ?? 0, mission.streakDays!), total: mission.streakDays,
      reward: mission.reward, target: { kind: 'happiness' } });
    else {
      const reward = SKYLINE_REWARDS.find((r) => !town.identity.unlocked.has(r.id) && !r.check(town));
      const neighborhood = districts(town)[0];
      goals.push({ id: reward ? `skyline-${reward.id}` : 'town-character', horizon: 'Your growing town',
        title: reward ? reward.label : `Keep shaping ${neighborhood?.name ?? town.identity.name}`,
        detail: reward ? `${reward.description}. A lasting change to your skyline.` :
          `${attractiveness(town).score}/100 attractiveness. Add variety, public places and thriving businesses to express your town’s character.`,
        target: { kind: 'town' } });
    }
  }
  // A costly congestion fix must remain visible, but must not erase a useful
  // decision the player can make now. Offer a tradeoff, not another floor that
  // would add riders to the congested tower. Never spend or imply it fixes lifts.
  if (jammed && goals[0]?.id === `lift-${jammed.g.id}` && weak &&
      (jammed.g.nextSpeedTierCost() !== null || (!jammed.g.secondElevator && residents.length >= SECOND_SHAFT.unlockPop)) &&
      !jammed.g.canUpgradeSpeed().ok && !jammed.g.canUnlockSecondShaft().ok) {
    const cost = weak.g.renovateCost(weak.f.level)!;
    goals.push({ id: `renovate-${weak.g.id}-${weak.f.level}`, horizon: 'Another option',
      title: `A fresh start for ${weak.f.name}`,
      detail: `Renovate this staffed business: +${BUSINESS.renovateBoost} quality for ${cost} coins. This uses coins you could save for the lift; it does not shorten its queues.`,
      target: { kind: 'floor', towerId: weak.g.id, level: weak.f.level } });
  }
  const invitation = town.neighborhood.pending().find((e) => e.status === 'offered') ?? town.neighborhood.pending()[0];
  if (invitation) goals.push({ id: invitation.id, horizon: 'Around the neighborhood', title: invitation.title,
    detail: invitation.status === 'offered' ? 'An invitation is waiting. Read why it happened and choose your response.' : invitation.outcome,
    target: { kind: 'neighborhood' } });
  const landmark = games.flatMap((g) => LANDMARK_KINDS.map((kind) => ({ g, kind, offer: landmarkOffer(town, g.id, kind) }))).find((l) => l.offer.ok);
  if (landmark && goals.length < 5) goals.push({ id: `landmark-${landmark.g.id}`, horizon: 'A lasting reward', title: `A ${LANDMARKS[landmark.kind].label} for your neighbors`,
    detail: `Earned in ${landmark.g.name}. Choose its public landmark for ${landmark.offer.cost} coins.`, target: { kind: 'landmarks', towerId: landmark.g.id } });
  const liftResult = games.map(liftResultGoal).find(goal => goal !== null);
  if (liftResult && goals.length < 5) goals.push(liftResult);
  return goals;
}

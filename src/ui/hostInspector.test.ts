import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inspector } from './inspector';
import { createPreviewTown } from '../dev/hostPreview';
import { Game } from '../core/game';
import { updateHappinessAndEvict } from '../core/happiness';
import { createResident } from '../core/residents';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(readOnly = false) {
  const town = createPreviewTown(), game = town.towers()[0];
  const onChanged = vi.fn(), onFocusTower = vi.fn(), onExploreRoom = vi.fn();
  const controls = new Map<string, { dataset: Record<string, string>; click: () => void }[]>();
  let html = '';
  const root = {
    classList: { add() {} }, style: { display: '' }, scrollTop: 0, tabIndex: 0,
    contains: () => false, focus: vi.fn(), querySelector: () => null,
    querySelectorAll: (selector: string) => controls.get(selector) ?? [],
    get innerHTML() { return html; },
    set innerHTML(value: string) {
      html = value; controls.clear();
      for (const attribute of ['resident', 'tower', 'explore-room', 'resident-help', 'help-back', 'floor-resident', 'resident-back', 'story-place']) {
        controls.set(`[data-${attribute}]`, [...value.matchAll(new RegExp(`data-${attribute}="([^"]+)"`, 'g'))].map((match) => {
          const dataset: Record<string, string> = attribute === 'explore-room' ? { exploreRoom: match[1], exploreTower: game.id } : { [attribute.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())]: match[1] };
          const control = { dataset, click: () => {},
            addEventListener: (type: string, callback: () => void) => { if (type === 'click') control.click = callback; } };
          return control;
        }));
      }
    },
  };
  vi.stubGlobal('document', { activeElement: null, getElementById: () => null });
  const inspector = new Inspector(root as unknown as HTMLElement, () => town, onChanged, readOnly, undefined, onFocusTower, onExploreRoom);
  inspector.select({ kind: 'floor', towerId: game.id, level: 0 });
  return { town, game, root, controls, inspector, onChanged, onFocusTower, onExploreRoom };
}

describe('readable host directory', () => {
  it('bounds customer cards without hiding the full crowd count or borrowing another tower’s customers', () => {
    const s = setup(), shop = s.game.tower.addFloor('shop');
    for (let index = 0; index < 9; index++) {
      const r = createResident(1, s.game.id); r.name = `Shopper ${index}`;
      r.state = { kind: 'idle', floor: shop.level, activity: { kind: 'shop', floor: shop.level }, until: 100 };
      s.game.residents.push(r);
    }
    const other = new Game('t1', s.town.economy), elsewhere = createResident(1, other.id);
    elsewhere.state = { kind: 'idle', floor: shop.level, activity: { kind: 'shop', floor: shop.level }, until: 100 };
    other.residents.push(elsewhere);
    s.town.slots[1] = { id: other.id, unlocked: true, zone: 'mixed', game: other };
    const before = JSON.stringify(s.town);
    s.inspector.select({ kind: 'floor', towerId: s.game.id, level: shop.level });
    expect(s.root.innerHTML).toContain('Neighbors here (9)');
    expect(s.root.innerHTML).toContain('3 more neighbors');
    expect(s.controls.get('[data-floor-resident]')).toHaveLength(6);
    expect(s.root.innerHTML).not.toContain(`data-floor-resident="${elsewhere.id}"`);
    expect(JSON.stringify(s.town)).toBe(before);
  });
  it.each([false, true])('follows incoming and arrived customers back to the business (visiting=%s)', visiting => {
    const s = setup(visiting), r = s.game.residents[0], staff = s.game.residents[1];
    const cafe = s.game.tower.addFloor('restaurant'); r.name = '<Maya & coffee>';
    staff.jobTowerId = s.game.id; staff.jobFloor = cafe.level;
    r.state = { kind: 'waiting', floor: 0, to: cafe.level };
    r.pendingActivity = { activity: { kind: 'eat', floor: cafe.level }, duration: 40 };
    s.town.refreshStaffing(); const before = JSON.stringify(s.town);
    const destination = { kind: 'floor' as const, towerId: s.game.id, level: cafe.level };
    s.inspector.select(destination);
    expect(s.root.innerHTML).toContain('Neighbors here (0)');
    expect(s.root.innerHTML).toContain('On their way (1)');
    expect(s.root.innerHTML).toContain('Waiting for the lift · not yet a visit');
    expect(s.root.innerHTML).toContain('&lt;Maya &amp; coffee&gt;');
    const card = () => s.controls.get('[data-floor-resident]')!.find(c => c.dataset.floorResident === r.id)!;
    card().click(); expect(s.inspector.current).toEqual({ kind: 'resident', residentId: r.id });
    s.controls.get('[data-resident-back]')![0].click(); expect(s.inspector.current).toEqual(destination);
    expect(JSON.stringify(s.town)).toBe(before);
    r.state = { kind: 'idle', floor: cafe.level, activity: { kind: 'eat', floor: cafe.level }, until: 50 };
    s.inspector.refresh(true);
    expect(s.root.innerHTML).toContain('Neighbors here (1)'); expect(s.root.innerHTML).not.toContain('On their way');
    expect(s.root.innerHTML).toContain('Dining here');
    const departed = card(); r.state.activity.kind = 'home'; departed.click();
    expect(s.inspector.current).toEqual(destination); expect(s.root.innerHTML).toContain('Neighbors here (0)');
    expect(s.onChanged).not.toHaveBeenCalled(); expect(cafe.visitsToday).toBe(0);
    expect(s.root.innerHTML.includes('id="insp-renovate"')).toBe(!visiting);
  });
  it.each([false, true])('shows individual needs and keeps a route back after opening meal help (visiting=%s)', visiting => {
    const s = setup(visiting), r = s.game.residents[0], staff = s.game.residents[1];
    const cafe = s.game.tower.addFloor('restaurant'); cafe.name = '<Raincheck & Co>';
    r.name = '<Maya & friends>'; r.needs.food = 10; r.happiness = 30; r.unhappyDays = 2;
    staff.jobFloor = cafe.level; staff.jobTowerId = s.game.id; s.town.refreshStaffing();
    const before = JSON.stringify(s.town);
    s.inspector.select({ kind: 'resident', residentId: r.id });
    expect(s.root.innerHTML).toContain('aria-label="Food" aria-valuemin="0" aria-valuemax="100" aria-valuenow="10"');
    expect(s.root.innerHTML).toContain('Inspect &lt;Raincheck &amp; Co&gt;');
    expect(s.root.innerHTML).toContain('not town averages');
    s.controls.get('[data-resident-help]')![0].click();
    expect(s.inspector.current).toEqual({ kind: 'floor', towerId: s.game.id, level: cafe.level });
    expect(s.root.innerHTML).toContain('Helping &lt;Maya &amp; friends&gt;');
    expect(s.root.innerHTML).toContain('Happiness 30/100');
    expect(s.root.innerHTML).toContain('3 more unhappy days');
    expect(s.root.innerHTML.indexOf('id="insp-close"')).toBeLessThan(s.root.innerHTML.indexOf('class="resident-help-context"'));
    expect(s.root.innerHTML.includes('id="insp-renovate"')).toBe(!visiting);
    s.controls.get('[data-help-back]')![0].click();
    expect(s.inspector.current).toEqual({ kind: 'resident', residentId: r.id });
    expect(s.root.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(JSON.stringify(s.town)).toBe(before); expect(s.onChanged).not.toHaveBeenCalled();
  });

  it('reports actual daily recovery without crediting navigation or an upgrade with an instant mood reward', () => {
    const s = setup(), r = s.game.residents[0], cafe = s.game.tower.addFloor('restaurant');
    r.jobFloor = cafe.level; r.jobTowerId = s.game.id; r.needs.food = 10; r.happiness = 30; r.unhappyDays = 2;
    s.town.refreshStaffing();
    s.inspector.select({ kind: 'resident', residentId: r.id }); s.controls.get('[data-resident-help]')![0].click();
    s.game.renovate(cafe.level); s.inspector.refresh(true);
    expect(s.root.innerHTML).toContain('Happiness 30/100'); expect(r.unhappyDays).toBe(2);
    r.didDinner = true;
    updateHappinessAndEvict(s.town.towers(), s.town.day + 1);
    s.inspector.refresh();
    expect(s.root.innerHTML).toContain(`Happiness 30 → ${Math.round(r.happiness)}/100`);
    expect(s.root.innerHTML).toContain('countdown has cleared at the daily review');
    s.controls.get('[data-help-back]')![0].click();
    expect(s.root.innerHTML).toContain('aria-label="Food" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"');
  });

  it('clears help context on unrelated navigation and ignores detached help/back buttons', () => {
    const s = setup(), r = s.game.residents[0];
    s.inspector.select({ kind: 'resident', residentId: r.id });
    const oldHelp = s.controls.get('[data-resident-help]')![0]; oldHelp.click();
    const oldBack = s.controls.get('[data-help-back]')![0];
    s.inspector.select({ kind: 'journal' }); oldHelp.click(); oldBack.click();
    expect(s.inspector.current).toEqual({ kind: 'journal' });
    expect(s.root.innerHTML).not.toContain('HELPING A NEIGHBOR'); expect(s.onChanged).not.toHaveBeenCalled();
  });

  it('handles departure during a help session without a dead return button', () => {
    const s = setup(), r = s.game.residents[0];
    s.inspector.select({ kind: 'resident', residentId: r.id }); s.controls.get('[data-resident-help]')![0].click();
    const oldBack = s.controls.get('[data-help-back]')![0];
    s.game.residents = s.game.residents.filter(person => person.id !== r.id); oldBack.click();
    expect(s.root.innerHTML).toContain('This neighbor is no longer in town');
    expect(s.controls.get('[data-help-back]')).toHaveLength(0); expect(s.onChanged).not.toHaveBeenCalled();
  });

  it.each([false, true])('follows earned-place memories from journal and resident history without editing (visiting=%s)', visiting => {
    const s = setup(visiting), resident = s.game.residents[0], other = new Game('t1', s.town.economy);
    s.town.slots[1] = { id: other.id, unlocked: true, zone: 'mixed', game: other };
    const floor = other.tower.addFloor('restaurant');
    const target = { kind: 'floor' as const, towerId: other.id, level: floor.level };
    s.town.stories.record(1, 'place', [resident.id], 'An earned review', 'A real visit', target);
    const coins = s.town.economy.coins;
    for (const selection of [{ kind: 'journal' as const }, { kind: 'resident' as const, residentId: resident.id }]) {
      s.inspector.select(selection);
      s.controls.get('[data-story-place]')!.slice(-1)[0].click();
      expect(s.inspector.current).toEqual(target); expect(s.onFocusTower).toHaveBeenLastCalledWith(other.id, floor.level);
      expect(s.root.focus).toHaveBeenCalledWith({ preventScroll: true });
      if (visiting) expect(s.root.innerHTML).not.toContain('id="insp-renovate"');
    }
    expect(s.onChanged).not.toHaveBeenCalled(); expect(s.town.economy.coins).toBe(coins);
  });
  it('rechecks place links and ignores a detached story control after leaving the panel', () => {
    const s = setup(), floor = s.game.tower.addFloor('restaurant');
    s.town.stories.record(1, 'place', [], 'Opening', 'Here', { kind: 'floor', towerId: s.game.id, level: floor.level });
    s.inspector.select({ kind: 'journal' }); const button = s.controls.get('[data-story-place]')!.slice(-1)[0];
    s.inspector.select({ kind: 'happiness' }); button.click(); expect(s.inspector.current).toEqual({ kind: 'happiness' });
    s.inspector.select({ kind: 'journal' }); const stale = s.controls.get('[data-story-place]')!.slice(-1)[0];
    s.game.tower.floors.pop(); stale.click();
    expect(s.inspector.current).toEqual({ kind: 'journal' }); expect(s.onFocusTower).not.toHaveBeenCalled();
    expect(s.controls.get('[data-story-place]')).toHaveLength(0); expect(s.onChanged).not.toHaveBeenCalled();
  });
  it('follows a concert memory to its actual park without a purchase', () => {
    const s = setup(); s.town.slots[2] = { id: 't2', unlocked: true, zone: 'park', game: null };
    s.town.stories.record(1, 'place', [], 'The concert', 'An audience arrived', { kind: 'slot', index: 2 });
    s.inspector.select({ kind: 'journal' }); s.controls.get('[data-story-place]')!.slice(-1)[0].click();
    expect(s.inspector.current).toEqual({ kind: 'slot', index: 2 }); expect(s.onFocusTower).toHaveBeenCalledWith('t2');
    expect(s.onChanged).not.toHaveBeenCalled();
  });
  it.each([false, true])('opens the story wall from Missions without edits, including visiting mode (%s)', (visiting) => {
    const s = setup(visiting), coins = s.town.economy.coins;
    s.town.missions.completed.add('first-meal');
    s.inspector.select({ kind: 'missions', missionId: 'first-meal' });
    expect(s.root.innerHTML).toContain('Town story wall · 1/120 tiles');
    s.controls.get('[data-explore-room]')![0].click();
    expect(s.inspector.current).toBeNull(); expect(s.onExploreRoom).toHaveBeenCalledWith(s.game.id, 0);
    expect(s.onChanged).not.toHaveBeenCalled(); expect(s.town.economy.coins).toBe(coins);
    expect([...s.town.missions.completed]).toEqual(['first-meal']);
  });
  it.each([false, true])('opens assigned staff and returns to their workplace without changing the town (visiting=%s)', (visiting) => {
    const s = setup(visiting), floor = s.game.tower.addFloor('office', 'tech');
    floor.name = '<Firefly & Studio>';
    const [a, b] = s.game.residents; a.name = b.name = '<Bo & Co>';
    for (const r of [a, b]) { r.jobFloor = floor.level; r.jobTowerId = s.game.id; }
    // Home context differs from the workplace; opening a staff profile must not jump home.
    a.homeTowerId = 't1';
    const before = JSON.stringify({ residents: s.town.allResidents(), floors: s.game.tower.floors, coins: s.town.economy.coins });
    s.inspector.select({ kind: 'floor', towerId: s.game.id, level: floor.level });
    const cards = s.controls.get('[data-floor-resident]')!;
    expect(cards.map((card) => card.dataset.floorResident)).toEqual([a.id, b.id].sort((x, y) => x.localeCompare(y)));
    expect(s.root.innerHTML).toContain('aria-label="Inspect &lt;Bo &amp; Co&gt;');
    expect(s.root.innerHTML).not.toContain('<Bo & Co>');
    cards.find((card) => card.dataset.floorResident === a.id)!.click();
    expect(s.inspector.current).toEqual({ kind: 'resident', residentId: a.id });
    expect(s.root.innerHTML).toContain('Back to &lt;Firefly &amp; Studio&gt;');
    expect(s.onFocusTower).not.toHaveBeenCalled(); expect(s.root.focus).toHaveBeenCalledWith({ preventScroll: true });
    s.controls.get('[data-resident-back]')![0].click();
    expect(s.inspector.current).toEqual({ kind: 'floor', towerId: s.game.id, level: floor.level });
    expect(s.onFocusTower).toHaveBeenCalledWith(s.game.id, floor.level);
    expect(JSON.stringify({ residents: s.town.allResidents(), floors: s.game.tower.floors, coins: s.town.economy.coins })).toBe(before);
    expect(s.onChanged).not.toHaveBeenCalled();
  });
  it('offers household profiles while excluding other homes and keeps the current status honest', () => {
    const s = setup(), resident = s.game.residents[0];
    resident.state = { kind: 'waiting', floor: 0, to: 1 };
    s.inspector.select({ kind: 'floor', towerId: s.game.id, level: 1 });
    const cards = s.controls.get('[data-floor-resident]')!;
    expect(cards.map((card) => card.dataset.floorResident).sort()).toEqual(s.town.allResidents().filter((r) => r.homeFloor === 1).map((r) => r.id).sort());
    expect(s.root.innerHTML).toContain('Lives here · Waiting');
    cards.find((card) => card.dataset.floorResident === resident.id)!.click();
    expect(s.inspector.current).toEqual({ kind: 'resident', residentId: resident.id });
    expect(s.controls.get('[data-resident-back]')).toHaveLength(1);
    s.inspector.select({ kind: 'journal' }); s.inspector.select({ kind: 'resident', residentId: resident.id });
    expect(s.controls.get('[data-resident-back]')).toHaveLength(0);
  });
  it('refreshes stale staff, household and departed-resident cards without navigating or spending', () => {
    const s = setup(), resident = s.game.residents[0], floor = s.game.tower.addFloor('office');
    resident.jobFloor = floor.level; resident.jobTowerId = s.game.id;
    s.inspector.select({ kind: 'floor', towerId: s.game.id, level: floor.level });
    const oldJob = s.controls.get('[data-floor-resident]')![0]; resident.jobFloor = null;
    oldJob.click(); expect(s.controls.get('[data-floor-resident]')).toHaveLength(0);
    expect(s.root.innerHTML).toContain('No staff yet');
    s.inspector.select({ kind: 'floor', towerId: s.game.id, level: 1 });
    const oldHome = s.controls.get('[data-floor-resident]')!.find((card) => card.dataset.floorResident === resident.id)!;
    resident.homeFloor = 2; oldHome.click();
    expect(s.controls.get('[data-floor-resident]')!.some((card) => card.dataset.floorResident === resident.id)).toBe(false);
    s.inspector.select({ kind: 'floor', towerId: s.game.id, level: 2 });
    const departed = s.controls.get('[data-floor-resident]')!.find((card) => card.dataset.floorResident === resident.id)!;
    s.game.residents = s.game.residents.filter((r) => r.id !== resident.id); departed.click();
    expect(s.inspector.current).toEqual({ kind: 'floor', towerId: s.game.id, level: 2 });
    expect(s.onFocusTower).not.toHaveBeenCalled(); expect(s.onChanged).not.toHaveBeenCalled();
    s.inspector.select({ kind: 'journal' }); oldHome.click(); expect(s.inspector.current).toEqual({ kind: 'journal' });
  });
  it('shows only physically present landmark visitors and handles a deleted return floor', () => {
    const s = setup(), floor = s.game.tower.addFloor('landmark'); floor.landmark = 'gallery';
    const resident = s.game.residents[0];
    resident.state = { kind: 'idle', floor: floor.level, activity: { kind: 'leisure', floor: floor.level }, until: s.town.time + 60 };
    s.inspector.select({ kind: 'floor', towerId: s.game.id, level: floor.level });
    expect(s.controls.get('[data-floor-resident]')).toHaveLength(1);
    s.controls.get('[data-floor-resident]')![0].click();
    const back = s.controls.get('[data-resident-back]')![0]; s.game.tower.floors.pop(); back.click();
    expect(s.inspector.current).toBeNull(); expect(s.onChanged).not.toHaveBeenCalled();
  });
  it.each([false, true])('takes a worried neighbor to the correct lift diagnostics without spending (visiting=%s)', (visiting) => {
    const s = setup(visiting), resident = s.game.residents[0];
    resident.jobFloor = 1; resident.jobTowerId = s.game.id; resident.happiness = 40;
    vi.spyOn(s.game, 'averageWait').mockReturnValue(60);
    const before = JSON.stringify({ people: s.town.allResidents(), coins: s.town.economy.coins });
    s.inspector.select({ kind: 'resident', residentId: resident.id });
    expect(s.root.innerHTML).toContain('strongest current pressure: long lift queues');
    expect(s.root.innerHTML).toContain('daily review');
    expect(s.root.innerHTML).toContain('Inspect my home lifts');
    s.controls.get('[data-resident-help]')![0].click();
    expect(s.inspector.current).toEqual({ kind: 'transit', towerId: s.game.id });
    expect(s.onFocusTower).toHaveBeenCalledWith(s.game.id, 0);
    expect(s.root.innerHTML).toContain('Getting around');
    expect(s.root.innerHTML.includes('id="insp-lift-speed"')).toBe(!visiting);
    expect(s.onChanged).not.toHaveBeenCalled();
    expect(JSON.stringify({ people: s.town.allResidents(), coins: s.town.economy.coins })).toBe(before);
    expect(s.root.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it('reevaluates an old help button after the resident’s concern changes or they leave', () => {
    const s = setup(), resident = s.game.residents[0];
    const wait = vi.spyOn(s.game, 'averageWait').mockReturnValue(60);
    s.inspector.select({ kind: 'resident', residentId: resident.id });
    const help = s.controls.get('[data-resident-help]')![0];
    wait.mockReturnValue(0); // Now an unemployed resident, not a lift problem.
    help.click(); expect(s.inspector.current).toEqual({ kind: 'happiness' });
    expect(s.onFocusTower).not.toHaveBeenCalled();
    s.inspector.select({ kind: 'resident', residentId: resident.id });
    const departedHelp = s.controls.get('[data-resident-help]')![0];
    s.game.residents = s.game.residents.filter((r) => r.id !== resident.id);
    departedHelp.click(); expect(s.inspector.current).toBeNull();
    expect(s.onChanged).not.toHaveBeenCalled();
  });
  it('explains housing honestly and distinguishes daily mood from current travel pressures', () => {
    const s = setup();
    for (const r of s.game.residents) r.needs = { housing: 60, employment: 100, food: 100, entertainment: 100 };
    s.inspector.select({ kind: 'happiness' });
    expect(s.root.innerHTML).toContain('reviewed at day’s end');
    expect(s.root.innerHTML).toContain('current queues and zoning');
    expect(s.root.innerHTML).toContain('do not relocate existing households');
    expect(s.onChanged).not.toHaveBeenCalled();
  });
  it('escapes named workplace moments in a contented resident’s thought', () => {
    const s = setup(), r = s.game.residents[0], floor = s.game.tower.addFloor('office');
    floor.name = '<Atlas & friends>';
    r.jobFloor = floor.level; r.jobTowerId = s.game.id;
    r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'work', floor: floor.level }, until: s.town.time + 60 };
    s.inspector.select({ kind: 'resident', residentId: r.id });
    expect(s.root.innerHTML).toContain('on shift at &lt;Atlas &amp; friends&gt;');
    expect(s.root.innerHTML).not.toContain('<Atlas & friends>');
    expect(s.controls.get('[data-resident-help]')).toHaveLength(0);
  });
  it.each([false, true])('keeps saved names and adds escaped home context in the town directory (visiting=%s)', (visiting) => {
    const s = setup(visiting);
    s.game.name = '<Willow & Lantern>';
    const [first, second] = s.game.residents;
    first.name = second.name = 'Bo';
    first.homeFloor = 1; second.homeFloor = 2;
    s.inspector.select({ kind: 'journal' });
    expect(s.root.innerHTML).toContain('&lt;Willow &amp; Lantern&gt; · Floor 1');
    expect(s.root.innerHTML).toContain('&lt;Willow &amp; Lantern&gt; · Floor 2');
    expect(s.root.innerHTML).not.toContain('<Willow & Lantern>');
    expect([first.name, second.name]).toEqual(['Bo', 'Bo']);
    const secondCard = s.controls.get('[data-resident]')!.find((control) => control.dataset.resident === second.id)!;
    secondCard.click();
    expect(s.inspector.current).toEqual({ kind: 'resident', residentId: second.id });
    expect(s.onChanged).not.toHaveBeenCalled();
  });
  it.each([false, true])('opens room exploration without editing the town (visiting=%s)', (visiting) => {
    const s = setup(visiting), coins = s.town.economy.coins;
    s.inspector.select({ kind: 'floor', towerId: s.game.id, level: 1 });
    expect(s.root.innerHTML).toContain('Explore this room');
    s.controls.get('[data-explore-room]')![0].click();
    expect(s.inspector.current).toBeNull(); expect(s.root.style.display).toBe('none');
    expect(s.onExploreRoom).toHaveBeenCalledWith(s.game.id, 1);
    expect(s.onChanged).not.toHaveBeenCalled(); expect(s.town.economy.coins).toBe(coins);
  });
  it('lists only hosts living in this tower, in stable name order, with one shared bonus', () => {
    const s = setup();
    expect(s.root.innerHTML).toContain('Meet your neighborhood hosts');
    expect(s.root.innerHTML).toContain('this bonus does not stack');
    expect(s.controls.get('[data-resident]')?.map((c) => c.dataset.resident)).toEqual(s.game.residents.slice(0, 2).map((r) => r.id));
    const maya = s.game.residents[0]; maya.homeTowerId = 't1';
    s.inspector.refresh(true);
    expect(s.controls.get('[data-resident]')?.map((c) => c.dataset.resident)).toEqual([s.game.residents[1].id]);
    s.game.residents[1].townRole = undefined; s.inspector.refresh(true);
    expect(s.root.innerHTML).not.toContain('Meet your neighborhood hosts');
  });

  it.each([false, true])('opens the selected host and returns to the lobby without mutation (visiting=%s)', (visiting) => {
    const s = setup(visiting), noah = s.game.residents[1];
    s.controls.get('[data-resident]')![1].click();
    expect(s.inspector.current).toEqual({ kind: 'resident', residentId: noah.id });
    expect(s.onFocusTower).toHaveBeenCalledWith(noah.homeTowerId);
    expect(s.root.innerHTML).toContain('Portrait of Noah');
    expect(s.root.innerHTML).toContain('does not stack');
    expect(s.root.tabIndex).toBe(-1);
    expect(s.root.focus).toHaveBeenCalledWith({ preventScroll: true });
    s.controls.get('[data-tower]')![0].click();
    expect(s.inspector.current).toEqual({ kind: 'floor', towerId: s.game.id, level: 0 });
    expect(s.root.innerHTML.includes('id="tower-name"')).toBe(!visiting);
    expect(s.onChanged).not.toHaveBeenCalled();
  });

  it('escapes names and safely refreshes a card whose resident has departed', () => {
    const s = setup(), maya = s.game.residents[0];
    maya.name = '<Maya & friends>'; s.inspector.refresh(true);
    expect(s.root.innerHTML).toContain('&lt;Maya &amp; friends&gt;');
    expect(s.root.innerHTML).not.toContain('<Maya & friends>');
    const stale = s.controls.get('[data-resident]')!.find((c) => c.dataset.resident === maya.id)!;
    s.game.residents = s.game.residents.filter((r) => r.id !== maya.id);
    stale.click();
    expect(s.inspector.current).toEqual({ kind: 'floor', towerId: s.game.id, level: 0 });
    expect(s.onFocusTower).not.toHaveBeenCalled();
    expect(s.root.innerHTML).not.toContain('&lt;Maya &amp; friends&gt;');
  });
});

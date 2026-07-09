import { GAME_MINUTES_PER_SECOND } from './core/types';
import { Game } from './core/game';
import { loadGame, saveGame, clearSave } from './core/save';
import { createScene, trackTowerHeight, updateDaylight } from './render/scene';
import { FloorViews } from './render/floors';
import { CharacterViews } from './render/characters';
import { ElevatorViews } from './render/elevatorView';
import { Hud, Toaster } from './ui/hud';
import { BuildMenu } from './ui/buildMenu';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = createScene(canvas);

let game = loadGame() ?? new Game();

const floorViews = new FloorViews(ctx.scene);
const characterViews = new CharacterViews(ctx.scene);
const elevatorViews = new ElevatorViews(ctx.scene);

const hud = new Hud(document.getElementById('hud')!);
const toaster = new Toaster(document.getElementById('toast')!);
const buildMenu = new BuildMenu(
  document.getElementById('build-menu')!,
  game,
  toaster,
  () => saveGame(game),
  () => {
    clearSave();
    location.reload();
  },
);

let last = performance.now();
let saveTimer = 0;

function frame(now: number): void {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const gameDt = realDt * GAME_MINUTES_PER_SECOND;
  game.tick(gameDt);
  for (const event of game.events) toaster.show(event.message);

  floorViews.sync(game.tower.floors);
  characterViews.sync(game.residents, game.elevator, realDt);
  elevatorViews.sync(game.elevator);
  updateDaylight(ctx, game.timeOfDay);
  trackTowerHeight(ctx, game.tower.floors.length);

  hud.update(game);
  buildMenu.update();

  saveTimer += realDt;
  if (saveTimer > 15) {
    saveTimer = 0;
    saveGame(game);
  }

  ctx.controls.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

window.addEventListener('beforeunload', () => saveGame(game));

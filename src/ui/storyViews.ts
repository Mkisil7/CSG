import type { Resident } from '../core/types';
import type { ResidentStory } from '../core/stories';
import { residentAppearance } from '../core/roomLife';
import type { Town } from '../core/town';
import { storyPlace } from '../core/stories';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A small stable portrait, recognizable across journal, profile and neighbor list. */
export function residentPortrait(r: Resident): string {
  const colors = residentAppearance(r);
  const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  const skin = hex(colors.skin), hair = hex(colors.hair), shirt = hex(colors.shirt);
  return `<svg class="resident-portrait" viewBox="0 0 64 64" role="img" aria-label="Portrait of ${escapeHtml(r.name)}">
    <rect width="64" height="64" rx="20" fill="#e5e8df"/>
    <path d="M9 64v-8c0-19 46-19 46 0v8" fill="${shirt}"/>
    <path d="M27 38h10v13H27z" fill="${skin}"/>
    <ellipse cx="32" cy="28" rx="16" ry="19" fill="${skin}"/>
    <path d="M16 28C10 4 51 0 49 29l-5-13c-6 6-15 2-20 0l-8 12" fill="${hair}"/>
    <circle cx="26" cy="29" r="1.5" fill="#382a27"/><circle cx="38" cy="29" r="1.5" fill="#382a27"/>
    <path d="M28 37q4 3 8 0" fill="none" stroke="#955743" stroke-width="1.6" stroke-linecap="round"/>
    ${r.traits.includes('techie') ? '<path d="M21 26h10v7H21zm12 0h10v7H33zm-2 2h2" fill="none" stroke="#3b4949" stroke-width="1.3"/>' : ''}
  </svg>`;
}

export function storyRow(story: ResidentStory, activeIds: Set<string>, town?: Town): string {
  const id = story.residentIds.find((candidate) => activeIds.has(candidate));
  const icons = { arrival: '↗', career: '★', friendship: '♡', concern: '!', recovery: '☀', departure: '↗', place: '✦' };
  const body = `<span class="story-symbol story-${story.kind}">${icons[story.kind]}</span>
    <span><small>DAY ${story.day} · ${story.kind}</small><strong>${escapeHtml(story.title)}</strong><span>${escapeHtml(story.text)}</span></span>`;
  if (town && storyPlace(town, story)) return `<button class="story-row" data-story-place="${story.id}" data-story-id="${story.id}">${body}</button>`;
  return id ? `<button class="story-row" data-resident="${escapeHtml(id)}" data-story-id="${story.id}">${body}</button>` : `<div class="story-row">${body}</div>`;
}

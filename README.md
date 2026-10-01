# Ashen Rift

Three.js dungeon RPG with an anonymous arcade leaderboard backed by Cloudflare D1.

## Build

Run `npm ci` and `npm run build`. Game assets and browser modules live in `public/`. The build copies them to `dist/client/` and emits the Cloudflare Worker in `dist/server/`.

For game-only local testing, run `python3 -m http.server 8080 --directory public`. The leaderboard needs the Worker and a D1 binding named `DB`; it shows an unavailable state when served by a plain static server.

## Leaderboard

Death prompts for an optional public name (1–16 characters). A run can be submitted once; retrying cannot duplicate it. Scores award 10,000 per completed rift, 100 per kill and 250 per character level above 1. A new expedition gets a new run ID. No account is required.

D1 schema lives in `db/schema.ts`; generated migrations and snapshots live in `drizzle/`. Sites provisions and binds D1 using `.openai/hosting.json`, applies migrations, and publishes the Worker. Generate new migrations with `npm run db:generate`; preserve applied migrations.

The server validates names and run statistics, computes scores, rejects repeated submissions, and limits run registration per hashed visitor IP. Scores still come from a browser game; this is a casual leaderboard, not a cheat-proof competitive service. Raw IP addresses are not stored.

## Characters and combat

`public/characters.js` builds a shared low-poly geometry and animation clips for each family. Every actor owns one SkinnedMesh, a 20-bone skeleton and its own material palette. Idle/walk clips blend; attacks and hit reactions use additive clips. Robe panels and cape are skinned animation, not a cloth physics simulation. Gear controls robe, hood, leggings, staff and offhand colors.

Monster families: ghouls, casters, brutes, hunters and sentinels, plus the Warden. Hunters telegraph lunges, casters wind up shots, and armored sentinels reduce incoming damage. Brutes/sentinels telegraph area strikes; freezing or stunning cancels the windup. Later rifts introduce larger elite variants. Geometry and clips are cached; corpse skeletons are removed after a brief death animation, with at most eight retained.

Rollback baseline: Site version 41, source commit `70733da6d104d11f09cccfce39a377fa8a2acce1`. Republish that Site version to restore its visuals and combat; its existing D1 schema remains compatible.

## Expedition revives and enemy support

An expedition starts with three optional revives, giving four attempts total. Death offers Revive or End run/High score. Revive resets the current dungeon layout, enemies, chests and boss while retaining character level, inventory, gold, cumulative kills and the leaderboard run ID. Health is restored and at least three potions are supplied. A revive is consumed only when chosen; ending or exhausting the run opens score submission. A fresh expedition resets the allowance.

Rift health and damage increase progressively, and enemy damage also grows with character level. Armor now reduces a proportion of damage instead of subtracting a flat amount that could make weak attacks harmless.

Spiders have eight articulated legs and slow on contact; demons join Hell Gates. Healers appear from rift 2, restore nearby wounded allies, and have limited charges with a five-second cooldown. Wounded casters, hunters, demons and healers can retreat and recover once, after reaching safety and avoiding burning/poison.

Theme backgrounds use one image per rift with cropped UV parallax. See `tools/backdrop-notes.md` for generation prompts and asset paths.

## Soundtracks and larger rifts

Uploaded soundtrack files are copied unchanged into `public/audio/`: castle.mp3 → castle, frozen_ice.mp3 → frozen, hell_cave.mp3 → hell, Jungle.mp3 → jungle. Music begins on Start, loops, and streams through one reusable HTML audio player. Theme changes fade the old track out, explicitly load the mapped filename on that same player, and fade the new track in; reviving keeps the same track running. Volume/mute are device-local preferences. Hidden tabs pause playback; an Enable music action handles blocked browser playback.

Rifts now have seven larger main chambers, with the boss, portal and enchanter in the final chamber. Nearby-space indexing limits dungeon field queries to keep larger generation responsive. Enemy health rises by 40% (bosses by 25%) relative to Build 43.

## Effects and bulk salvage

The uploaded grass/stone steps, Fireball cast, explosion, heal request and four pain voice variations are mapped in `public/sound-effects.js`. Short effects are decoded once into Web Audio buffers. Footfall cues follow the mage's walking animation and require actual movement; Fireball/Meteor impacts, potion use and damage events trigger their matching sounds. Voice lines are exclusive; explosion bursts and simultaneous sources are bounded. Effects have separate saved mute/volume controls.

Gear can be locked from item details. The enchanter offers confirmed bulk salvage of unlocked backpack gear. Worn equipment, locked gear and loose gems are protected; socketed gems are recovered. Capacity is checked for the entire operation before any mutation. Locks also prevent single-item salvage and discard until unlocked.

Item details are a nonmodal inspector over the character column; the backpack stays clickable, so selecting another item replaces the inspector content directly.

Theme geometry now differs: castles use tighter, straighter courtyard/hall layouts; jungles have broad circular clearings, wider winding routes and grove circuits; hell uses forked caverns and jagged descents; frozen crypts use elongated vaults, narrow connectors and glacial circuits. Layouts remain seeded and connected, with the Warden in the final chamber.

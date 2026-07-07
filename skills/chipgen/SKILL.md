---
name: chipgen
description: Generate local 8-bit game audio assets with a bundled zero-dependency Node CLI. Use when the user wants AI-agent-generated chiptune BGM, natural-language game music briefs turned into mood/key/BPM choices, seeded 8-bit music, WAV/MIDI exports, sound effects, SFX variation pools, or Godot AudioStreamRandomizer resources.
---

# Chipgen

Use the bundled Node script to generate deterministic 8-bit music and SFX locally. Require Node.js 16 or newer.

The script is at `scripts/chipgen.js` relative to this skill folder. Run it with `node` and capture stdout as JSON. Errors are written to stderr.

## Workflow

1. Resolve the output directory. If the user does not specify one, use `generated-audio/` in the current project.
2. Choose parameters from the user request using the brief-to-parameters rules below. If a seed is not provided, choose one and report it so the result can be reproduced.
3. Run `node <skill-dir>/scripts/chipgen.js list` when you need valid moods, keys, or SFX categories.
4. Generate the requested assets.
5. Read the JSON manifest from stdout and report the generated file paths, seed, mood/category, BPM, and any MIDI/stem/tres outputs.

## Brief-to-Parameters

Infer parameters from natural-language game audio briefs. Prefer a reasonable first pass over asking questions unless the request has incompatible constraints.

### Music mood selection

- Use `adventure` for overworld, journey, opening, exploration, heroic, hopeful, bright, title-screen, map, discovery, forest, sky, sea, or general platformer BGM.
- Use `battle` for regular combat, chase, danger, action, timed challenge, enemy waves, fast arcade intensity, or tense gameplay that is not a boss fight.
- Use `boss` for boss, final boss, rival battle, climactic, oppressive, demonic, high-stakes, late-game, raid, or "make it more intense than battle".
- Use `town` for town, village, shop, inn, home base, safe zone, cozy, friendly NPC, crafting, farm, light menu BGM, or everyday scenes.
- Use `dungeon` for cave, ruins, mystery, stealth, maze, night, sewer, laboratory, alien, haunted, underwater, snow/ice when the brief says lonely/cold/mysterious rather than tragic.
- Use `sad` for loss, game over, memory, ending, ruined home, farewell, death, loneliness, melancholy, emotional cutscene, or snow/ice when the brief is explicitly sorrowful.

When a brief mixes moods, choose the gameplay function first, then emotion. Example: "sad boss battle" should be `boss`; "lonely snow level but not too slow" should usually be `dungeon` with an upper-range BPM, not `sad`.

### Music key, bars, and BPM

- Use explicit key requests directly. Map "minor" briefs to `A`, `D`, or `E` when no exact key is specified. Map bright/heroic/cozy briefs to `C`, `F`, or `G`. Use `random` when the user wants surprise or gives no tonal direction.
- Use 8 bars for quick previews, short loops, stingers, or many candidates. Use 16 bars for normal looping BGM. Use 32 bars for longer ambient/background requests.
- If BPM is unspecified, let the generator choose within the mood range. If the user asks for faster/slower, set BPM near the top/bottom of the selected mood range. If the user says "not too slow", avoid `sad` unless the emotion demands it, or set `sad` near 92 BPM.
- For final or production-ready BGM, include `--midi --stems`. For exploration, include `--variants 5` unless the user asks for a single result.

### SFX category selection

- Use `coin` for pickup, collect, reward, gem, item acquired, score, or confirm-positive.
- Use `jump` for jump, hop, bounce, spring, UI upward motion, or character lift.
- Use `laser` for shoot, projectile, zap, ray, spell cast, blaster, or quick magic attack.
- Use `hit` for damage, punch, impact, hurt, block, enemy struck, or UI error tap.
- Use `explosion` for explosion, break, crash, blast, destruction, barrel, bomb, or big impact.
- Use `powerup` for upgrade, level up, unlock, buff, heal, rare item, success flourish, or transformation.
- Use `blip` for UI cursor, menu move, small select, typing, notification, low-key beep, or neutral interface feedback.
- Use `fall` for falling, fail, drop, lose, wrong answer, down transition, or game-over sting.

For repeated gameplay SFX, generate `--variants 5`. For UI sounds, generate 3-5 candidates and keep durations short by choosing `blip`, `coin`, or `hit` rather than `random`.

## Commands

List supported values:

```bash
node <skill-dir>/scripts/chipgen.js list
```

Generate BGM:

```bash
node <skill-dir>/scripts/chipgen.js music \
  --mood battle \
  --key A \
  --bars 16 \
  --seed 42 \
  --stems \
  --midi \
  --out generated-audio/bgm
```

Generate BGM candidates from one seed family:

```bash
node <skill-dir>/scripts/chipgen.js music \
  --mood boss \
  --key A \
  --bars 16 \
  --seed 42 \
  --variants 5 \
  --midi \
  --out generated-audio/bgm
```

Generate one SFX:

```bash
node <skill-dir>/scripts/chipgen.js sfx \
  --cat coin \
  --seed 123 \
  --out generated-audio/sfx
```

Generate an SFX variation pool for Godot:

```bash
node <skill-dir>/scripts/chipgen.js sfx \
  --cat hit \
  --seed 88 \
  --variants 5 \
  --tres generated-audio/sfx/hit_pool.tres \
  --res-prefix res://assets/audio/sfx/ \
  --out generated-audio/sfx
```

## Parameters

Supported moods are `adventure`, `battle`, `town`, `dungeon`, `sad`, and `boss`.

Supported SFX categories are `coin`, `jump`, `laser`, `hit`, `explosion`, `powerup`, `blip`, `fall`, and `random`.

Useful options:

- `--bpm N`: Override generated BPM.
- `--bars N`: Music length. Use 8, 16, or 32 unless the user asks otherwise.
- `--sr N`: Sample rate. Default is 44100.
- `--midi`: Export MIDI for music.
- `--stems`: Export separate music stems.
- `--variants N`: Generate a seed family. For music, keep mood, resolved key, bars, and BPM fixed while deriving new seeds. For SFX, keep category fixed.
- `--no-mix`: Skip mixed WAV.
- `--no-normalize`: Disable SFX normalization.
- `--tres PATH`: Write a Godot `AudioStreamRandomizer` resource.
- `--res-prefix PREFIX`: Resource prefix used inside the generated Godot `.tres`.

## Defaults

For game-ready BGM, prefer `--stems --midi` unless the user only wants a quick preview.

For music exploration, generate 5-10 candidates from one base seed. In CLI output, `variantIndex: 0` is the base seed and later items use `variantSeed = (baseSeed + 0x9E3779B9 * index) >>> 0` with index starting at 1. Keep `mood`, resolved `key`, `bars`, and `bpm` fixed so the candidates feel related rather than random.

For SFX meant for repeated in-game playback, prefer `--variants 5` and keep the same category with different seeded variants.

For Godot projects, use `assets/audio/bgm` and `assets/audio/sfx` when those directories exist. Remind the user that Godot WAV imports may need loop mode enabled for looping BGM.

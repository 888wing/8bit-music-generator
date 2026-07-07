# 8-Bit Music Generator

A browser prototype and local Codex skill for generating seeded 8-bit music and sound effects.

## Browser prototype

Try the browser demo:

https://888wing.github.io/8bit-music-generator/

For local use, open `8bit-music-generator.html` in a browser.

## Language support

The browser app is English-first and defaults to English. Traditional Chinese is available from the language switch in the header.

For future feature work, write new UI copy, manifests, and documentation in English first, then add Traditional Chinese translations where user-facing text needs both locales.

## Install the local skill

Install the bundled skill into Codex:

```bash
./install-skill.sh
```

If a previous copy exists:

```bash
./install-skill.sh --force
```

Restart Codex after installation. Then ask an agent with prompts like:

```text
Use $chipgen to generate a 16-bar boss battle BGM in A minor with MIDI and stems.
```

```text
Use $chipgen to make 5 BGM candidates for a lonely snow stage that should feel cold and mysterious but not too slow.
```

```text
Use $chipgen to create 5 coin SFX variants for a Godot project.
```

## Direct CLI usage

The skill uses a zero-dependency Node CLI:

```bash
node skills/chipgen/scripts/chipgen.js list
node skills/chipgen/scripts/chipgen.js music --mood battle --key A --bars 16 --seed 42 --stems --midi --out generated-audio/bgm
node skills/chipgen/scripts/chipgen.js music --mood boss --key A --bars 16 --seed 42 --variants 5 --midi --out generated-audio/bgm
node skills/chipgen/scripts/chipgen.js sfx --cat coin --seed 123 --out generated-audio/sfx
```

Outputs are deterministic from the command parameters and seed. The CLI prints a JSON manifest to stdout.

## Music seed variants

Variants keep the musical brief fixed and only change the deterministic seed:

```text
variantSeed = (baseSeed + 0x9E3779B9 * index) >>> 0
```

For useful A/B listening, keep `mood`, resolved `key`, `bars`, and `bpm` fixed. This creates related candidates with different melodies, progressions, and rhythms without changing the overall direction. In the CLI, `--variants 5` outputs 5 candidates total, with `variantIndex: 0` using the base seed.

The skill includes a natural-language mapping layer. For example, boss/final/climactic maps to `boss`, village/shop/cozy maps to `town`, and lonely cold mystery usually maps to `dungeon` unless the brief is explicitly tragic.

## License

MIT

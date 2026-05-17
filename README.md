<div align="center">

# ctc — commits to changelogs

**Turn your git commits into a polished `CHANGELOG.md` with AI.**

Multi-provider, free-tier friendly. Works with [OpenRouter](https://openrouter.ai), [Google Gemini](https://ai.google.dev), [Groq](https://groq.com), [Cerebras](https://cerebras.ai), or any OpenAI-compatible endpoint.

[![npm](https://img.shields.io/npm/v/commits-to-changelogs.svg?style=flat-square&color=8b5cf6)](https://www.npmjs.com/package/commits-to-changelogs)
[![license](https://img.shields.io/npm/l/commits-to-changelogs.svg?style=flat-square&color=8b5cf6)](LICENSE)
[![node](https://img.shields.io/node/v/commits-to-changelogs.svg?style=flat-square&color=8b5cf6)](package.json)

</div>

---

## Why

Writing a changelog by hand is tedious. Most generators just dump conventional-commit lines into a file. `ctc` reads your commits, sends them to an AI of your choice, and asks it to rewrite them as the kind of changelog you actually want to ship — grouped, plain-English, and linked back to short SHAs.

It runs locally, supports several free providers out of the box, and remembers where it last ran so the next invocation just generates the diff.

## Install

```bash
pnpm add -g commits-to-changelogs   # or npm i -g / yarn global add
```

Then in any repo:

```bash
ctc setup    # one-time interactive setup
ctc          # generate / update CHANGELOG.md
```

## Quick start

```bash
$ ctc setup
◆ pick an AI provider
│ ● OpenRouter (has free models)
│ ○ Google Gemini (generous free tier)
│ ○ Groq (fast, free tier)
│ ○ Cerebras (very fast, free tier)
│ ○ OpenAI-compatible (custom)
…
✔ saved user config → ~/.config/ctc/config.json

$ ctc --dry-run
┌  ctc · generate
│
◇  context
│  provider: OpenRouter
│  model:    deepseek/deepseek-chat-v3.1:free
│  style:    keepachangelog
│  output:   CHANGELOG.md
│  range:    last tag v0.1.0 → HEAD
│  commits:  12 kept (12 total)
…
```

## Supported providers

| Provider              | Free tier        | Default model                              | Env var                  |
| --------------------- | ---------------- | ------------------------------------------ | ------------------------ |
| **OpenRouter**        | ✅ free models   | `deepseek/deepseek-chat-v3.1:free`         | `CTC_OPENROUTER_API_KEY` |
| **Google Gemini**     | ✅               | `gemini-2.5-flash`                         | `CTC_GEMINI_API_KEY`     |
| **Groq**              | ✅               | `llama-3.3-70b-versatile`                  | `CTC_GROQ_API_KEY`       |
| **Cerebras**          | ✅               | `llama-3.3-70b`                            | `CTC_CEREBRAS_API_KEY`   |
| **OpenAI-compatible** | depends on host  | _custom_ (Mistral, Together, Ollama, etc.) | `CTC_CUSTOM_API_KEY`     |

All providers go through a single OpenAI-compatible chat-completions client, so swapping is one flag: `ctc -p groq`.

## Commands

```
ctc [generate]                 generate a changelog from your commits (default)
ctc setup                      interactive provider + defaults wizard
ctc config get [key]           print full config or a single dotted key
ctc config set <key> <value>   set a value (add --project to write project config)
ctc config path                print the config file path
ctc config edit                open the config file in $EDITOR
ctc providers                  table of providers + status (key present, model)
```

### Useful flags

| Flag                          | Meaning                                                |
| ----------------------------- | ------------------------------------------------------ |
| `--from <ref>`                | start commit/tag (exclusive)                           |
| `--to <ref>`                  | end commit (default: `HEAD`)                           |
| `--output <path>`             | output file (default: `CHANGELOG.md`)                  |
| `--style <id>`                | `keepachangelog` (default), `conventional`, `minimal`  |
| `--version-label <label>`     | version header (e.g. `1.2.0` or `Unreleased`)          |
| `--unreleased`                | force `Unreleased` header                              |
| `--provider <id>`             | one-off provider override                              |
| `--model <id>`                | one-off model override                                 |
| `--dry-run`                   | print the result without writing the file              |
| `--no-stream`                 | disable streaming output                               |
| `-y, --yes`                   | skip confirmation prompts                              |

## How it picks the commit range

`ctc` looks at the existing `CHANGELOG.md` for a marker like:

```html
<!-- ctc:last 3a67b24c... -->
```

That marker is written automatically every time `ctc` updates the file. On subsequent runs the range is `(last marker)..HEAD`, so you only get the diff. If no marker is found, it falls back to the latest git tag, and finally to the last 50 commits. You can always override with `--from` / `--to`.

## Configuration

`ctc` reads, in order (later wins): defaults → user config → project config → env vars.

- **User config:** `~/.config/ctc/config.json` (path depends on OS, via [`env-paths`](https://github.com/sindresorhus/env-paths))
- **Project config:** `ctc.config.json` or `.ctcrc.json` at the repo root

Full schema:

```jsonc
{
  "defaultProvider": "openrouter",
  "providers": {
    "openrouter":  { "apiKey": "sk-or-...", "model": "deepseek/deepseek-chat-v3.1:free" },
    "gemini":      { "apiKey": "...",       "model": "gemini-2.5-flash" },
    "groq":        { "apiKey": "...",       "model": "llama-3.3-70b-versatile" },
    "cerebras":    { "apiKey": "...",       "model": "llama-3.3-70b" },
    "openai-compatible": {
      "apiKey": "...",
      "baseUrl": "https://api.mistral.ai/v1",
      "model": "mistral-large-latest",
      "name": "Mistral"
    }
  },
  "output": "CHANGELOG.md",
  "style": "keepachangelog",
  "groupBy": "type",
  "ignore": ["^chore: release", "^Merge "]
}
```

### Environment overrides

- `CTC_PROVIDER` — provider id
- `CTC_MODEL` — model id (applied to the active provider)
- `CTC_OPENROUTER_API_KEY` / `CTC_GEMINI_API_KEY` / `CTC_GROQ_API_KEY` / `CTC_CEREBRAS_API_KEY` / `CTC_CUSTOM_API_KEY`

## Contributing

PRs welcome. Build locally:

```bash
pnpm install
pnpm run build
node dist/index.js --help
```

Type-check with `pnpm exec tsgo --noEmit`, lint with `pnpm exec oxlint`.

## License

MIT © [byigitt](https://github.com/byigitt)

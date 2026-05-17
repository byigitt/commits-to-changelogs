<div align="center">

# ctc — commits to changelogs

**Turn your git commits into a polished `CHANGELOG.md` with AI.**

Multi-provider, free-tier friendly. Works with OpenRouter, Gemini, Groq, Cerebras, or any OpenAI-compatible endpoint.

[![npm](https://img.shields.io/npm/v/commits-to-changelogs.svg?style=flat-square)](https://www.npmjs.com/package/commits-to-changelogs)
[![license](https://img.shields.io/npm/l/commits-to-changelogs.svg?style=flat-square)](LICENSE)

</div>

---

## Quick start

```bash
# install globally
pnpm add -g commits-to-changelogs

# one-time setup (pick a provider, paste your key)
ctc setup

# generate a changelog from your commits
ctc
```

## Supported providers

| Provider              | Free tier         | Default model                              | Env var                   |
| --------------------- | ----------------- | ------------------------------------------ | ------------------------- |
| OpenRouter            | yes (free models) | `deepseek/deepseek-chat-v3.1:free`         | `CTC_OPENROUTER_API_KEY`  |
| Google Gemini         | yes               | `gemini-2.5-flash`                         | `CTC_GEMINI_API_KEY`      |
| Groq                  | yes               | `llama-3.3-70b-versatile`                  | `CTC_GROQ_API_KEY`        |
| Cerebras              | yes               | `llama-3.3-70b`                            | `CTC_CEREBRAS_API_KEY`    |
| OpenAI-compatible     | depends           | custom                                     | `CTC_CUSTOM_API_KEY`      |

## Commands

```
ctc                    generate changelog (default)
ctc setup              interactive wizard
ctc generate [flags]   same as default, with flags
ctc config <action>    get / set / path / edit
ctc providers          list providers + status
```

## License

MIT © [byigitt](https://github.com/byigitt)

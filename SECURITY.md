# Security Policy

## Local-only assumptions

iLab GPT Conjure is designed for local personal workflows. Do not expose the
WebUI directly to the public internet unless you have reviewed and hardened the
deployment yourself.

## Secrets and local data

Do not publish OAuth tokens, API keys, account files, `.env` files, input images,
generated outputs, task metadata, SQLite databases, or debug logs.

Sensitive local paths include:

- `~/.codex/auth.json`
- `output/`
- `outputs/`
- `input/`
- `inputs/`

## Advanced local auth warning

The optional Codex / ChatGPT OAuth mode calls an internal ChatGPT backend
endpoint. It is not an officially recommended OpenAI API integration path and
may change or stop working without notice. Prefer OpenAI-compatible API mode for
stable integrations.

## Reporting issues

Please report security issues privately to the maintainer instead of opening a
public issue containing credentials, tokens, private prompts, or private images.

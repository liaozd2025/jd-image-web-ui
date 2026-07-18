# Domain Docs

This is a single-context repository.

## Before exploring

Read:

- `CONTEXT.md` at the repository root.
- Relevant accepted ADRs under `docs/adr/`.

Superseded ADRs are historical context only and must not override the accepted replacement.

## Layout

- `CONTEXT.md`: canonical domain vocabulary.
- `docs/adr/`: system-wide architecture decisions.

## Vocabulary

Use the canonical terms defined in `CONTEXT.md` in issues, plans, tests and implementation notes. Avoid synonyms that the glossary explicitly rejects.

If a required concept is missing, record the gap and resolve it through domain modeling rather than inventing competing terminology.

## Architecture decisions

If proposed work contradicts an accepted ADR, surface the conflict explicitly. Do not silently override an existing decision.

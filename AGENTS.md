## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `liaozd2025/jd-image-web-ui`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### UI change approval

The existing image workspace is the product UI baseline. Before generating a new
interface or making a substantial layout or interaction change, describe the
proposed change and obtain explicit user confirmation. Username/password sign-in
and per-user isolation must be integrated without replacing the image workspace.
Every user must sign in with an administrator-created account before entering the
server version's Web UI.

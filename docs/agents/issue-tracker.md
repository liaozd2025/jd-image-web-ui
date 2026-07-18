# Issue tracker: GitHub

Issues and PRDs for this repo live in GitHub Issues under `liaozd2025/jd-image-web-ui`. Use the `gh` CLI for all operations.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue: `gh issue view <number> --comments`
- List issues: use `gh issue list` with appropriate state and label filters.
- Comment: `gh issue comment <number> --body "..."`
- Apply or remove labels: use `gh issue edit`.
- Close: `gh issue close <number> --comment "..."`

Run commands inside this repository so `gh` resolves the `origin` remote automatically.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill conventions

- When a skill says “publish to the issue tracker”, create a GitHub issue.
- When a skill says “fetch the relevant ticket”, read the GitHub issue and its comments.
- GitHub issues are the source of truth for specifications, tickets and triage state.

# Git two-branch workflow

Mode: solo
Identity: 263138698+neuralrift@users.noreply.github.com

This repository follows the [Git two-branch workflow](https://github.com/neuralrift/git-clerk-workflow) (v2). Git operations by AI agents go through the `git-clerk` skill.

## Branches

- `dev` is the default branch and receives completed work; feature and fix branches (`feature/<topic>`, `fix/<topic>`) start from `dev`.
- `main` is release-only: each release is a `--no-ff` merge from `dev` with an annotated `vX.Y.Z` tag, followed by merging `main` back into `dev`.
- Never force-push `dev` or `main`; never move a published tag.

## Before committing

Run `npm test` before commits that change behaviour.

## Approvals

Commits, pushes, tags, branch deletion, resets, rebases and force-pushes need explicit approval from the repository owner.

## Exceptions

None.

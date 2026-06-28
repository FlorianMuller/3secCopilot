---
name: release
description: Cut a new release for 3sec Copilot — update CHANGELOG.md from commits since the last tag, then push a version tag so CI builds and publishes the sideload IPA. Use when the user asks to release, cut a release, ship a build, or bump the version.
user-invocable: true
---

# Release

Cuts a new release: finalizes `CHANGELOG.md` and pushes a `X.Y.Z` tag, which triggers
the [Sideload build workflow](../../../.github/workflows/sideload-build.yml) to build the
unsigned IPA and publish a GitHub Release. The tag becomes the app version
(`CFBundleShortVersionString`), so it must be a numeric `X.Y.Z`.

## Steps

### 1. Gather context

Run these to see what's shipping:

```sh
git describe --tags --abbrev=0          # latest tag, e.g. 0.0.5
git log <latest-tag>..HEAD --oneline    # commits since it
git status --short                       # working tree must be clean
```

If the working tree is dirty, stop and tell the user to commit or stash first.

### 2. Decide the next version

Read `CHANGELOG.md`. The `[Unreleased]` section is the source of truth for the release
notes. Bump from the latest tag using SemVer based on what's in Unreleased + the commits:

- **Patch** (`0.0.X`) — bug fixes / small additions. This project's default.
- **Minor** (`0.X.0`) — notable new features.
- **Major** (`X.0.0`) — breaking changes (rare for this app).

Confirm the proposed version with the user before tagging.

### 3. Reconcile the changelog with the commits

Compare `git log <latest-tag>..HEAD` against the `[Unreleased]` entries. For every
user-facing change in the commits that isn't already listed, add a bullet under the right
heading. Use the `Keep a Changelog` types already documented at the top of the file:
`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

Skip non-user-facing commits (CI, docs, tooling, merge commits, todo notes) — match the
existing entries' altitude: they describe features, not implementation.

### 4. Finalize the changelog

- Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` using **today's date** (the
  current date is provided in your context — do not run `date`, and do not guess).
- Insert it directly above the previous version section.
- Add a fresh empty `## [Unreleased]` block at the top so the next cycle has a home:

  ```markdown
  ## [Unreleased]

  ## [X.Y.Z] - YYYY-MM-DD

  ### Added
  ...
  ```

Show the user the final diff of `CHANGELOG.md` and get confirmation before committing.

### 5. Commit, tag, push

```sh
git add CHANGELOG.md
git commit -m "Release X.Y.Z"
git tag X.Y.Z
git push
git push --tags
```

Pushing the tag triggers CI. Do not create the GitHub Release by hand — the workflow
publishes it with the built IPA attached.

### 6. Report

Tell the user the tag is pushed and CI is building. Point them to the Actions tab /
Releases page: once the run finishes, the new release will have
`3secsCopilot-X.Y.Z.ipa` to download and install via SideStore/AltStore.

## Notes

- Tags must be numeric `X.Y.Z` (no `v` prefix) — the tag is used verbatim as the app version.
- Never push a tag before the changelog commit is in, so the release reflects the notes.
- See [Contributing.md](../../../Contributing.md) → "Sideload build" for the full CI flow.

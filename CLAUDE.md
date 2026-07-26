# AFKode

## Commit messages: Conventional Commits (required)

Every commit message on `main` — and therefore every PR that gets merged —
must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>
```

`.github/workflows/version-bump.yml` reads these on every push to `main` and
decides the version bump automatically:

- `fix: ...` → **patch** bump (`0.8.19` → `0.8.20`)
- `feat: ...` → **minor** bump (`0.8.19` → `0.9.0`)
- A `!` right after the type/scope (`feat!:`, `fix(pty)!:`) or a
  `BREAKING CHANGE:` footer in the commit body → **major** bump
  (`0.8.19` → `1.0.0`)
- `chore:`, `docs:`, `refactor:`, `test:`, `style:`, `ci:`, `build:` and
  anything else that isn't `fix`/`feat`/breaking → **no bump**

The workflow scans every commit since the last `v*` tag, takes the highest
level found (major beats minor beats patch), writes the new version into
`package.json`, `package-lock.json`, `src-tauri/Cargo.toml`,
`src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`, commits it as
`chore: bump version to X.Y.Z`, tags it `vX.Y.Z`, and dispatches
`release.yml` — which builds, signs/notarizes, and publishes installers for
Windows/macOS/Linux, and opens the winget-pkgs manifest PR. **A `fix:` or
`feat:` commit landing on `main` becomes a public release with no further
human step.**

Practical implications:

- **Do not hand-write `chore: bump version to ...` commits anymore** — the
  version files are the automation's responsibility now, not the
  contributor's or Claude's. Editing them by hand ahead of it just makes the
  automation's diff noisier (it still runs its own bump on top).
- **Pick the commit type deliberately.** A `fix:`/`feat:` on `main` is not
  cosmetic — it ships a signed installer to real users and opens a winget PR.
  If a change on `main` should NOT trigger a release (a docs tweak framed as
  `fix:` by habit, a revert, an internal-only change), use `chore:`,
  `docs:`, `refactor:`, etc. instead.
- **Squash-merge PRs with a properly-typed final message.** The workflow
  reads commit subjects on `main`, not PR titles — if a PR merges as a merge
  commit with all its intermediate WIP messages, every one of those subjects
  is scanned, so a stray `feat:` typo in an intermediate commit still forces
  a minor bump. Prefer squash merges with one clean Conventional Commit
  subject.
- **Multiple `fix`/`feat` commits in one push only bump once** — the
  workflow computes a single new version per run, taking the highest level
  among everything since the last tag, not one bump per commit.

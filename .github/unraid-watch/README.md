# Unraid watch

Tracks what FolderView3 asks of Unraid, reports when upstream changes it, and keeps a status view of where the
plugin stands. Both go to issue #52.

## What runs

- **check** (every CI run, offline). Reads each GraphQL document out of `scripts/*.js` and `*.page`, and each
  webgui PHP file the plugin references. Fails when a document is not a plain string, because nothing
  downstream could see it.
- **contract** (pull requests that touch `src/`, this directory or the workflow file, every push to `main` or
  `beta`, and daily for both). Validates every operation against the `unraid/api` schema on `main` and at the
  latest release, and confirms every watched path still exists upstream. Red means the plugin sends something
  that is no longer valid, or a file it depends on is gone. The daily run checks each branch with that branch's
  copy of the tool; a manual run checks the branch it is started on.
- **watch** (daily, on every push to `beta`, and by hand). It always reads the plugin on `beta`, whichever branch
  starts it, and does two things:
  - Posts a news comment when something changed since the previous run: the first heading of an Unraid OS
    release-notes file (a new beta, rc or stable), the Docker and VM part of the API schema, or commits on the
    watched files. A day with nothing relevant leaves no comment.
  - Rewrites the status comment. It is rebuilt from upstream on every run and only written when it reads
    differently, so it does not notify.

GitHub starts scheduled runs only from the default branch, and shows the Run workflow button only when the
workflow is there. While the workflow is on `beta` alone, the report runs on pushes to `beta` and by hand:

```sh
gh workflow run unraid-watch.yml --ref beta -f dry_run=false
```

Once it is on `main` the daily run starts by itself, and still reads `beta`.

## The status comment

- **Coming: merged, in no release**: what differs between the latest API release and `main`, and between the
  newest OS release and the webgui development branch.
- **Coming: released API, not in an OS build**: what differs between the API the newest OS release bundles and
  the latest API release.
- **Coming with X.Y**: what the newest OS pre-release has that the newest stable does not.
- **Operations by OS release**: how many of the plugin's operations are valid on the API each OS release
  bundles, and which fields are missing.
- **API not used yet**: Docker and VM operations the plugin never calls, and how much of each type it reads.
- **Still on legacy**: the webgui files the plugin still depends on.

OS versions and the API each one bundles are read from the release notes. They state it in prose, in several
styles; a release whose notes do not say is listed as not stated rather than guessed. Files are compared by
content, and commits are listed only when the older version is an ancestor of the newer one, which a release
branch often is not.

## Writing a GraphQL call

Pass the document to `fv3GraphQL(` or a `query:` key as one single-quoted string. A variable may be joined in
with `' + name + '` when `watch.json` has an `expand` rule naming the JS map that supplies its values.

## watch.json

- `paths`: upstream file, or directory with a trailing `/`, and the reason it matters. Reports print the reason.
- `endpoints`: URL prefix to upstream directory. Any PHP file the plugin references under a prefix is watched
  without being listed.
- `surface`: root fields matching this pattern, plus every type they reach, are the part of the schema that is
  compared. Fields the plugin uses are always included.
- `namespaces`: types whose fields are operations (`docker { start }`), so the status view can tell an unused
  operation from an unread field.
- `releases`: directory holding the OS release notes. `since` is the oldest OS release to list, and `tags` is
  the repository whose tags carry those OS versions.

## Running it by hand

```sh
pip install --require-hashes -r .github/unraid-watch/requirements.txt   # Python 3.10 or newer
python -m unittest discover -s .github/unraid-watch -p 'test_*.py'
python .github/unraid-watch/watch.py check
python .github/unraid-watch/watch.py contract --ref v4.35.1             # any unraid/api ref
python .github/unraid-watch/watch.py status                             # prints the status view, writes nothing
GITHUB_REPOSITORY=chodeus/folder.view3 python .github/unraid-watch/watch.py watch --dry-run
```

Set `GITHUB_TOKEN` for anything beyond `check`; without one GitHub allows 60 requests an hour.

## State

The position of the last run is a hidden marker at the end of the workflow's latest news comment on the issue.
With no marker the run stops instead of guessing. Start it by hand with `base`, for example
`-f base='unraid/api=v4.35.1 unraid/webgui=7.3.2 unraid/docs=main'`. The same input replays any range, and
`dry_run`, which is on unless you turn it off, prints both comments in the run summary without writing.

A run reads everything before it writes, and the comment that carries the position is its last write. A run that
fails is repeated in full by the next one.

Report runs go one at a time, and GitHub keeps only one waiting. A newer run replaces the waiting one, which then
shows as cancelled. Nothing is lost, because every run reports from the saved position, but a cancelled manual
run with `base` has to be started again.

The status comment carries no state. Delete it and the next run writes a new one.

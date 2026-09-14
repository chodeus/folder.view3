# Translation workflow — research notes

Research into how [autobrr](https://github.com/autobrr/autobrr) and [qui](https://github.com/autobrr/qui)
run their translations, and whether a hosted web tool (or Google Translate) is worth adopting for
FolderView3's language packs.

Status: **research only.** Nothing here is implemented yet.

---

## Summary

Neither autobrr nor qui uses a translation platform. No Crowdin, no Weblate, no Lokalise, no Tolgee —
verified by searching both repositories for platform config files and finding none. They use plain JSON
files in-tree, community contributors for intake, and — in qui's case — **a large suite of automated
checkers that run in CI**.

The transferable lesson is not which translator they use. It is that qui treats translation as a
*validation* problem rather than a *generation* problem. Producing candidate text is cheap and getting
cheaper; what breaks a language pack is a dropped `$1`, a mangled `<b>` tag, a missing plural form, or a
key that silently falls back to English. qui spends ~3,200 lines of script on catching exactly those,
and gates every PR on them.

For us the ranked answer is:

1. **Add a pack validator first** — it is the piece with real leverage, and we have none today.
2. **If we want a web tool, Weblate** — free forever for libre projects, and it can call Google Translate
   or DeepL as *suggestions* a human confirms.
3. **Do not wire Google Translate straight into the packs.** Our strings carry `$1` placeholders and
   inline HTML, which is precisely what raw MT destroys.

---

## 1. What autobrr and qui actually do

Both are the same team and the same stack, at two levels of maturity.

| | autobrr | qui |
|---|---|---|
| Library | `i18next` + `react-i18next` | `i18next` + `react-i18next` (same versions) |
| Layout | `web/src/i18n/locales/<lang>/<namespace>.json` | same |
| Namespaces | 5 (`auth`, `common`, `filters`, `options`, `settings`) | 10 (adds `torrents`, `dashboard`, `crossseed`, `rss`, `search`, `instances`, `automations`) |
| Locales | 8 — `en, cs, de, es, fr, no, ru, zh-CN` | 10 — `en, cs, de, fr, it, ko, pt-BR, uk, zh-CN, zh-TW` |
| Loading | English bundled eagerly; others lazy-loaded per namespace via `import.meta.glob` | same |
| Translation platform | none | none |
| Validation tooling | none | 11 scripts, ~3,200 lines, gated in CI |
| Contributor intake | GitHub PRs | Discord + GitHub Discussions |

Both are GPL-2.0. **We are MIT**, so we can borrow their *ideas* freely but must not copy their script
source into this repo.

### How the work actually gets done

qui's public documentation says plainly:

> Community members contribute translations. To add or improve a language, start a Discussion or contact
> the team on Discord. The file [`web/AGENTS.md`](https://github.com/autobrr/qui/blob/develop/web/AGENTS.md)
> documents the translation workflow.

That pointer is the tell. `AGENTS.md` is the instruction file for AI coding agents — qui also ships
`CLAUDE.md` and `GEMINI.md`. Their documented "translation workflow" is a set of rules written for a
model to follow, not a style guide for human translators. The substance of it:

- Read the English namespace JSON **and the surrounding UI** first; translate in product context rather
  than string by string.
- Preserve placeholders, HTML tags, keys, examples, paths, URLs, commands, and technical notation.
- Keep a glossary for product and domain terms; leave `qBittorrent`, `Prowlarr`, `DHT`, `PEX` in English
  where that reads better.
- Plurals use i18next v4 CLDR suffixes, spelled out per language — English needs `_one`/`_other`, Chinese
  and Korean take `_other` alone, Czech also needs `_few` (2–4), Ukrainian needs `_few` and `_many`.
- Never hardcode user-facing text or raw backend values into JSX.
- Locale-specific typography rules, e.g. Chinese prefers full-width `，。：；！？`.

Adding a language is a documented 5-step checklist that ends in "run `pnpm check:i18n`" and "update the
promoted language list in the README and docs so it stays accurate".

### The failure modes are visible in their history

qui's recent i18n commits are a catalogue of machine-translation damage being repaired:

```
fix(i18n): restore meaning dropped by three abbreviated translations
fix(i18n): render Czech instead of English for counts 2-4
fix(i18n): render the plural form for the ignored-paths count
fix(i18n): render the correct plural form for six count strings
chore(i18n): remove unreferenced locale blocks
refactor(i18n): consolidate locale coverage checkers
```

Missing plural categories, meaning lost to over-abbreviation, dead keys. This is the evidence that
generation is not the bottleneck — these all shipped, and the checkers grew in response.

### What qui's checkers verify

Per locale, against English, for every namespace:

| Check | Catches |
|---|---|
| Missing keys | untranslated strings falling back to English |
| Extra keys | stale keys left behind after an English rename |
| Interpolation parity | a dropped or renamed `{{var}}` |
| HTML tag parity | `<b>` opened and never closed, or a tag invented by the translator |
| Plural forms | CLDR categories the language requires but the file omits |
| Empty strings | a blank value rendering as nothing |
| Encoding | UTF-8 BOM, invalid JSON |
| Untranslated-value classification | a value identical to English that has no good reason to be |

Plus two repo-wide scanners: `find-hardcoded-i18n-literals` (user-facing text sitting in JSX instead of a
key — it walks the TypeScript AST looking at `title`/`placeholder`/`aria-label` attributes and variables
named `...Tooltip`, `...Label`, `errorMessage`, etc.) and `find-raw-backend-values` (backend enums like
`run.status` rendered straight to the user).

The subtlest one is worth calling out. A naive "is this value identical to English?" check is mostly
false positives, so qui classifies each match before reporting it — `path`, `url`, `pattern`, `example`,
`technical` are *explained* and reported as warnings; anything else is *unexplained* and reported louder.
It keeps an allowlist of passthrough terms and treats values under 5 characters, pure punctuation/digits,
and bare URLs as automatically fine.

---

## 2. How our setup differs

We are not a React app, and the differences matter for tooling choice.

| | qui | FolderView3 |
|---|---|---|
| Runtime | React 19 + Vite | Unraid PHP pages + jQuery |
| i18n library | `i18next` | `jquery.i18n` (Wikimedia "banana" format) |
| File layout | `locales/<lang>/<ns>.json`, nested | `langs/<lang>.json`, flat, with an `@metadata` block |
| Placeholders | `{{count}}` | `$1`, `$2` |
| Binding | `t("key")` in JSX | `data-i18n="key"` attributes + `$('body').i18n()` |
| Attribute form | n/a | `data-i18n="[value]add-folder"` |
| Fallback text | none | English written inline in the HTML |
| Build step | pnpm/Vite | **none** — no `package.json`, no Python deps |
| Toolchain in CI | Node | bash + `php -l` + `xmllint` |

Two of these are load-bearing:

- **We have no Node toolchain**, and adding one for a validator would be the first build dependency in
  the repo. A dependency-free Python 3 script fits our CI (`ubuntu-latest`) with nothing to install,
  alongside the existing PHP syntax check and manifest validation.
- **We have inline English fallback text**, which qui does not. That is an extra thing that can drift,
  and it does (see below).

---

## 3. Health of our packs today

Ran qui's checks by hand against `langs/*.json`. **Structurally we are in good shape** — better than a
machine-translated pack would be, which is consistent with these having come from human contributors
(`de` from kennymc.c, original English from scolcipitato).

297 message keys per pack.

| locale | keys | missing | extra | `$n` mismatch | HTML tag mismatch | empty | == English |
|---|---|---|---|---|---|---|---|
| de | 297 | 0 | 0 | 0 | 0 | 0 | 23 |
| es | 297 | 0 | 0 | 0 | 0 | 0 | 19 |
| fr | 297 | 0 | 0 | 0 | 0 | 0 | 22 |
| it | 297 | 0 | 0 | 0 | 0 | 0 | 18 |
| pl | 297 | 0 | 0 | 0 | 0 | 0 | 16 |
| zh | 297 | 0 | 0 | 0 | 0 | 0 | 6 |

Zero parity defects across the board. Worth protecting.

The `== English` column is almost entirely legitimate passthrough — `Docker`, `VM`, `CSS Tool`,
`Compose`, `WebUI`, `Tailscale WebUI`, `ID`, `Dashboard`, `Global`, `Regex:`. A handful more are correct
in the target language *and* identical to English by coincidence: `Console` in French and Italian,
`Version` and `Actions` and `Support` in French, `No` in Italian. This is exactly why qui's classifier
exists, and any checker we write needs the same allowlist or it will cry wolf 100+ times.

### Two real findings

**15 keys are defined in `en.json` but referenced nowhere in the source.** Dead weight that six
translators have been carrying:

```
backup-help                        backup-individual                  clear-all
css-advanced                       css-advanced-help                  css-presets
css-variables                      custom-action-tooltip              docker-settings
dashboard-update-container-tooltip dashboard-update-folder-tooltip    export-all
export-all-folders                 folder-preview-settings            folderview3-desc
```

Same cleanup as qui's `chore(i18n): remove unreferenced locale blocks`. No key is referenced-but-missing,
which is the more dangerous direction, so nothing is broken today.

**45 places where the inline HTML fallback disagrees with `en.json`.** 186 match; these do not:

| key | inline HTML | `en.json` |
|---|---|---|
| `custom-actions-cts` | `Conatiners:` | `Containers:` |
| `backup-restore` | `Backup` | `Import / Export (Backup)` |
| `docker` | `Docker Folders` | `Docker` |
| `vms` | `VM Folders` | `VMs` |
| `css-tool` | `CSS` | `CSS Tool` |
| `preview` | `Preview` | `Preview:` |
| `file-manager` | `File Manager` | `Open File Manager` |

Severity is modest but non-zero. `script.php` always loads `en.json` and `$('body').i18n()` overwrites
the inline text, so `en.json` wins — the inline copy only shows during the pre-load flash or if the pack
fails to fetch. The consequences are that an English user can see one label flash into another, the
author's intent (a short `CSS` tab label) is silently overridden by the pack, and anyone reading the page
source gets a misleading idea of what the UI says. The `Conatiners:` typo is a straightforward bug.

Both findings are mechanical and would be caught by a checker on every PR.

---

## 4. Web tool options

### Weblate — the strongest fit if we want a platform

[Hosted Weblate](https://weblate.org/) is **free forever for libre projects** — public source plus an
OSI- or FSF-recognised licence is the whole bar, and MIT qualifies. It is itself libre software, so
self-hosting stays an option if the hosted terms ever change.

What it gives us:

- **Machine translation as suggestions, not commits.** Google Translate (v2 and v3), DeepL,
  LibreTranslate and Apertium plug in as *automatic suggestions* a human confirms. This is the sane way
  to consume Google Translate: a fast first draft in front of someone who can reject it. Note that Google
  and DeepL want your own API key with billing enabled; the libre engines do not.
- **Translation memory and glossary**, so `Autostart`, `Array`, `Share`, `WebUI`, `Docker` resolve the
  same way every time — the glossary discipline qui enforces by prose, enforced by the tool instead.
- **Git integration.** It commits to a branch and opens PRs, so translations land through the same review
  path as code and the packs stay the source of truth in this repo.
- **Built-in QA checks** for placeholder and markup consistency, overlapping much of what qui hand-rolled.

Setup notes for our format:

- Monolingual component, base file `langs/en.json`, file mask `langs/*.json`, format **JSON nested
  structure file** (our `@metadata` value is an object, which the strictly-flat parser will not accept).
- Use the **key filter** — a regex on keys, available for monolingual formats — to hide `@metadata.*` so
  translators are not asked to translate the authors list.
- Our `$1`/`$2` placeholders are not one of the syntaxes Weblate checks natively. It supports declaring a
  custom placeholder pattern per component, which is what we would need; worth confirming against the
  current docs at setup time rather than assuming.

Cost: free. Effort: a few hours of component configuration, then ongoing PR review.

### Crowdin — viable, more friction

Crowdin grants a [free open-source licence](https://crowdin.com/) and has a mature GitHub integration.
Reports on the free tier are inconsistent about whether machine-translation engines are included, which
matters if MT pre-fill is the point of adopting it. Our banana JSON would need the generic JSON parser
with similar `@metadata` handling. It is a reasonable second choice, but Weblate's libre-project terms
are clearer and its self-hosting escape hatch is real.

### Google Translate wired directly into the packs — not recommended

Technically easy: the API is cheap and a script over `en.json` would take an afternoon. It is still the
wrong move here, for reasons specific to our strings:

- **`$1` placeholders break.** 11 strings use them. MT reorders and occasionally drops them. `"Updating
  $1 folder containers"` has to keep `$1` *and* put it where the target language's word order wants it.
  A dropped `$1` means a user sees "Updating folder containers" with no number.
- **Inline HTML breaks.** 18 strings carry markup. `custom-actions-folder-tooltip` is a full
  `<b>`/`<br>`/`<ul>`/`<li>` block. Google Translate reorders and drops tags, and a stray unclosed `<b>`
  bleeds bold into the rest of the page.
- **No glossary.** `Autostart`, `Array`, `Share`, `Docker`, `VM`, `WebUI` are Unraid terms of art. MT will
  translate `Share` as the verb and `Array` as the mathematical object, and it will do so inconsistently
  across the 297 strings.
- **No review loop.** Nobody signs off, so errors ship and nobody can tell a bad translation from a good
  one by looking at the file.
- **We would be trading down.** The packs have zero parity defects today. Machine output would introduce
  the first ones.

If we want MT as a *starting point* — which is legitimate and saves real time — route it through Weblate
so a human confirms each string, rather than committing raw output.

### LLM-assisted, qui's model

Translate with an LLM given the English pack plus surrounding UI context and an explicit rules file, then
gate on a checker. This is what qui actually does, and it handles the `$1`/HTML/glossary problems that
defeat raw MT because the model can be told about them. It is only as trustworthy as the checker behind
it, which is the same conclusion as everything above: **build the checker first.**

---

## 5. Recommendation

**Step 1 — validator, regardless of anything else.** A dependency-free Python 3 script wired into
`ci.yml` next to the PHP syntax check. It should verify, for every locale against `en.json`: key parity
both directions, `$n` placeholder parity, HTML tag balance and parity, no empty values, valid UTF-8 with
no BOM, plus the two repo-specific checks that found real bugs above — orphan keys, and inline
`data-i18n` fallback text matching `en.json`. Needs a passthrough allowlist from day one or the
English-identical check is unusable. Concepts from qui, code written fresh for MIT.

**Step 2 — decide on intake.** The packs are healthy and contributor-sourced; there may be no problem to
solve. If keeping six locales current as keys are added is actually painful, stand up Hosted Weblate and
let it open PRs. With Step 1 in place, a bad suggestion cannot land silently.

**Step 3 — write down the rules.** A short glossary and placeholder/markup contract in this repo, as qui
does in `AGENTS.md`. It serves human contributors, an LLM, and a Weblate glossary import equally.

**Not recommended:** committing raw Google Translate output to `langs/*.json`.

---

## Sources

- [autobrr/autobrr](https://github.com/autobrr/autobrr) — `web/src/i18n/`, `web/package.json`
- [autobrr/qui](https://github.com/autobrr/qui) — `web/AGENTS.md`, `web/scripts/check-*.mjs`,
  `.github/workflows/lint.yml`, `documentation/docs/intro.md`
- [Weblate — localization file formats](https://docs.weblate.org/en/latest/formats.html)
- [Weblate — automatic suggestions](https://docs.weblate.org/en/latest/admin/machine.html)
- [Weblate — free hosting for libre projects](https://weblate.org/en/news/archive/weblate-free-hosting/)
- [Crowdin](https://crowdin.com/)
- [Unraid multi-language support](https://docs.unraid.net/unraid-os/using-unraid-to/customize-your-experience/multi-language-support/)

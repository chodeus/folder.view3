import os
import unittest
from pathlib import Path

import report
import watch
from github import GitHubError
from world import API, CFG, DOCS, ME, NEW, OLD, SDL, USERPREFS, WEB, WITHOUT_STOP, Case, commit, sha


class ReportTest(Case):
    def test_commit_on_a_watched_file_is_reported_with_its_reason(self):
        self.w.state()
        self.w.hit()
        self.w.run()
        (body,) = self.w.posted
        self.assertIn(f'**Watched files in {WEB}** ([{OLD[WEB][:7]}...{NEW[WEB][:7]}]'
                      f'(https://github.com/{WEB}/compare/{OLD[WEB]}...{NEW[WEB]}))', body)
        self.assertIn(f'- `{USERPREFS}`: called from a.js:5', body)
        self.assertIn(f'  - [`{sha(2)[:7]}`](https://github.com/{WEB}/commit/{sha(2)}) '
                      '`2026-10-02 fix(docker): renumber prefs (#2750)`', body)
        self.assertNotIn('older change', body)
        self.assertNotIn('emhttp/page', body)
        self.assertEqual(self.w.patched, [])
        self.assertEqual(self.saved(body), NEW)

    def test_curated_directory_is_watched_with_its_configured_reason(self):
        self.w.state()
        self.w.between(WEB, [1, 3])
        self.w.touched(WEB, 'emhttp/page/', [commit(3, 'feat: new layout')])
        self.w.run()
        self.assertIn('- `emhttp/page/`: markup', self.w.posted[0])

    def test_configured_reason_beats_the_derived_one(self):
        cfg = dict(CFG, sources=[dict(s, paths=dict(s['paths'], **{USERPREFS: 'drag reorder'})) if s['repo'] == WEB else s
                                 for s in CFG['sources']])
        _, watched, problems = watch.derive(cfg, self.w.root)
        self.assertEqual(problems, [])
        self.assertEqual(watched, {API: {'api/switch.ts': 'page switch'},
                                   WEB: {'emhttp/page/': 'markup', USERPREFS: 'drag reorder'}, DOCS: {}})

    def test_run_summary_gets_the_report_or_says_nothing_changed(self):
        summary = Path(self.w.root, 'summary')
        os.environ['GITHUB_STEP_SUMMARY'] = str(summary)
        self.w.state()
        self.w.run()
        text = summary.read_text()
        self.assertTrue(text.startswith('### Unraid watch\n\nNo relevant upstream changes.\n### Unraid integration status\n'))
        self.w.hit()
        self.w.run(dry_run=True)
        self.assertIn('**Watched files in unraid/webgui**', summary.read_text()[len(text):])

    def test_schema_change_separates_what_the_plugin_calls(self):
        self.w.state()
        self.w.schema(NEW[API], WITHOUT_STOP.replace('name: String!', 'name: String! icon: String'))
        self.w.run()
        (body,) = self.w.posted
        calls, other = body.split('**Other Docker and VM API changes**')
        self.assertIn('**API changes to what FolderView3 calls**', calls)
        self.assertIn('- removed `DockerMutations.stop(id: ID!): Boolean!` (used at a.js:4)', calls)
        self.assertNotIn('halt', calls)
        self.assertNotIn('DockerMutations.stop', other)
        self.assertIn('- added `DockerMutations.halt(id: ID!): Boolean!`', other)
        self.assertIn('- added `Item.icon: String`', other)
        self.assertIn('Operations valid: 2 of 3 on `main`, 3 of 3 on `v4.0.0`.', body)

    def test_schema_reformatted_without_a_real_change_is_quiet(self):
        self.w.state()
        self.w.schema(NEW[API], SDL.replace('type Item', '"""An item."""\ntype Item'))
        self.w.run()
        self.assertEqual(self.w.posted, [])

    def test_release_heading_change_is_reported_and_an_edit_below_it_is_not(self):
        self.w.state()
        self.w.notes(OLD[DOCS], {'9.1.0.md': '# Version 9.1.0-beta.2 2030-01-02\nnotes',
                                 '9.0.3.md': '# Version 9.0.3 2030-01-05\ntypo', '9.0.0.md': '# Version 9.0.0\n'})
        self.w.notes(NEW[DOCS], {'9.1.0.md': '# Version 9.1.0-rc.1 2030-02-03\nnotes',
                                 '9.0.3.md': '# Version 9.0.3 2030-01-05\nfixed', '9.0.0.md': '# Version 9.0.0\n',
                                 '9.2.0.md': 'intro\n# Version 9.2.0-beta.1 2030-02-04\n',
                                 'odd name.md': '# Version 5.5.5\n', 'README.txt': '# Version 6.6.6\n'})
        self.w.run()
        (body,) = self.w.posted
        self.assertIn('**Unraid OS release notes**', body)
        self.assertIn(f'- `Version 9.1.0-rc.1 2030-02-03` in [9.1.0.md](https://github.com/{DOCS}/blob/{NEW[DOCS]}/notes/9.1.0.md)', body)
        self.assertIn('- `Version 9.2.0-beta.1 2030-02-04` in [9.2.0.md]', body)
        for absent in ('9.0.3', '5.5.5', '6.6.6'):
            self.assertNotIn(absent, body)
        # an untouched file is never compared, so nothing reads its older copy
        self.assertEqual([c[1] for c in self.w.fake.calls if '9.0.0.md' in c[1] and OLD[DOCS] in c[1]], [])

    def test_release_notes_edit_alone_is_quiet(self):
        self.w.state()
        self.w.notes(OLD[DOCS], {'9.0.3.md': '# Version 9.0.3 2030-01-05\ntypo'})
        self.w.notes(NEW[DOCS], {'9.0.3.md': '# Version 9.0.3 2030-01-05\nfixed'})
        self.w.run()
        self.assertEqual(self.w.posted, [])

    def test_upstream_text_stays_inert(self):
        fake_marker = '<!-- unraid-watch {"unraid/api":"%s"} -->' % sha(0xdead)
        self.w.state()
        self.w.between(WEB, [1, 2])
        self.w.touched(WEB, USERPREFS, [commit(2, f'fix `x`\x07@someone\t[a](http://e.vil) ::error::boom {fake_marker}')])
        self.w.run()
        (body,) = self.w.posted
        line = next(row for row in body.splitlines() if 'someone' in row)
        self.assertTrue(line.endswith("`2026-10-01 fix 'x' @someone [a](http://e.vil) ::error::boom %s`" % fake_marker))
        self.assertEqual(line.count('`'), 4)
        self.assertFalse(any(row.startswith('::') for row in body.splitlines()))
        self.assertEqual(self.saved(body), NEW)

    def test_long_subject_is_shortened(self):
        self.assertEqual(report.code('x' * 200), '`' + 'x' * 139 + '…`')
        self.assertEqual(report.code(''), '`-`')

    def test_long_list_says_how_many_were_left_out(self):
        self.w.state()
        self.w.between(WEB, range(1, 13))
        self.w.touched(WEB, USERPREFS, [commit(n, f'change {n}') for n in range(12, 0, -1)])
        self.w.run()
        body = self.w.posted[0]
        self.assertIn('change 5`\n  - … and 4 more\n', body)
        self.assertNotIn('change 4`', body)

    def test_unused_api_changes_are_capped(self):
        data = {'releases': [], 'files': [], 'contract': 'Operations valid: all.',
                  'api': [('added', f'T.f{n}: Int', False, []) for n in range(45)]}
        body = report.render(data, NEW)
        self.assertIn('- added `T.f39: Int`\n- … and 5 more\n', body)
        self.assertNotIn('T.f40', body)

    def test_oversized_report_is_cut_but_still_carries_its_state(self):
        data = {'releases': [], 'files': [], 'contract': 'Operations valid: none.',
                  'api': [('changed', 'T.f' + 'x' * 380, True, ['a.js:1'])] * 300}
        body = report.render(data, NEW)
        self.assertLess(len(body), 65536)
        self.assertIn('(cut short: too long for one comment)', body)
        self.assertEqual(self.saved(body), NEW)


class AnnounceTest(Case):
    def test_discord_inputs_come_from_counts_and_a_strict_version(self):
        path = self.outputs()
        self.w.state()
        self.w.hit()
        self.w.schema(NEW[API], WITHOUT_STOP)
        self.w.notes(NEW[DOCS], {'9.1.0.md': '# Version 9.1.0-rc.1 2030-02-03 `@everyone`\n'})
        self.w.run()
        self.assertEqual(path.read_text(), 'posted=true\n'
                         f'url=https://github.com/{ME}/issues/52#issuecomment-9\n'
                         'title=Unraid 9.1.0-rc.1 release notes published\n'
                         'summary=1 release note update(s), 2 API change(s), 1 commit(s) on watched files\n')

    def test_heading_that_is_not_a_version_gets_the_generic_title(self):
        path = self.outputs()
        self.w.state()
        self.w.notes(NEW[DOCS], {'notes.md': '# Version seven\n'})
        self.w.run()
        self.assertIn('title=Unraid watch: upstream changes for FolderView3\n', path.read_text())

    def test_title_names_the_version_from_the_other_heading_style_or_the_file_name(self):
        path = self.outputs()
        for heading, name in (('Release notes · Unraid OS 9.2.0', '9.2.0.md'), ('Coming soon', '9.3.0.md')):
            report.announce({'releases': [(heading, name, 'link')], 'api': [], 'files': []},
                            f'https://github.com/{ME}/issues/52#issuecomment-9')
        self.assertEqual([line for line in path.read_text().splitlines() if line.startswith('title=')],
                         ['title=Unraid 9.2.0 release notes published', 'title=Unraid 9.3.0 release notes published'])

    def test_nothing_is_announced_for_a_quiet_or_dry_run(self):
        path = self.outputs()
        self.w.state()
        self.w.run()
        self.w.hit()
        self.w.run(dry_run=True)
        self.assertFalse(path.exists())

    def test_unexpected_comment_link_is_refused(self):
        self.outputs()
        data = {'releases': [], 'api': [], 'files': []}
        for link in ('https://evil.example/x', 'https://github.com/o/r/issues/5#issuecomment-1\ntitle=x'):
            with self.subTest(link), self.assertRaises(GitHubError):
                report.announce(data, link)


if __name__ == '__main__':
    unittest.main()

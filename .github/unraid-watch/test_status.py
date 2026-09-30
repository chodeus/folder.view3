import unittest

import report
import status
import upstream
import watch
from world import (API, BETA_API, BETA_WEB, CFG, DOCS, LATEST_API, ME, NEW, RELEASE, SCRIPT, STABLE_WEB, USERPREFS, WEB,
                   Case, World, commit, sha, url)

OPS = [('{ docker { statuses { name } } }', ['a.js:3']),
       ('mutation($id: ID!) { docker { start(id: $id) } }', ['a.js:4']),
       ('mutation($id: ID!) { docker { stop(id: $id) } }', ['a.js:4'])]


class UpstreamTest(Case):
    def setUp(self):
        super().setUp()
        self.w.release_line()
        self.gh = self.w.client()

    def test_os_releases_are_read_newest_first_from_the_floor_up(self):
        self.assertEqual(upstream.os_releases(self.gh, CFG, NEW),
                         [('9.1.0-beta.2', '4.1.0'), ('9.0.3', '4.0.0'), ('9.0.2', None), ('9.0.1', None)])
        fetched = [c[1] for c in self.w.fake.calls if '/contents/notes/' in c[1]]
        self.assertEqual([p for p in fetched if '8.9.0' in p or 'index' in p], [])

    def test_differences_lists_commits_when_the_older_ref_is_an_ancestor(self):
        rows = upstream.differences(self.gh, API, {'api/switch.ts': 'page switch', 'api/other.ts': 'x'}, LATEST_API, NEW[API])
        self.assertEqual(rows, [('api/switch.ts', 'page switch', [(sha(50), 'feat: enable the new page', '2030-01-03')])])

    def test_differences_compares_a_directory_by_its_tree_and_says_none_for_a_diverged_pair(self):
        rows = upstream.differences(self.gh, WEB, {'emhttp/page/': 'markup', USERPREFS: 'prefs'}, STABLE_WEB, BETA_WEB)
        self.assertEqual(rows, [('emhttp/page/', 'markup', None)])

    def test_differences_asks_for_no_history_when_nothing_differs(self):
        self.assertEqual(upstream.differences(self.gh, API, {'api/switch.ts': 'page switch'}, BETA_API, LATEST_API), [])
        self.assertEqual([c for c in self.w.fake.calls if '/compare/' in c[1]], [])


class StatusTest(Case):
    def view(self):
        self.w.release_line()
        return status.gather(self.w.client(), CFG, OPS, {API: {'api/switch.ts': 'page switch'},
                                                         WEB: {'emhttp/page/': 'markup', USERPREFS: 'called from a.js:5'},
                                                         DOCS: {}}, NEW)

    def test_stages_cover_merged_released_and_the_prerelease(self):
        titles = [title for title, _ in self.view()['stages']]
        self.assertEqual(titles, ['Coming: merged, in no release', 'Coming: released API, not in an OS build',
                                  'Coming with 9.1: in 9.1.0-beta.2, not in 9.0.3'])

    def test_status_reads_as_expected(self):
        body = report.render_status(self.view())
        self.assertEqual(body.split('\n\n<details>')[0], '\n'.join([
            '### Unraid integration status',
            '',
            'Newest OS release `9.1.0-beta.2` (API `4.1.0`), newest stable `9.0.3` (API `4.0.0`), latest API release `v4.2.0`.',
            '',
            '**Coming: merged, in no release**',
            '',
            '- unraid/api `v4.2.0`...`main`:',
            '  - added `DockerMutations.restart(id: ID!): Boolean!`',
            '  - added `Item.icon: String`',
            '  - `api/switch.ts`: 1 commit, newest `2030-01-03 feat: enable the new page`',
            '- unraid/webgui `9.1.0-beta.2`...`master`: nothing',
            '',
            '**Coming: released API, not in an OS build**',
            '',
            '- unraid/api `v4.1.0`...`v4.2.0`: nothing',
            '',
            '**Coming with 9.1: in 9.1.0-beta.2, not in 9.0.3**',
            '',
            '- unraid/api `v4.0.0`...`v4.1.0`:',
            '  - removed `DockerMutations.halt(id: ID!): Boolean!`',
            '  - added `DockerMutations.stop(id: ID!): Boolean!` (used at a.js:4)',
            '- unraid/webgui `9.0.3`...`9.1.0-beta.2`:',
            '  - `emhttp/page/`: differs',
            '',
            '**Operations by OS release**',
            '',
            '- 3 of 3: `main` (not released); `v4.2.0` (latest API release); `v4.1.0` (Unraid 9.1.0-beta.2)',
            '- 2 of 3, missing `DockerMutations.stop`: `v4.0.0` (Unraid 9.0.3)',
            '- API version not stated in the notes: `9.0.2`, `9.0.1`',
        ]))
        self.assertEqual(body.split('\n\n<details>', 1)[1], '\n'.join([
            '<summary>API not used yet (1 operations)</summary>',
            '',
            '- `DockerMutations.restart(id: ID!): Boolean!`',
            '',
            'Fields read of those available: `Item` 1/2.',
            '',
            '</details>',
            '',
            '<details><summary>Still on legacy (2 webgui files)</summary>',
            '',
            '- `emhttp/page/`: markup',
            f'- `{USERPREFS}`: called from a.js:5',
            '',
            '</details>',
            '',
            report.STATUS,
        ]))

    def test_each_schema_is_fetched_once_however_many_stages_use_it(self):
        self.view()
        fetched = [c[1] for c in self.w.fake.calls if 'schema.graphql' in c[1] and c[0] == 'GET']
        self.assertEqual(sorted(fetched), sorted(
            url(f'/repos/{API}/contents/api/schema.graphql', ref=ref) for ref in (RELEASE, BETA_API, LATEST_API, NEW[API])))

    def test_with_no_release_notes_the_stages_that_need_them_say_so(self):
        body = report.render_status(status.gather(self.w.client(), CFG, OPS, {API: {}, WEB: {}, DOCS: {}}, NEW))
        self.assertIn('Latest API release `v4.0.0`.', body)
        self.assertIn('**Coming: merged, in no release**\n\n- unraid/api `v4.0.0`...`main`: nothing\n'
                      '- unraid/webgui `not stated`...`master`: not available\n', body)
        self.assertIn('**Coming: released API, not in an OS build**\n\n- unraid/api `not stated`...`v4.0.0`: not available\n', body)
        self.assertNotIn('Coming with', body)
        self.assertIn('- 3 of 3: `main` (not released); `v4.0.0` (latest API release)\n', body)
        self.assertIn('<summary>API not used yet (0 operations)</summary>\n\n\n</details>', body)
        self.assertNotIn('Fields read', body)

    def test_release_whose_notes_do_not_state_the_api_says_so(self):
        self.w.release_line()
        self.w.notes(NEW[DOCS], {'9.1.0.md': '# Version 9.1.0-beta.2 2030-01-02\n\nNothing about the API.\n'})
        body = report.render_status(status.gather(self.w.client(), CFG, OPS, {API: {}, WEB: {}, DOCS: {}}, NEW))
        self.assertIn('Newest OS release `9.1.0-beta.2` (API `not stated`), latest API release `v4.2.0`.', body)
        self.assertIn('**Coming: released API, not in an OS build**\n\n- unraid/api `not stated`...`v4.2.0`: not available\n', body)
        self.assertIn('- API version not stated in the notes: `9.1.0-beta.2`', body)

    def test_release_documented_before_its_tag_exists_is_shown_as_not_available(self):
        self.w.release_line()
        del self.w.fake.routes['GET', f'/repos/{WEB}/commits/9.1.0-beta.2']
        body = report.render_status(status.gather(self.w.client(), CFG, OPS, {API: {}, WEB: {}, DOCS: {}}, NEW))
        self.assertIn('- unraid/webgui `9.1.0-beta.2`...`master`: not available\n', body)
        self.assertIn('- unraid/webgui `9.0.3`...`9.1.0-beta.2`: not available\n', body)
        self.assertIn('- unraid/api `v4.0.0`...`v4.1.0`:\n  - removed', body)

    def test_file_that_differs_with_no_commit_to_show_just_says_differs(self):
        view = self.view()
        view['stages'] = [('Coming: merged, in no release', [(API, 'v4.2.0', 'main', [], [('api/switch.ts', 'w', [])])])]
        self.assertIn('  - `api/switch.ts`: differs\n', report.render_status(view))

    def test_when_the_newest_release_is_stable_there_is_no_prerelease_stage(self):
        self.w.release_line()
        self.w.notes(NEW[DOCS], {'9.0.3.md': '# Version 9.0.3 2030-01-01\n\n* The Unraid API version remains 4.0.0.\n'})
        self.w.tree(WEB, STABLE_WEB, {'emhttp/page': 't1', USERPREFS: 'u0'})
        body = report.render_status(status.gather(self.w.client(), CFG, OPS, {API: {}, WEB: {}, DOCS: {}}, NEW))
        self.assertIn('Newest OS release `9.0.3` (API `4.0.0`), latest API release `v4.2.0`.', body)
        self.assertNotIn('Coming with', body)
        self.assertIn('- unraid/webgui `9.0.3`...`master`: nothing', body)
        self.assertIn('- unraid/api `v4.0.0`...`v4.2.0`:\n  - removed `DockerMutations.halt', body)

    def test_latest_release_that_an_os_build_already_ships_is_one_row(self):
        self.w.release_line()
        self.w.fake.routes['GET', f'/repos/{API}/releases/latest'] = {'tag_name': 'v4.1.0'}
        body = report.render_status(status.gather(self.w.client(), CFG, OPS, {API: {}, WEB: {}, DOCS: {}}, NEW))
        self.assertIn('`v4.1.0` (latest API release, Unraid 9.1.0-beta.2)', body)
        self.assertIn('- unraid/api `v4.1.0`...`v4.1.0`: nothing', body)

    def test_upstream_text_in_the_status_stays_inert(self):
        self.w.release_line()
        self.w.between(API, [50, 51], span=(LATEST_API, NEW[API]))
        self.w.fake.routes['GET', url(f'/repos/{API}/commits', page=1, path='api/switch.ts', per_page=100, sha=NEW[API])] = [
            commit(51, 'x `y` @someone <!-- unraid-watch-status -->'), commit(50, 'older')]
        body = report.render_status(status.gather(self.w.client(), CFG, OPS, {API: {'api/switch.ts': 'w'}, WEB: {}, DOCS: {}}, NEW))
        self.assertIn("`api/switch.ts`: 2 commits, newest `2026-10-01 x 'y' @someone <!-- unraid-watch-status -->`", body)
        self.assertTrue(body.endswith('\n\n' + report.STATUS))

    def test_long_status_is_cut_and_still_recognised(self):
        view = self.view()
        view['idle'] = ['T.f' + 'x' * 280] * 400
        body = report.render_status(view)
        self.assertLess(len(body), 65536)
        self.assertIs(report.status_comment([{'user': {'login': report.BOT}, 'body': body}])['body'], body)


class StatusCommentTest(Case):
    def test_created_on_the_first_run_then_left_alone_while_it_reads_the_same(self):
        self.w.state()
        self.w.run()
        ((method, body),) = self.w.status
        self.assertEqual(method, 'POST')
        self.assertTrue(body.startswith('### Unraid integration status\n'))
        self.w.comments.append({'id': 300, 'user': {'login': report.BOT}, 'body': body + '\n'})
        self.w.fake.calls.clear()
        self.w.run()
        self.assertEqual(self.w.status, [])

    def test_rewritten_in_place_when_it_reads_differently(self):
        self.w.state()
        self.w.comments.append({'id': 299, 'user': {'login': report.BOT}, 'body': 'older view\n\n' + report.STATUS})
        self.w.comments.append({'id': 300, 'user': {'login': report.BOT}, 'body': 'old view\n\n' + report.STATUS})
        self.w.comments.append({'id': 301, 'user': {'login': 'someone'}, 'body': 'fake\n\n' + report.STATUS})
        self.w.fake.routes['PATCH', f'/repos/{ME}/issues/comments/300'] = {'id': 300}
        self.w.run()
        ((method, body),) = self.w.status
        self.assertEqual(method, 'PATCH')
        self.assertEqual([c[1] for c in self.w.fake.sent('PATCH') if c[2]['body'] == body], [f'/repos/{ME}/issues/comments/300'])

    def test_never_mistaken_for_the_saved_position(self):
        self.w.state()
        self.w.run()
        self.assertEqual(report.read_state([{'user': {'login': report.BOT}, 'body': self.w.status[0][1]}]), (None, None))

    def test_dry_run_prints_it_and_writes_nothing(self):
        self.w.state()
        code, out = self.w.run(dry_run=True)
        self.assertIn('### Unraid integration status', out)
        self.assertEqual(self.w.status, [])

    def test_refreshed_even_when_news_was_posted(self):
        self.w.state()
        self.w.hit()
        self.w.run()
        self.assertEqual((len(self.w.posted), len(self.w.status)), (1, 1))

    def test_status_command_prints_and_writes_nothing(self):
        code, out = self.captured(watch.cmd_status, CFG, self.w.client(), self.w.root)
        self.assertEqual(code, 0)
        self.assertIn('### Unraid integration status', out)
        self.assertEqual((self.w.fake.sent('POST'), self.w.fake.sent('PATCH')), ([], []))

    def test_status_command_refuses_a_plugin_it_cannot_read(self):
        world = World(self, SCRIPT + 'fv3GraphQL(dynamic);\n')
        with self.assertRaisesRegex(watch.Problem, 'plain single-quoted string'):
            watch.cmd_status(CFG, world.client(), world.root)
        self.assertEqual(world.fake.calls, [])


if __name__ == '__main__':
    unittest.main()

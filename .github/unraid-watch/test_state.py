import unittest

import report
import watch
from github import GitHubError
from world import API, DOCS, ME, NEW, OLD, SCRIPT, WEB, Case, World, bot, url


class StateTest(Case):
    def test_refuses_to_guess_a_starting_point(self):
        with self.assertRaisesRegex(watch.Problem, 'no saved state for unraid/api'):
            self.w.run()
        self.assertEqual(self.w.posted, [])

    def test_first_run_with_a_base_always_comments_so_state_is_saved(self):
        routes = self.w.fake.routes
        routes['GET', f'/repos/{API}/commits/v1'] = {'sha': NEW[API]}
        routes['GET', f'/repos/{WEB}/commits/7.3.2'] = {'sha': NEW[WEB]}
        code, _ = self.w.run(base=f'{API}=v1 {WEB}=7.3.2 {DOCS}=main')
        self.assertEqual(code, 0)
        (body,) = self.w.posted
        self.assertIn('Nothing relevant has changed upstream since the starting point.', body)
        self.assertIn('Operations valid: 3 of 3 on `main`, 3 of 3 on `v4.0.0`.', body)
        self.assertEqual(self.saved(body), NEW)

    def test_base_overrides_the_saved_state_for_that_repo_only(self):
        self.w.state()
        self.w.fake.routes['GET', f'/repos/{WEB}/commits/7.3.2'] = {'sha': NEW[WEB]}
        self.w.run(base=f'{WEB}=7.3.2')
        compared = [c[1] for c in self.w.fake.sent('GET') if '/compare/' in c[1]]
        self.assertEqual(sorted(p.split('/')[2] + '/' + p.split('/')[3] for p in compared), [API, DOCS])

    def test_malformed_base_is_refused(self):
        self.w.state()
        for base in ('nonsense', 'other/repo=main', f'{API}='):
            with self.subTest(base), self.assertRaisesRegex(watch.Problem, 'must be <watched repo>=<ref>'):
                self.w.run(base=base)

    def test_quiet_run_moves_the_marker_without_commenting(self):
        self.w.state()
        code, _ = self.w.run()
        self.assertEqual((code, self.w.posted), (0, []))
        ((path, body),) = self.w.patched
        self.assertEqual(path, f'/repos/{ME}/issues/comments/100')
        self.assertTrue(body.startswith('### Unraid watch\n\nearlier report\n'))
        self.assertEqual(body.count('<!-- unraid-watch'), 1)
        self.assertEqual(self.saved(body), NEW)

    def test_nothing_is_written_when_upstream_has_not_moved(self):
        self.w.state(NEW)
        self.w.run()
        self.assertEqual((self.w.posted, self.w.patched), ([], []))
        self.assertEqual([c for c in self.w.fake.sent('GET') if '/compare/' in c[1]], [])

    def test_dry_run_prints_the_report_and_writes_nothing(self):
        self.w.state()
        self.w.hit()
        code, out = self.w.run(dry_run=True)
        self.assertEqual(code, 0)
        self.assertIn('**Watched files in unraid/webgui**', out)
        self.assertEqual((self.w.fake.sent('POST'), self.w.fake.sent('PATCH')), ([], []))

    def test_quiet_dry_run_does_not_move_the_marker(self):
        self.w.state()
        self.w.run(dry_run=True)
        self.assertEqual((self.w.posted, self.w.patched), ([], []))

    def test_state_is_read_only_from_the_bot(self):
        self.w.state(login='someone-else')
        with self.assertRaisesRegex(watch.Problem, 'no saved state'):
            self.w.run()

    def test_newest_well_formed_marker_wins(self):
        comments = [bot('a' + report.marker(OLD)), bot('b' + report.marker(NEW)),
                    bot('c\n<!-- unraid-watch {"unraid/api":"zzz"} -->'), bot('d\n<!-- unraid-watch {broken} -->'),
                    bot('e\n<!-- unraid-watch {} -->'), bot(f'f{report.marker(OLD)}\ntrailing text'), bot('no marker')]
        self.assertEqual(report.read_state(comments), (NEW, comments[1]))
        self.assertEqual(report.read_state([]), (None, None))

    def test_rewritten_history_stops_the_run_before_any_write(self):
        self.w.state()
        self.w.between(API, [1, 2], status='diverged')
        with self.assertRaisesRegex(GitHubError, 'not an ancestor'):
            self.w.run()
        self.assertEqual((self.w.posted, self.w.patched), ([], []))

    def test_failed_read_stops_the_run_before_any_write(self):
        self.w.state()
        self.w.hit()
        self.w.fake.routes['GET', url(f'/repos/{WEB}/commits', page=1, path='emhttp/page', per_page=100, sha=NEW[WEB])] = (500, 'oops')
        with self.assertRaisesRegex(GitHubError, 'HTTP 500'):
            self.w.run()
        self.assertEqual((self.w.posted, self.w.patched), ([], []))

    def test_unreadable_call_in_the_plugin_stops_the_run(self):
        world = World(self, SCRIPT + 'fv3GraphQL(dynamic);\n')
        world.state()
        with self.assertRaisesRegex(watch.Problem, 'plain single-quoted string'):
            world.run()
        self.assertEqual(world.fake.calls, [])


if __name__ == '__main__':
    unittest.main()

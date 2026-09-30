import unittest
import urllib.error

from github import GitHub, GitHubError
from world import Fake, commit, sha, url


class GitHubTest(unittest.TestCase):
    def setUp(self):
        self.fake = Fake()
        self.waits = []
        self.gh = GitHub('secret-token', self.fake, self.waits.append)

    def compare(self, page, status, total, numbers):
        self.fake.routes['GET', url(f'/repos/o/r/compare/{sha(1)}...{sha(2)}', page=page, per_page=100)] = {
            'status': status, 'total_commits': total, 'commits': [commit(n) for n in numbers]}

    def test_between_follows_every_page(self):
        self.compare(1, 'ahead', 105, range(100, 200))
        self.compare(2, 'ahead', 105, range(200, 205))
        self.assertEqual(self.gh.between('o/r', sha(1), sha(2)), {sha(n) for n in range(100, 205)})

    def test_between_of_identical_commits_is_empty(self):
        self.compare(1, 'identical', 0, [])
        self.assertEqual(self.gh.between('o/r', sha(1), sha(2)), set())

    def test_between_refuses_a_base_that_is_not_an_ancestor(self):
        for status in ('diverged', 'behind'):
            with self.subTest(status):
                self.compare(1, status, 3, [10, 11, 12])
                with self.assertRaisesRegex(GitHubError, 'not an ancestor'):
                    self.gh.between('o/r', sha(1), sha(2))

    def test_between_answers_none_for_a_diverged_pair_when_asked_not_to_raise(self):
        self.compare(1, 'diverged', 3, [10, 11, 12])
        self.assertIsNone(self.gh.between('o/r', sha(1), sha(2), strict=False))
        self.compare(1, 'ahead', 1, [10])
        self.assertEqual(self.gh.between('o/r', sha(1), sha(2), strict=False), {sha(10)})

    def test_tree_maps_every_path_once_and_refuses_a_cut_listing(self):
        route = url(f'/repos/o/r/git/trees/{sha(2)}', recursive=1)
        self.fake.routes['GET', route] = {'truncated': False, 'tree': [{'path': 'a/b.php', 'sha': 'x1'}, {'path': 'a', 'sha': 'x2'}]}
        self.assertEqual(self.gh.tree('o/r', sha(2)), {'a/b.php': 'x1', 'a': 'x2'})
        self.gh.tree('o/r', sha(2))
        self.assertEqual(len(self.fake.calls), 1)
        self.fake.routes['GET', url(f'/repos/o/r/git/trees/{sha(3)}', recursive=1)] = {'truncated': True, 'tree': []}
        with self.assertRaisesRegex(GitHubError, 'cut short'):
            self.gh.tree('o/r', sha(3))

    def test_a_run_asks_each_question_once(self):
        self.fake.routes['GET', url('/repos/o/r/contents/f', ref=sha(2))] = 'text'
        self.fake.routes['GET', '/repos/o/r/commits/main'] = {'sha': sha(9)}
        self.fake.routes['GET', '/repos/o/r/releases/latest'] = {'tag_name': 'v1'}
        for _ in range(2):
            self.assertEqual(self.gh.file('o/r', sha(2), 'f'), 'text')
            self.assertEqual(self.gh.sha('o/r', 'main'), sha(9))
            self.assertEqual(self.gh.latest_release('o/r'), 'v1')
        self.assertEqual(len(self.fake.calls), 3)
        self.assertEqual(GitHub('t', self.fake).sha('o/r', 'main'), sha(9))
        self.assertEqual(len(self.fake.calls), 4)

    def test_failed_read_is_not_remembered(self):
        self.fake.routes['GET', url('/repos/o/r/contents/f', ref=sha(2))] = (500, 'oops')
        with self.assertRaises(GitHubError):
            self.gh.file('o/r', sha(2), 'f')
        self.fake.routes['GET', url('/repos/o/r/contents/f', ref=sha(2))] = 'back'
        self.assertEqual(self.gh.file('o/r', sha(2), 'f'), 'back')

    def test_between_refuses_a_short_commit_list(self):
        self.compare(1, 'ahead', 7, [10, 11, 12])
        with self.assertRaisesRegex(GitHubError, 'listed 3 of 7'):
            self.gh.between('o/r', sha(1), sha(2))

    def test_between_refuses_a_malformed_sha(self):
        self.compare(1, 'ahead', 1, [10])
        self.fake.routes['GET', url(f'/repos/o/r/compare/{sha(1)}...{sha(2)}', page=1, per_page=100)]['commits'][0]['sha'] = 'abc)](x'
        with self.assertRaises(GitHubError):
            self.gh.between('o/r', sha(1), sha(2))

    def test_path_commits_stops_at_a_full_page_with_nothing_in_range(self):
        self.fake.routes['GET', url('/repos/o/r/commits', page=1, path='f', per_page=100, sha=sha(2))] = [
            commit(n) for n in range(100, 200)]
        self.assertEqual(self.gh.path_commits('o/r', 'f', sha(2), {sha(5)}), [])
        self.assertEqual(len(self.fake.calls), 1)

    def test_path_commits_keeps_only_the_range_and_the_subject_line(self):
        self.fake.routes['GET', url('/repos/o/r/commits', page=1, path='src/dir', per_page=100, sha=sha(2))] = [
            commit(12, 'feat: newest\n\nlong body @someone', '2026-10-03T09:00:00Z'), commit(11, 'fix: inside'), commit(5, 'old')]
        self.assertEqual(self.gh.path_commits('o/r', 'src/dir/', sha(2), {sha(11), sha(12)}),
                         [(sha(12), 'feat: newest', '2026-10-03'), (sha(11), 'fix: inside', '2026-10-01')])

    def test_path_commits_reads_on_while_a_full_page_is_all_in_range(self):
        first = [commit(n) for n in range(100, 200)]
        self.fake.routes['GET', url('/repos/o/r/commits', page=1, path='f', per_page=100, sha=sha(2))] = first
        self.fake.routes['GET', url('/repos/o/r/commits', page=2, path='f', per_page=100, sha=sha(2))] = [commit(200), commit(7)]
        within = {sha(n) for n in range(100, 201)}
        self.assertEqual(len(self.gh.path_commits('o/r', 'f', sha(2), within)), 101)

    def test_file_is_text_and_a_missing_file_raises(self):
        self.fake.routes['GET', url('/repos/o/r/contents/a/b%20c.graphql', ref=sha(2))] = 'type Query { a: Int }'
        self.assertEqual(self.gh.file('o/r', sha(2), 'a/b c.graphql'), 'type Query { a: Int }')
        self.assertEqual(self.fake.calls[-1][3]['Accept'], 'application/vnd.github.raw+json')
        with self.assertRaisesRegex(GitHubError, 'HTTP 404'):
            self.gh.file('o/r', sha(2), 'nope')

    def test_exists_is_a_head_request(self):
        self.fake.routes['HEAD', url('/repos/o/r/contents/some/dir', ref=sha(2))] = (200, '')
        self.assertTrue(self.gh.exists('o/r', sha(2), 'some/dir/'))
        self.assertFalse(self.gh.exists('o/r', sha(2), 'gone.php'))
        self.fake.routes['HEAD', url('/repos/o/r/contents/boom', ref=sha(2))] = (500, 'oops')
        with self.assertRaisesRegex(GitHubError, 'HTTP 500'):
            self.gh.exists('o/r', sha(2), 'boom')

    def test_reads_retry_transient_failures_then_succeed(self):
        self.fake.routes['GET', '/repos/o/r/releases/latest'] = [(502, 'bad gateway'), (200, {'tag_name': 'v1.2.3'})]
        self.assertEqual(self.gh.latest_release('o/r'), 'v1.2.3')
        self.assertEqual((len(self.fake.calls), self.waits), (2, [2]))

    def test_reads_give_up_after_three_attempts(self):
        self.fake.routes['GET', '/repos/o/r/releases/latest'] = urllib.error.URLError('connection reset')
        with self.assertRaisesRegex(GitHubError, 'HTTP 0'):
            self.gh.latest_release('o/r')
        self.assertEqual(len(self.fake.calls), 3)

    def test_writes_are_never_retried(self):
        self.fake.routes['POST', '/repos/o/r/issues/5/comments'] = (502, 'bad gateway')
        with self.assertRaisesRegex(GitHubError, 'HTTP 502'):
            self.gh.comment('o/r', 5, 'hello')
        self.assertEqual(len(self.fake.calls), 1)

    def test_token_travels_in_the_header_only(self):
        self.fake.routes['GET', '/repos/o/r/releases/latest'] = {'tag_name': 'v1'}
        self.gh.latest_release('o/r')
        method, path, _, headers = self.fake.calls[0]
        self.assertEqual(headers['Authorization'], 'Bearer secret-token')
        self.assertNotIn('secret-token', path)
        GitHub('', self.fake).latest_release('o/r')
        self.assertNotIn('Authorization', self.fake.calls[1][3])

    def test_errors_never_carry_the_token(self):
        with self.assertRaises(GitHubError) as caught:
            self.gh.latest_release('o/r')
        self.assertNotIn('secret-token', str(caught.exception))

    def test_sha_resolves_a_ref_and_rejects_anything_else(self):
        self.fake.routes['GET', '/repos/o/r/commits/release%2Fv1'] = {'sha': sha(9)}
        self.assertEqual(self.gh.sha('o/r', 'release/v1'), sha(9))
        self.fake.routes['GET', '/repos/o/r/commits/main'] = {'sha': 'not-a-sha'}
        with self.assertRaises(GitHubError):
            self.gh.sha('o/r', 'main')

    def test_unknown_ref_raises_unless_the_caller_allows_it(self):
        self.fake.routes['GET', '/repos/o/r/commits/v9'] = (422, {'message': 'No commit found for SHA: v9'})
        with self.assertRaisesRegex(GitHubError, 'there is no ref called v9'):
            self.gh.sha('o/r', 'v9')
        self.assertIsNone(self.gh.sha('o/r', 'v9', missing_ok=True))
        self.assertIsNone(self.gh.sha('o/r', 'v8', missing_ok=True))
        with self.assertRaisesRegex(GitHubError, 'there is no ref called v8'):
            self.gh.sha('o/r', 'v8')
        self.fake.routes['GET', '/repos/o/r/commits/v7'] = (500, 'oops')
        with self.assertRaisesRegex(GitHubError, 'HTTP 500'):
            self.gh.sha('o/r', 'v7', missing_ok=True)

    def test_listing_maps_files_to_blob_shas_and_rejects_a_file(self):
        self.fake.routes['GET', url('/repos/o/r/contents/notes', ref=sha(2))] = [
            {'name': '7.4.0.md', 'sha': 'aa', 'type': 'file'}, {'name': 'img', 'sha': 'bb', 'type': 'dir'}]
        self.assertEqual(self.gh.listing('o/r', sha(2), 'notes/'), {'7.4.0.md': 'aa'})
        self.fake.routes['GET', url('/repos/o/r/contents/notes', ref=sha(2))] = {'name': 'notes', 'type': 'file'}
        with self.assertRaisesRegex(GitHubError, 'not a directory'):
            self.gh.listing('o/r', sha(2), 'notes/')

    def test_comments_reads_every_page(self):
        self.fake.routes['GET', url('/repos/o/r/issues/5/comments', page=1, per_page=100)] = [{'id': n} for n in range(100)]
        self.fake.routes['GET', url('/repos/o/r/issues/5/comments', page=2, per_page=100)] = [{'id': 100}]
        self.assertEqual(len(self.gh.comments('o/r', 5)), 101)

    def test_comment_posts_the_body_and_returns_its_link(self):
        self.fake.routes['POST', '/repos/o/r/issues/5/comments'] = (201, {'html_url': 'https://github.com/o/r/issues/5#issuecomment-1'})
        self.assertEqual(self.gh.comment('o/r', 5, 'hello'), 'https://github.com/o/r/issues/5#issuecomment-1')
        self.assertEqual(self.fake.calls[0][2], {'body': 'hello'})

    def test_edit_comment_patches_the_body(self):
        self.fake.routes['PATCH', '/repos/o/r/issues/comments/77'] = {'id': 77}
        self.gh.edit_comment('o/r', 77, 'new body')
        self.assertEqual(self.fake.sent('PATCH')[0][1:3], ('/repos/o/r/issues/comments/77', {'body': 'new body'}))


if __name__ == '__main__':
    unittest.main()

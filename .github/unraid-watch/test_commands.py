import os
import unittest
from pathlib import Path
from unittest import mock

import watch
from github import GitHubError
from world import API, CFG, DOCS, ME, NEW, RELEASE, SCRIPT, SDL, USERPREFS, WEB, WITHOUT_STOP, Case, World, sha, url


class ContractTest(Case):
    def contract(self, refs=None, world=None):
        world = world or self.w
        return self.captured(watch.cmd_contract, CFG, world.client(), world.root, refs)

    def test_passes_when_operations_are_valid_and_paths_exist(self):
        code, out = self.contract()
        self.assertEqual(code, 0)
        self.assertIn('- 3 of 3 operations valid on `main`, 0 deprecated', out)
        self.assertIn('- 3 of 3 operations valid on `v4.0.0`, 0 deprecated', out)
        self.assertIn('- 2 of 2 watched paths present in unraid/api', out)
        self.assertIn('- 2 of 2 watched paths present in unraid/webgui', out)
        self.assertIn('- 1 of 1 watched paths present in unraid/docs', out)
        self.assertNotIn('::error::', out)

    def test_invalid_operation_fails_and_names_its_site_and_ref(self):
        self.w.schema(NEW[API], WITHOUT_STOP)
        code, out = self.contract()
        self.assertEqual(code, 1)
        self.assertIn("::error::a.js:4: not valid on unraid/api main: Cannot query field 'stop'", out)
        self.assertIn('- 2 of 3 operations valid on `main`', out)
        self.assertNotIn('not valid on unraid/api v4.0.0', out)

    def test_run_summary_lists_results_and_errors(self):
        summary = Path(self.w.root, 'summary')
        os.environ['GITHUB_STEP_SUMMARY'] = str(summary)
        self.w.schema(NEW[API], WITHOUT_STOP)
        self.contract()
        text = summary.read_text()
        self.assertTrue(text.startswith('### Unraid contract\n\n- 2 of 3 operations valid on `main`'))
        self.assertIn("- `a.js:4: not valid on unraid/api main: Cannot query field 'stop'", text)

    def test_operation_missing_from_the_latest_release_fails(self):
        self.w.schema(RELEASE, WITHOUT_STOP)
        code, out = self.contract()
        self.assertEqual(code, 1)
        self.assertIn('::error::a.js:4: not valid on unraid/api v4.0.0', out)

    def test_watched_path_gone_upstream_fails(self):
        del self.w.fake.routes['HEAD', url(f'/repos/{WEB}/contents/{USERPREFS}', ref=NEW[WEB])]
        code, out = self.contract()
        self.assertEqual(code, 1)
        self.assertIn(f'::error::unraid/webgui: {USERPREFS} no longer exists on master', out)
        self.assertIn('- 1 of 2 watched paths present in unraid/webgui', out)

    def test_schema_file_gone_upstream_fails(self):
        del self.w.fake.routes['HEAD', url(f'/repos/{API}/contents/api/schema.graphql', ref=NEW[API])]
        self.assertEqual(self.contract()[0], 1)

    def test_deprecated_use_warns_and_still_passes(self):
        self.w.schema(NEW[API], SDL.replace('statuses: [Item!]!', 'statuses: [Item!]! @deprecated(reason: "use items")'))
        code, out = self.contract()
        self.assertEqual(code, 0)
        self.assertIn('::warning::a.js:3: deprecated on unraid/api main', out)
        self.assertIn('on `main`, 1 deprecated', out)

    def test_given_refs_replace_the_defaults(self):
        self.w.fake.routes['GET', f'/repos/{API}/commits/v3.9.0'] = {'sha': sha(0xa3)}
        self.w.schema(sha(0xa3), SDL)
        code, out = self.contract(['v3.9.0'])
        self.assertEqual(code, 0)
        self.assertIn('valid on `v3.9.0`', out)
        self.assertNotIn('`main`', out)

    def test_scan_problem_fails_the_contract(self):
        code, out = self.contract(world=World(self, SCRIPT + 'fv3GraphQL(dynamic);\n'))
        self.assertEqual(code, 1)
        self.assertIn('::error::a.js:6:', out)


class CheckTest(Case):
    def check(self, script):
        world = World(self, script)
        code, out = self.captured(watch.cmd_check, CFG, world.root)
        self.assertEqual(world.fake.calls, [])
        return code, out

    def test_lists_what_it_found_and_passes(self):
        code, out = self.check(SCRIPT)
        self.assertEqual(code, 0)
        self.assertIn('a.js:4                 mutation($id: ID!) { docker { stop(id: $id) } }', out)
        self.assertIn(f'unraid/webgui          {USERPREFS}  (called from a.js:5)', out)
        self.assertIn('3 operations, 3 watched paths, 0 problem(s)', out)

    def test_unreadable_call_fails(self):
        code, out = self.check(SCRIPT + 'fv3GraphQL(dynamic);\n')
        self.assertEqual(code, 1)
        self.assertIn('::error::a.js:6: the GraphQL document must be a plain single-quoted string', out)

    def test_document_that_is_not_graphql_fails(self):
        code, out = self.check(SCRIPT + "fv3GraphQL('{ docker { ');\n")
        self.assertEqual(code, 1)
        self.assertIn('::error::a.js:6: not GraphQL (Syntax Error', out)

    def test_plugin_that_references_no_endpoint_fails(self):
        code, out = self.check(SCRIPT.replace('/plugins/dynamix.docker.manager/', '/plugins/other/'))
        self.assertEqual(code, 1)
        self.assertIn('::error::unraid/webgui: the plugin references none of its endpoints', out)


class MainTest(Case):
    def main(self, *argv):
        return self.captured(watch.main, list(argv))

    def test_watch_without_a_repository_is_an_operational_failure(self):
        self.assertEqual(self.main('watch'), (2, '::error::GITHUB_REPOSITORY is not set\n'))

    def test_upstream_failure_exits_2_with_one_error_line(self):
        os.environ['GITHUB_REPOSITORY'] = ME
        with mock.patch.object(watch, 'cmd_watch', side_effect=GitHubError('GET /x: HTTP 500\nbody')):
            self.assertEqual(self.main('watch'), (2, '::error::GET /x: HTTP 500 body\n'))

    def test_shipped_config_is_loaded_and_passed_on(self):
        with mock.patch.object(watch, 'cmd_check', return_value=0) as check:
            self.assertEqual(self.main('check', '--root', 'elsewhere')[0], 0)
        cfg, root = check.call_args[0]
        self.assertEqual((cfg['issue'], root), (52, 'elsewhere'))
        self.assertEqual([s['repo'] for s in cfg['sources']], [API, WEB, DOCS])

    def test_contract_gets_the_token_root_and_refs(self):
        os.environ['GITHUB_TOKEN'] = 'from-env'
        with mock.patch.object(watch, 'cmd_contract', return_value=1) as contract:
            self.assertEqual(self.main('contract', '--root', 'r', '--ref', 'v1', '--ref', 'v2')[0], 1)
        _, gh, root, refs = contract.call_args[0]
        self.assertEqual((gh.token, root, refs), ('from-env', 'r', ['v1', 'v2']))

    def test_status_gets_the_token_and_root(self):
        os.environ['GITHUB_TOKEN'] = 'from-env'
        with mock.patch.object(watch, 'cmd_status', return_value=0) as view:
            self.assertEqual(self.main('status', '--root', 'r')[0], 0)
        _, gh, root = view.call_args[0]
        self.assertEqual((gh.token, root), ('from-env', 'r'))

    def test_watch_gets_the_repository_base_and_dry_run(self):
        os.environ['GITHUB_REPOSITORY'] = ME
        with mock.patch.object(watch, 'cmd_watch', return_value=0) as run:
            self.main('watch', '--base', 'unraid/api=v1 unraid/webgui=7.3.2', '--dry-run')
            self.main('watch')
        self.assertEqual(run.call_args_list[0][0][2:], ('.', ME, 'unraid/api=v1 unraid/webgui=7.3.2', True))
        self.assertEqual(run.call_args_list[1][0][2:], ('.', ME, '', False))


if __name__ == '__main__':
    unittest.main()

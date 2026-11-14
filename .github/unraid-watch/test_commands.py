import os
import unittest
from pathlib import Path
from unittest import mock

import watch
from github import GitHubError
from world import API, CFG, DOCS, EVENTS, ME, NEW, RELEASE, SCRIPT, SDL, STYLES, USERPREFS, WEB, WITHOUT_STOP, Case, World, sha, url


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

    def test_contracts_are_checked_on_master_and_listed(self):
        code, out = self.contract()
        self.assertEqual(code, 0)
        self.assertIn(f'- contract {EVENTS}: holds on 2 of 2 refs', out)

    def test_a_contract_a_supported_release_breaks_fails_and_names_the_release(self):
        self.w.release_line()
        self.w.tree(WEB, '9.0.3', {EVENTS: 'ev0'})
        self.w.blob(WEB, 'ev0', "$arrResponse = ['ok' => $DockerClient->startContainer($container)];\n")
        code, out = self.contract()
        self.assertEqual(code, 1)
        self.assertIn(f"::error::unraid/webgui: {EVENTS} does not match \"'success' => \" on 9.0.3: answers in `success`", out)
        self.assertIn(f'- contract {EVENTS}: holds on 1 of 2 refs', out)

    def test_a_contract_file_a_release_does_not_have_is_named_missing_not_mismatched(self):
        self.w.release_line()
        self.w.tree(WEB, '9.0.3', {})
        code, out = self.contract()
        self.assertEqual(code, 1)
        self.assertIn(f'::error::unraid/webgui: {EVENTS} is missing on 9.0.3: answers in `success`', out)
        self.assertNotIn('does not match', out)

    def test_a_release_before_a_contracts_since_is_not_held_to_it(self):
        self.w.release_line()
        self.w.tree(WEB, '9.0.3', {})
        cfg = {**CFG, 'sources': [{**s, 'contracts': [{**s['contracts'][0], 'since': '9.1.0'}]} if 'contracts' in s else s
                                  for s in CFG['sources']]}
        code, out = self.captured(watch.cmd_contract, cfg, self.w.client(), self.w.root, None)
        self.assertEqual(code, 0)
        self.assertIn(f'- contract {EVENTS}: holds on 1 of 1 refs', out)

    def test_only_stable_releases_from_the_plugins_minimum_are_read(self):
        self.w.release_line()
        self.contract()
        read = {c[1].split('/git/trees/')[1].split('?')[0] for c in self.w.fake.calls if f'/repos/{WEB}/git/trees/' in c[1]}
        # master is read at the sha the run pinned it to, not by its moving name
        self.assertEqual(read, {'9.0.3', NEW[WEB]})

    def test_a_manifest_without_a_minimum_stops_the_contract_before_any_request(self):
        world = World(self, manifest='<PLUGIN name="p">\n')
        with self.assertRaisesRegex(watch.Problem, 'no min="x.y.z"'):
            self.contract(world=world)
        self.assertEqual(world.fake.calls, [])

    def test_no_supported_release_tag_is_an_error_not_a_pass_on_master_alone(self):
        self.w.tags(WEB, ['8.9.0', '9.1.0-beta.2', '2030.11.10'])
        with self.assertRaisesRegex(GitHubError, 'no stable release tag at or after 9.0.0'):
            self.contract()


class CheckTest(Case):
    def check(self, script, **world):
        world = World(self, script, **world)
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

    def test_an_unraid_css_variable_without_a_fallback_fails(self):
        code, out = self.check(SCRIPT, styles=STYLES + '.tip { margin: var(--gap); }\n')
        self.assertEqual(code, 1)
        self.assertIn('::error::a.css:3: var(--gap) has no fallback and FolderView3 does not define --gap', out)

    def test_a_manifest_without_a_minimum_fails(self):
        code, out = self.check(SCRIPT, manifest='<PLUGIN name="p">\n')
        self.assertEqual(code, 1)
        self.assertIn('::error::plugin.plg: no min="x.y.z" on its PLUGIN tag', out)

    def test_a_missing_manifest_says_it_is_missing(self):
        world = World(self)
        Path(world.root, 'plugin.plg').unlink()
        code, out = self.captured(watch.cmd_check, CFG, world.root)
        self.assertEqual(code, 1)
        self.assertIn('::error::plugin.plg is missing', out)

    def test_a_plugin_with_no_stylesheets_fails_instead_of_reading_as_nothing_styled(self):
        world = World(self)
        Path(world.root, 'plugin/styles/a.css').unlink()
        code, out = self.captured(watch.cmd_check, CFG, world.root)
        self.assertEqual(code, 1)
        self.assertIn('::error::plugin/styles has no stylesheets that style an element', out)

    def test_an_empty_stylesheet_fails_the_same_way(self):
        code, out = self.check(SCRIPT, styles='')
        self.assertEqual(code, 1)
        self.assertIn('::error::plugin/styles has no stylesheets that style an element', out)


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

import tempfile
import unittest
from pathlib import Path

import scan

RULES = [{'match': 'docker { ${act}', 'map': 'dockerMap'}]


class ScanTest(unittest.TestCase):
    def plugin(self, files):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for name, text in files.items():
            path = Path(tmp.name, name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding='utf-8')
        return Path(tmp.name)

    def test_reads_every_call_form(self):
        plugin = self.plugin({'scripts/a.js': '''
            const a = await fv3GraphQL('{ a }');
            await fv3GraphQL(
                'mutation($n: String!) { b(name: $n) { version } }',
                { n: name }
            );
            fetch('/graphql', { body: JSON.stringify({ query: '{ c }' }) });
            ws.send(JSON.stringify({ payload: { query: 'subscription { d }' } }));
            fv3GraphQL('mutation { docker { ' + act + '(id: 1) { id } } }', {});
            body: JSON.stringify(variables ? { query: query, variables: variables } : { query: query })
        ''', 'Folder.page': "<script>fv3GraphQL('{ e }')</script>"})
        found, problems = scan.documents(plugin)
        self.assertEqual(problems, [])
        self.assertEqual(found, {
            '{ a }': ['a.js:2'],
            'mutation($n: String!) { b(name: $n) { version } }': ['a.js:3'],
            '{ c }': ['a.js:7'],
            'subscription { d }': ['a.js:8'],
            'mutation { docker { ${act}(id: 1) { id } } }': ['a.js:9'],
            '{ e }': ['Folder.page:1'],
        })

    def test_same_document_keeps_every_site(self):
        plugin = self.plugin({'scripts/a.js': "fv3GraphQL('{ a }');\nfv3GraphQL('{ a }');\n"})
        self.assertEqual(scan.documents(plugin)[0], {'{ a }': ['a.js:1', 'a.js:2']})

    def test_flags_each_call_it_cannot_read(self):
        plugin = self.plugin({'scripts/a.js': '\n'.join([
            'fv3GraphQL(someQuery);',
            'fv3GraphQL(`{ a }`);',
            'fetch(u, { body: JSON.stringify({ query: other }) });',
            'fv3GraphQL("{ a }");',
        ])})
        found, problems = scan.documents(plugin)
        self.assertEqual(found, {})
        self.assertEqual([p.split(':')[1] for p in problems], ['1', '2', '3', '4'])
        self.assertTrue(all(p.startswith('a.js:') for p in problems))

    def test_ignores_calls_inside_comments(self):
        plugin = self.plugin({'scripts/a.js': "// fv3GraphQL(x) has no timeout\n * query: y\nfv3GraphQL('{ a }');\n"})
        self.assertEqual(scan.documents(plugin), ({'{ a }': ['a.js:3']}, []))

    def test_skips_vendored_scripts(self):
        plugin = self.plugin({'scripts/include/lib.js': 'fv3GraphQL(x);', 'scripts/a.js': "fv3GraphQL('{ a }');"})
        self.assertEqual(scan.documents(plugin), ({'{ a }': ['a.js:1']}, []))

    def test_fills_variable_from_the_js_map(self):
        plugin = self.plugin({'scripts/a.js': '''
            var dockerMap = { start: 'start', resume: 'unpause', go: 'start' };
            fv3GraphQL('mutation { docker { ' + act + '(id: 1) { id } } }', {});
        '''})
        ops, problems = scan.operations(plugin, RULES)
        self.assertEqual(problems, [])
        self.assertEqual(ops, [
            ('mutation { docker { start(id: 1) { id } } }', ['a.js:3']),
            ('mutation { docker { unpause(id: 1) { id } } }', ['a.js:3']),
        ])

    def test_each_variable_uses_the_rule_that_matches_its_document(self):
        plugin = self.plugin({'scripts/a.js': '''
            var vmMap = { a: 'reboot' };
            var dockerMap = { a: 'start' };
            fv3GraphQL('mutation { vm { ' + act + '(id: 1) } }', {});
            fv3GraphQL('mutation { docker { ' + act + '(id: 1) { id } } }', {});
        '''})
        ops, problems = scan.operations(plugin, [{'match': 'vm { ${act}', 'map': 'vmMap'}] + RULES)
        self.assertEqual(problems, [])
        self.assertEqual([q for q, _ in ops],
                         ['mutation { vm { reboot(id: 1) } }', 'mutation { docker { start(id: 1) { id } } }'])

    def test_variable_nothing_fills_is_a_problem(self):
        script = "fv3GraphQL('mutation { docker { ' + act + '(id: 1) { id } } }', {});\n"
        for label, files, rules in (
            ('no rule', {'scripts/a.js': "var dockerMap = { a: 'start' };\n" + script}, []),
            ('no map', {'scripts/a.js': script}, RULES),
            ('empty map', {'scripts/a.js': 'var dockerMap = {};\n' + script}, RULES),
        ):
            with self.subTest(label):
                ops, problems = scan.operations(self.plugin(files), rules)
                self.assertEqual(ops, [])
                self.assertEqual(len(problems), 1)
                self.assertIn('nothing fills the variable', problems[0])

    def test_no_documents_at_all_is_a_problem(self):
        ops, problems = scan.operations(self.plugin({'scripts/a.js': 'var x = 1;'}), RULES)
        self.assertEqual(ops, [])
        self.assertEqual(problems, ['no GraphQL documents found in the plugin scripts'])

    def test_endpoints_map_to_upstream_paths(self):
        plugin = self.plugin({
            'scripts/docker.js': "\n$.post('/plugins/dynamix.docker.manager/include/UserPrefs.php');\n"
                                 "$.get('/plugins/folder.view3/server/read.php');\n"
                                 "$.get('/webGui/include/DashboardApps.php');\n"
                                 "$.get('/plugins/dynamix/../../etc/x.php');\n",
            'scripts/vm.js': "$.post('/plugins/dynamix.docker.manager/include/UserPrefs.php');\n",
            'server/lib.php': '<?php\nrequire_once("$docroot/plugins/dynamix.docker.manager/include/DockerClient.php");\n'
                              'require_once("$docroot/plugins/dynamix.docker.manager/include/UserPrefs.php");\n',
        })
        prefixes = {'/plugins/dynamix.docker.manager/': 'emhttp/plugins/dynamix.docker.manager/',
                    '/plugins/dynamix/': 'emhttp/plugins/dynamix/', '/webGui/': 'emhttp/plugins/dynamix/'}
        self.assertEqual(scan.endpoints(plugin, prefixes), {
            'emhttp/plugins/dynamix.docker.manager/include/UserPrefs.php': 'docker.js:2',
            'emhttp/plugins/dynamix/include/DashboardApps.php': 'docker.js:4',
            'emhttp/plugins/dynamix.docker.manager/include/DockerClient.php': 'lib.php:2',
        })


if __name__ == '__main__':
    unittest.main()

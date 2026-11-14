import json
import pathlib
import tempfile
import unittest

import important_check

ROOT = 'src/plugin'


class ImportantCheckTest(unittest.TestCase):
    def check(self, files, bundled=()):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        repo = pathlib.Path(tmp.name)
        (repo / 'vendor.json').write_text(json.dumps({'root': ROOT, 'libraries': [{'files': {f'x/{b}': b for b in bundled}}]}), encoding='utf-8')
        for name, text in files.items():
            (repo / ROOT / name).parent.mkdir(parents=True, exist_ok=True)
            (repo / ROOT / name).write_text(text, encoding='utf-8')
        return important_check.problems(repo)

    def test_a_reason_above_the_rule_or_on_the_line_passes(self):
        sheet = ('.a { top: 0 }\n\n/* !important: Unraid inlines this padding */\n#t .x,\n#t .y {\n    padding-left: 20px !important;\n}\n'
                 '.b { margin: 0 !important; /* !important: a theme sets it inline */ }\n')
        self.assertEqual(self.check({'styles/a.css': sheet}), [])

    def test_an_important_without_its_reason_is_named_with_its_line(self):
        sheet = '/* spacing */\n.a {\n    top: 0;\n    left: 1px!important;\n}\n'
        self.assertEqual(self.check({'styles/a.css': sheet}),
                         [f'{ROOT}/styles/a.css:4: !important without a "!important: <reason>" comment on its line, the line above, or above its rule'])

    def test_a_reason_belongs_to_the_rule_under_it_only(self):
        sheet = '/* !important: first */\n.a { top: 0 !important }\n.b { top: 0 !important }\n'
        (problem,) = self.check({'styles/a.css': sheet})
        self.assertIn('a.css:3:', problem)

    def test_a_reason_at_the_end_of_a_line_covers_that_line_only(self):
        rules = '.a { top: 0 !important } /* !important: r */\n.b { top: 0 !important }\n'
        decls = '.c {\n    top: 0 !important; /* !important: r */\n    left: 0 !important;\n}\n'
        self.assertEqual([p.split(': !')[0] for p in self.check({'styles/a.css': rules, 'styles/b.css': decls})],
                         [f'{ROOT}/styles/a.css:2', f'{ROOT}/styles/b.css:3'])

    def test_a_nested_rule_does_not_move_a_declaration_to_its_selector(self):
        outer = '/* !important: r */\n.a {\n    .b { color: red }\n    top: 0 !important;\n}\n'
        inner = '.a {\n    /* !important: r */\n    .b { color: red }\n    top: 0 !important;\n}\n'
        self.assertEqual(self.check({'styles/a.css': outer}), [])
        (problem,) = self.check({'styles/b.css': inner})
        self.assertIn('b.css:4:', problem)

    def test_a_quote_in_a_regex_literal_or_a_php_hash_comment_is_read_as_code_does(self):
        js = "s = s.replace(/'/g, ''); el.style.cssText = 'x:1 !important'; // !important: r\n"
        php = "<?php\n# !important: r\necho '.b{top:0 !important}';\n"
        self.assertEqual(self.check({'scripts/a.js': js, 'server/a.php': php}), [])

    def test_any_case_a_url_or_an_html_reason_is_read_as_the_browser_does(self):
        found = self.check({'styles/a.css': '.a { top: 0 !IMPORTANT }\n',
                            'Folder.page': '<p>See https://example.test</p><style>.b { top: 0 !important }</style>\n<!-- !important: r -->\n<i style="top:0 !important"></i>\n'})
        self.assertEqual([p.split(': !')[0] for p in found], [f'{ROOT}/Folder.page:1', f'{ROOT}/styles/a.css:1'])

    def test_a_url_in_page_css_is_no_regex_but_one_in_its_script_is(self):
        page = ('<style>.a { background: url(/icon.svg); color: red !important; }</style>\n'
                "<script>s = s.replace(/'/g, ''); el.style.cssText = 'x:1 !important'; // !important: r\n</script>\n")
        (problem,) = self.check({'Folder.page': page})
        self.assertIn('Folder.page:1:', problem)

    def test_no_files_to_check_fails_closed(self):
        self.assertEqual(self.check({'README.md': 'x'}), [f'{ROOT}: no CSS, JS, PHP or .page files to check'])

    def test_a_reason_comment_must_give_a_reason(self):
        self.assertEqual(len(self.check({'styles/a.css': '/* !important: */\n.a { top: 0 !important }\n'})), 1)

    def test_a_comment_or_a_content_string_that_mentions_it_is_not_a_use(self):
        sheet = '/* never use !important here */\n.a::after { content: "!important"; }\n'
        self.assertEqual(self.check({'styles/a.css': sheet}), [])

    def test_a_script_needs_the_reason_on_its_line_or_the_line_above(self):
        good = "// beats swal's !important rules\n// !important: no stylesheet may show a row while it is measured\nrow.style.cssText += ';visibility:hidden !important;';\n"
        bad = "// hide the row\nrow.style.cssText += ';visibility:hidden !important;';\n"
        self.assertEqual(self.check({'scripts/a.js': good}), [])
        (problem,) = self.check({'scripts/b.js': bad})
        self.assertIn('scripts/b.js:2:', problem)

    def test_page_and_php_files_are_checked_too(self):
        found = self.check({'Folder.page': 'Menu="x"\n---\n<style>.a { top: 0 !important }</style>\n', 'server/a.php': "<?php echo '.b{top:0 !important}';\n"})
        self.assertEqual([p.split(':')[0] for p in found], [f'{ROOT}/Folder.page', f'{ROOT}/server/a.php'])

    def test_a_bundled_library_is_skipped(self):
        self.assertEqual(self.check({'styles/include/lib.css': '.a { top: 0 !important }\n', 'styles/own.css': '.b { top: 0 }\n'},
                                    bundled=['styles/include/lib.css']), [])


if __name__ == '__main__':
    unittest.main()

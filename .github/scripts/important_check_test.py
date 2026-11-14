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
        self.assertEqual(self.check({'styles/include/lib.css': '.a { top: 0 !important }\n'}, bundled=['styles/include/lib.css']), [])


if __name__ == '__main__':
    unittest.main()

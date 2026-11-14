import tempfile
import unittest
from pathlib import Path

import css


class RulesTest(unittest.TestCase):
    def test_each_selector_gets_the_declarations_and_its_at_rule(self):
        text = '/* a\ncomment */ @media (max-width: 9px) { .a, #b > .c { white-space: pre-line; margin-top:4px!important } }\n.d{display:none}'
        self.assertEqual(css.rules(text), [
            ('@media (max-width: 9px)', '.a', {'white-space': 'pre-line', 'margin-top': '4px !important'}),
            ('@media (max-width: 9px)', '#b > .c', {'white-space': 'pre-line', 'margin-top': '4px !important'}),
            ('', '.d', {'display': 'none'})])

    def test_a_semicolon_inside_a_url_does_not_end_the_declaration(self):
        self.assertEqual(css.rules('.a { background: url(data:image/png;base64,xy); top: 0 }'),
                         [('', '.a', {'background': 'url(data:image/png;base64,xy)', 'top': '0'})])

    def test_the_styled_element_is_the_last_compound_without_what_not_names(self):
        self.assertEqual(css.subject('#docker_containers > tr.sortable:not(.folder)'), ['.sortable'])
        self.assertEqual(css.subject('div.title:first-of-type'), ['.title'])
        self.assertEqual(css.subject('label + .content'), ['.content'])


class ChangesTest(unittest.TestCase):
    OURS = {'.tip': {'color'}, '.row': {'white-space'}}

    def by_ref(self, old, new):
        return {'7.0.0': css.merged([old]), 'master': css.merged([new])}

    def test_a_layout_property_unraid_changed_on_an_element_the_plugin_styles_is_listed(self):
        rows = css.changes(self.by_ref('.tip { display: block }', '.tip { white-space: pre-line }'), ['7.0.0', 'master'], self.OURS)
        self.assertEqual(rows, [('', '.tip', 'display', [('7.0.0', 'block'), ('master', None)]),
                                ('', '.tip', 'white-space', [('7.0.0', None), ('master', 'pre-line')])])

    def test_what_the_plugin_sets_itself_colours_and_elements_it_does_not_style_are_left_out(self):
        # .row's colour: an element the plugin styles, a property it does not set, but a colour, not layout
        old = '.row { white-space: nowrap; color: red } .tip { color: red } .other { display: block }'
        new = '.row { white-space: normal; color: blue } .tip { color: blue } .other { display: flex }'
        self.assertEqual(css.changes(self.by_ref(old, new), ['7.0.0', 'master'], self.OURS), [])

    def test_a_later_stylesheet_wins_as_the_page_loads_them(self):
        self.assertEqual(css.merged(['.tip { top: 1px }', '.tip { top: 2px }']), {('', '.tip', 'top'): '2px'})


class FallbacksTest(unittest.TestCase):
    def check(self, sheet, code=''):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        a, js = Path(tmp.name, 'a.css'), Path(tmp.name, 'a.js')
        a.write_text(sheet, encoding='utf-8')
        js.write_text(code, encoding='utf-8')
        return css.fallbacks([a], [js])

    def test_an_unraid_variable_without_a_fallback_is_named_with_its_line(self):
        (problem,) = self.check('/* two\nlines */\n.a { color: var(--text); }\n')
        self.assertTrue(problem.startswith('a.css:3: var(--text) has no fallback and only Unraid defines --text'), problem)

    def test_a_fallback_or_a_variable_the_plugin_owns_passes(self):
        self.assertEqual(self.check('.a { color: var(--text, #fff); }'), [])
        self.assertEqual(self.check(':root { --gap: 5px; } .a { gap: var(--gap); }'), [])
        self.assertEqual(self.check('.a { color: var(--fv3-name-color); }', "const vars = { 'fv3-name-color': '#fff' };"), [])

    def test_a_variable_nested_in_a_fallback_needs_its_own(self):
        (problem,) = self.check('.a { color: var(--fv3-x, var(--text)); }', "'fv3-x'")
        self.assertIn('var(--text) has no fallback', problem)


if __name__ == '__main__':
    unittest.main()

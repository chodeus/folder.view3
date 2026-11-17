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

    def test_nested_rules_resolve_against_their_parent_and_keep_its_own_declarations(self):
        text = '.title { display: flex; &:first-of-type { margin-top: 0 } .x, &.y { top: 1px } @media (min-width: 1px) { clear: both } }'
        self.assertEqual(css.rules(text), [
            ('', '.title', {'display': 'flex'}),
            ('', '.title:first-of-type', {'margin-top': '0'}),
            ('', '.title .x', {'top': '1px'}),
            ('', '.title.y', {'top': '1px'}),
            ('@media (min-width: 1px)', '.title', {'clear': 'both'})])

    def test_a_declaration_after_a_nested_rule_wins_as_it_does_in_the_browser(self):
        self.assertEqual(css.merged(['.tip { & { top: 1px; } top: 2px; }']), {('', '.tip', 'top'): '2px'})

    def test_a_statement_at_rule_does_not_swallow_the_next_rule_and_keyframes_are_no_elements(self):
        text = '@charset "UTF-8";\n@import url(a.css);\n.tip { display: block }\n@keyframes k { from { top: 0 } }'
        self.assertEqual(css.rules(text), [('', '.tip', {'display': 'block'})])

    def test_a_brace_inside_a_string_is_just_text(self):
        self.assertEqual(css.rules('.q::after { content: "}"; } .row { top: 0 }'),
                         [('', '.q::after', {'content': '"}"'}), ('', '.row', {'top': '0'})])

    def test_spacing_and_attribute_quotes_do_not_make_a_rule_new(self):
        a = css.merged(['label+.content{top:0} [type="radio"]~.x{top:0} @media (max-width:9px){.y{top:0}}'])
        b = css.merged(['label + .content { top: 0 } [type=radio] ~ .x { top: 0 } @media ( max-width: 9px ) { .y { top: 0 } }'])
        self.assertEqual(a, b)
        self.assertIn(('@media (max-width: 9px)', '.y', 'top'), a)

    def test_a_guard_nested_in_where_and_not_leaves_the_element_it_styles(self):
        self.assertEqual(css.subject('a.button:where(:not(.ext *))'), ['.button'])
        self.assertEqual(css.subject('.box:where(:not(:is(.a .b) .c))'), ['.box'])

    def test_a_generated_box_or_an_attribute_value_is_not_the_element(self):
        self.assertEqual(css.subject('.tip::before'), [])
        self.assertEqual(css.subject('a[href$=".png"]'), [])

    def test_a_group_rule_with_no_space_after_its_keyword_is_still_read(self):
        self.assertEqual(css.rules('@media(max-width:600px){.tip{white-space:pre-line}} @supports(display:grid){.row{top:0}}'),
                         [('@media (max-width: 600px)', '.tip', {'white-space': 'pre-line'}), ('@supports (display: grid)', '.row', {'top': '0'})])

    def test_a_comma_inside_not_stays_in_its_selector(self):
        self.assertEqual(css.rules('.x:not(.p, .q), .z { display: none }'),
                         [('', '.x:not(.p, .q)', {'display': 'none'}), ('', '.z', {'display': 'none'})])

    def test_a_semicolon_inside_a_url_does_not_end_the_declaration(self):
        self.assertEqual(css.rules('.a { background: url(data:image/png;base64,xy); top: 0 }'),
                         [('', '.a', {'background': 'url(data:image/png;base64,xy)', 'top': '0'})])

    def test_the_styled_element_is_the_last_compound_without_what_not_names(self):
        self.assertEqual(css.subject('#docker_containers > tr.sortable:not(.folder)'), ['.sortable'])
        self.assertEqual(css.subject('div.title:first-of-type'), ['.title'])
        self.assertEqual(css.subject('label + .content'), ['.content'])


class ChangesTest(unittest.TestCase):
    OURS = {'.tip': {('', 'color')}, '.row': {('', 'white-space')}}

    def by_ref(self, old, new):
        return {'9.0.0': css.merged([old]), 'master': css.merged([new])}

    def test_a_layout_property_unraid_changed_on_an_element_the_plugin_styles_is_listed(self):
        rows = css.changes(self.by_ref('.tip { display: block }', '.tip { white-space: pre-line }'), ['9.0.0', 'master'], self.OURS)
        self.assertEqual(rows, [('', '.tip', 'display', [('9.0.0', 'block'), ('master', None)]),
                                ('', '.tip', 'white-space', [('9.0.0', None), ('master', 'pre-line')])])

    def test_what_the_plugin_sets_itself_colours_and_elements_it_does_not_style_are_left_out(self):
        # .row's colour: an element the plugin styles, a property it does not set, but a colour, not layout
        old = '.row { white-space: nowrap; color: red } .tip { color: red } .other { display: block }'
        new = '.row { white-space: normal; color: blue } .tip { color: blue } .other { display: flex }'
        self.assertEqual(css.changes(self.by_ref(old, new), ['9.0.0', 'master'], self.OURS), [])

    def test_a_later_stylesheet_wins_as_the_page_loads_them(self):
        self.assertEqual(css.merged(['.tip { top: 1px }', '.tip { top: 2px }']), {('', '.tip', 'top'): '2px'})

    def test_an_important_declaration_is_not_overwritten_by_a_plain_one(self):
        self.assertEqual(css.merged(['.tip { top: 1px !important }', '.tip { top: 2px }']), {('', '.tip', 'top'): '1px !important'})
        self.assertEqual(css.rules('.tip { top: 1px !important; top: 2px }'), [('', '.tip', {'top': '1px !important'})])
        self.assertEqual(css.merged(['.tip { top: 1px !important }', '.tip { top: 3px !important }']), {('', '.tip', 'top'): '3px !important'})

    def test_the_plugin_setting_a_property_under_a_condition_covers_only_that_condition(self):
        ours = css.styled(['@media (max-width: 600px) { .tip { white-space: normal } }'])
        by_ref = {'9.0.0': css.merged(['.tip { white-space: nowrap }']), 'master': css.merged(['.tip { white-space: pre-line }'])}
        self.assertEqual([r[2] for r in css.changes(by_ref, ['9.0.0', 'master'], ours)], ['white-space'])
        same = {'9.0.0': css.merged(['@media (max-width: 600px) { .tip { white-space: nowrap } }']),
                'master': css.merged(['@media (max-width: 600px) { .tip { white-space: pre-line } }'])}
        self.assertEqual(css.changes(same, ['9.0.0', 'master'], ours), [])


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
        self.assertTrue(problem.startswith('a.css:3: var(--text) has no fallback and FolderView3 does not define --text'), problem)

    def test_a_fallback_or_a_variable_the_plugin_owns_passes(self):
        self.assertEqual(self.check('.a { color: var(--text, #fff); }'), [])
        self.assertEqual(self.check(':root { --gap: 5px; } .a { gap: var(--gap); }'), [])
        self.assertEqual(self.check('.a { color: var(--fv3-name-color); }', "const vars = { 'fv3-name-color': '#fff' };"), [])
        self.assertEqual(self.check('.a { color: var(--graph-cpu); }', "$vars = ['graph-cpu' => '#2b8da3'];"), [])

    def test_a_word_the_code_merely_uses_does_not_make_an_unraid_variable_the_plugins(self):
        (problem,) = self.check('.a { color: var(--text); }', "fields.push({ type: 'text', label: 'Name' });")
        self.assertIn('var(--text) has no fallback', problem)

    def test_code_that_only_reads_a_variable_does_not_define_it(self):
        (problem,) = self.check('.a { color: var(--text); }', "getComputedStyle(document.body).getPropertyValue('--text');")
        self.assertIn('var(--text) has no fallback', problem)

    def test_a_variable_nested_in_a_fallback_needs_its_own(self):
        (problem,) = self.check('.a { color: var(--fv3-x, var(--text)); }', "'fv3-x'")
        self.assertIn('var(--text) has no fallback', problem)


if __name__ == '__main__':
    unittest.main()

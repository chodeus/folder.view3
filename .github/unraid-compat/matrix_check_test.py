import unittest

import matrix_check

PLG = '<PLUGIN name="folder.view3" version="2099.01.01" min="7.0.0">'


def ci(*rows, tag="'7.4.0', php: '8.4'"):
    lines = [f"          - {{unraid: '{v}', php: '8.4'}}" for v in rows]
    return '\n'.join(lines + [f"          - {{unraid: {tag}, row: 'newest tag'}}"])


class MatrixCheckTest(unittest.TestCase):
    def test_one_row_per_minor_up_to_the_newest_passes_with_a_beta_or_that_release_as_newest_tag(self):
        self.assertEqual(matrix_check.problems(ci('7.0.1', '7.1.4', '7.2.7', '7.3.5', '7.4.0'), PLG), [])
        self.assertEqual(matrix_check.problems(ci('7.0.1', '7.1.4', '7.2.7', '7.3.5', '7.4.0', tag="'7.5.0-beta.1', php: '8.4'"), PLG), [])

    def test_a_release_the_newest_tag_reached_needs_its_own_row(self):
        self.assertEqual(matrix_check.problems(ci('7.0.1', '7.1.4', '7.2.7', '7.3.5', '7.4.0', tag="'7.5.0', php: '8.4'"), PLG),
                         ['Unraid 7.5.0 is out: give it a release row with the PHP its release notes name'])

    def test_a_skipped_minor_a_second_row_for_one_and_a_row_below_min_are_named(self):
        self.assertEqual(matrix_check.problems(ci('6.12.15', '7.0.1', '7.0.0', '7.2.7', '7.3.5', '7.4.0'), PLG), [
            'release row 6.12.15 is below the .plg\'s min 7.0',
            'Unraid 7.0 has 2 release rows: 7.0.1, 7.0.0',
            'no release row for Unraid 7.1, between the .plg\'s min and the newest row'])

    def test_a_commented_out_row_is_not_tested_so_not_counted(self):
        text = ci('7.0.1', '7.1.4', '7.3.5', '7.4.0').replace("          - {unraid: '7.3.5'", "          # - {unraid: '7.2.9', php: '8.4'}\n          - {unraid: '7.3.5'")
        self.assertEqual(matrix_check.problems(text, PLG), ["no release row for Unraid 7.2, between the .plg's min and the newest row"])

    def test_the_mins_own_major_needs_rows_when_only_a_later_major_has_them(self):
        self.assertEqual(matrix_check.problems(ci('8.0.0', tag="'8.0.0', php: '8.4'"), PLG),
                         ["no release row for Unraid 7.0, between the .plg's min and the newest row"])

    def test_a_missing_min_newest_tag_or_release_row_fails_closed(self):
        self.assertEqual(matrix_check.problems(ci('7.0.1'), '<PLUGIN name="folder.view3">'), ['folder.view3.plg names no min="x.y.z"'])
        self.assertEqual(matrix_check.problems("- {unraid: '7.0.1', php: '8.3'}", PLG), ["ci.yml needs exactly one 'newest tag' row, not 0"])
        self.assertEqual(matrix_check.problems(ci(), PLG), ['ci.yml has no Unraid release rows'])


if __name__ == '__main__':
    unittest.main()

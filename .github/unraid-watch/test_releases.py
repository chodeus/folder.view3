import unittest

import releases


class ReleasesTest(unittest.TestCase):
    def test_versions_sort_beta_before_rc_before_final(self):
        shuffled = ['9.1.0', '9.1.0-rc.1', '9.0.10', '9.1.0-beta.2.1', '9.1.0-beta.10', '9.1.0-beta.2', '9.0.9', '10.0.0-beta.1']
        self.assertEqual(sorted(shuffled, key=releases.order),
                         ['9.0.9', '9.0.10', '9.1.0-beta.2', '9.1.0-beta.2.1', '9.1.0-beta.10', '9.1.0-rc.1', '9.1.0',
                          '10.0.0-beta.1'])

    def test_stable_means_no_prerelease_suffix(self):
        self.assertTrue(releases.stable('9.1.0'))
        self.assertFalse(releases.stable('9.1.0-rc.1'))

    def test_reads_the_version_from_the_heading_in_either_style(self):
        self.assertEqual(releases.read('9.1.0.md', '# Version 9.1.0-beta.2 2030-01-02\n')[0], '9.1.0-beta.2')
        self.assertEqual(releases.read('9.0.0.md', 'intro\n# Release notes · Unraid OS 9.0.7\n')[0], '9.0.7')

    def test_falls_back_to_the_file_name_and_rejects_a_file_with_no_version(self):
        self.assertEqual(releases.read('9.0.7.md', '# Release notes\n'), ('9.0.7', None))
        self.assertIsNone(releases.read('index.md', '# Release notes\n'))

    def test_reads_the_bundled_api_version_in_every_style_the_notes_use(self):
        for label, body, expected in (
            ('plain', '- dynamix.unraid.net 4.1.2 - [see changes](https://example.test/releases)', '4.1.2'),
            ('arrow', '* [dynamix.unraid.net](<http://dynamix.unraid.net>): version 4.1.2 -> 4.2.0-5', '4.2.0'),
            ('unicode arrow', '- ↑ dynamix.unraid.net: 4.1.2 → 4.2.0-2', '4.2.0'),
            ('linked', '* Update [dynamix.unraid.net](<https://example.test/tag/v4.3.1>) 4.3.1 - see changes.', '4.3.1'),
            ('unchanged', '* The Unraid API version remains 4.2.0.', '4.2.0'),
            ('last mention wins', '* dynamix.unraid.net was 4.2.0 before\nkernel 6.18.52\n* dynamix.unraid.net: version 4.2.0 -> 4.3.1-2', '4.3.1'),
            ('not stated', '* Connect version checks restored. Linux kernel 6.18.52.', None),
        ):
            with self.subTest(label):
                self.assertEqual(releases.read('9.1.0.md', f'# Version 9.1.0\n\n{body}\n'), ('9.1.0', expected))


if __name__ == '__main__':
    unittest.main()

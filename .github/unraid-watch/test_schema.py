import unittest

import schema

SDL = '''
type Query { docker: Docker! info: Info! other: Other }
type Mutation { docker: DockerMutations! moveDockerEntries(to: String!, ids: [String!]!): Organizer! unrelated: Boolean }
type Subscription { dockerStats: Stats! }
type Docker {
  organizer(skipCache: Boolean! = false @deprecated(reason: "ignored")): Organizer!
  statuses: [StatusItem!]!
  old: String @deprecated(reason: "gone soon")
  node: Node
  everything: Query
}
interface Node { id: ID! }
type DockerMutations { start(id: ID!): Container! stop(id: ID!): Container! }
type Container implements Node { id: ID! state: ContainerState! owner: Owner }
union Owner = Container | Stats | Volume
type Volume { size: Int }
enum ContainerState { RUNNING EXITED }
type Organizer { version: Float! }
type StatusItem { name: String! updateStatus: UpdateStatus! }
enum UpdateStatus { UP_TO_DATE UPDATE_AVAILABLE }
type Stats { id: ID! cpuPercent: Float! }
type Info { os: Os! }
type Os { release: String theme: Theme }
enum Theme { black white }
type Other { x: Int }
input Entry { id: ID! wait: Int }
'''
S = schema.load(SDL)


def op(query, site='a.js:1'):
    return (query, [site])


class CheckTest(unittest.TestCase):
    def test_valid_operation_records_the_fields_it_touches(self):
        errors, deprecated, used = schema.check(S, [op('{ docker { statuses { name updateStatus } } }', 'a.js:7')])
        self.assertEqual((errors, deprecated), ([], []))
        self.assertEqual(used, {c: {'a.js:7'} for c in
                                ('Query.docker', 'Docker.statuses', 'StatusItem.name', 'StatusItem.updateStatus')})

    def test_unknown_field_is_an_error_at_its_site(self):
        errors, _, used = schema.check(S, [op('mutation { docker { restart(id: 1) { id } } }', 'a.js:9')])
        self.assertEqual(len(errors), 1)
        site, query, message = errors[0]
        self.assertEqual((site, query), ('a.js:9', 'mutation { docker { restart(id: 1) { id } } }'))
        self.assertIn("'restart'", message)
        self.assertEqual(used, {})

    def test_wrong_argument_is_an_error(self):
        errors, _, _ = schema.check(S, [op('mutation { moveDockerEntries(ids: ["a"], destination: "b") { version } }')])
        self.assertTrue(any("'destination'" in e[2] for e in errors))

    def test_broken_document_is_an_error_not_a_crash(self):
        errors, _, _ = schema.check(S, [op('{ docker { ')])
        self.assertEqual(len(errors), 1)
        self.assertIn('Syntax Error', errors[0][2])

    def test_deprecated_use_is_a_warning_not_an_error(self):
        errors, deprecated, used = schema.check(S, [op('{ docker { old } }')])
        self.assertEqual(errors, [])
        self.assertEqual(len(deprecated), 1)
        self.assertIn('Docker.old', deprecated[0][2])
        self.assertIn('Docker.old', used)

    def test_syntax_error_reports_only_bad_documents(self):
        self.assertIsNone(schema.syntax_error('{ a }'))
        self.assertIn('Syntax Error', schema.syntax_error('{ a '))


class SurfaceTest(unittest.TestCase):
    def test_matching_roots_and_everything_they_reach(self):
        lines, depends = schema.surface(S, '(?i)docker')
        self.assertEqual(depends, set())
        for coordinate in ('Query.docker', 'Mutation.docker', 'Mutation.moveDockerEntries', 'Subscription.dockerStats',
                           'Docker.statuses', 'DockerMutations.start', 'Container.state', 'ContainerState.RUNNING',
                           'UpdateStatus.UP_TO_DATE', 'Stats.cpuPercent', 'Owner.Container', 'Owner.Stats', 'Node.id',
                           'Volume.size'):
            self.assertIn(coordinate, lines)
        # Docker.everything returns Query, which must not drag every root field in
        for coordinate in ('Query.info', 'Query.other', 'Mutation.unrelated', 'Other.x', 'Os.release', 'Theme.black'):
            self.assertNotIn(coordinate, lines)

    def test_input_types_are_reached_through_arguments(self):
        s = schema.load(SDL + 'extend type Mutation { setDockerEntries(entries: [Entry!]!): Boolean }')
        lines, _ = schema.surface(s, '(?i)docker')
        self.assertEqual(lines['Entry.wait'], 'Entry.wait: Int')

    def test_signature_shows_arguments_defaults_and_deprecation(self):
        lines, _ = schema.surface(S, '(?i)docker')
        self.assertEqual(lines['Docker.organizer'], 'Docker.organizer(skipCache: Boolean! = false @deprecated): Organizer!')
        # arguments are listed by name, so upstream reordering them is not a change
        self.assertEqual(lines['Mutation.moveDockerEntries'],
                         'Mutation.moveDockerEntries(ids: [String!]!, to: String!): Organizer!')
        self.assertEqual(lines['Docker.old'], 'Docker.old: String @deprecated')
        self.assertEqual(lines['Owner.Stats'], 'Owner may be Stats')

    def test_used_fields_outside_the_pattern_are_tracked_alone(self):
        used = {'Query.info': {'a.js:1'}, 'Info.os': {'a.js:1'}, 'Os.theme': {'a.js:1'}, 'Gone.field': {'a.js:1'}}
        lines, depends = schema.surface(S, '(?i)docker', used)
        self.assertEqual(lines['Os.theme'], 'Os.theme: Theme')
        self.assertEqual(lines['Theme.black'], 'Theme.black')
        self.assertNotIn('Os.release', lines)
        self.assertNotIn('Gone.field', lines)
        self.assertEqual(depends, {'Query.info', 'Info.os', 'Os.theme', 'Theme.black', 'Theme.white'})

    def test_every_value_of_an_enum_the_plugin_reads_counts_as_used(self):
        _, depends = schema.surface(S, '(?i)docker', {'StatusItem.updateStatus': {'a.js:1'}})
        self.assertEqual(depends, {'StatusItem.updateStatus', 'UpdateStatus.UP_TO_DATE', 'UpdateStatus.UPDATE_AVAILABLE'})


class CoverageTest(unittest.TestCase):
    def test_lists_operations_never_called_and_how_much_of_each_type_is_read(self):
        used = {c: {'a.js:1'} for c in ('Query.docker', 'Docker.statuses', 'StatusItem.name', 'Mutation.docker',
                                        'DockerMutations.start')}
        idle, types = schema.coverage(S, '(?i)docker', used, ['Docker', 'DockerMutations'])
        self.assertEqual(idle, [
            'Docker.everything: Query',
            'Docker.node: Node',
            'Docker.old: String @deprecated',
            'Docker.organizer(skipCache: Boolean! = false @deprecated): Organizer!',
            'DockerMutations.stop(id: ID!): Container!',
            'Mutation.moveDockerEntries(ids: [String!]!, to: String!): Organizer!',
            'Subscription.dockerStats: Stats!',
        ])
        self.assertIn(('StatusItem', 1, 2), types)
        self.assertIn(('Container', 0, 3), types)
        self.assertNotIn('Docker', [name for name, _, _ in types])

    def test_a_type_read_in_full_and_an_id_field_are_not_gaps(self):
        s = schema.load(SDL + 'extend type Docker { id: ID! }')
        used = {'Query.docker': {'a'}, 'Docker.statuses': {'a'}, 'StatusItem.name': {'a'}, 'StatusItem.updateStatus': {'a'}}
        idle, types = schema.coverage(s, '(?i)docker', used, ['Docker'])
        self.assertNotIn('Docker.id: ID!', idle)
        self.assertNotIn('StatusItem', [name for name, _, _ in types])
        self.assertNotIn('UpdateStatus', [name for name, _, _ in types])

    def test_the_same_text_is_parsed_once(self):
        self.assertIs(schema.load(SDL), schema.load(SDL))


class DiffTest(unittest.TestCase):
    def test_reports_removed_changed_and_added(self):
        old = {'A.gone': 'A.gone: Int', 'A.same': 'A.same: Int', 'A.moved': 'A.moved: Int'}
        new = {'A.same': 'A.same: Int', 'A.moved': 'A.moved: String', 'A.fresh': 'A.fresh: Int'}
        self.assertEqual(schema.diff(old, new), [
            ('added', 'A.fresh', 'A.fresh: Int'),
            ('removed', 'A.gone', 'A.gone: Int'),
            ('changed', 'A.moved', 'A.moved: Int  ->  A.moved: String'),
        ])

    def test_identical_surfaces_have_no_diff(self):
        lines, _ = schema.surface(S, '(?i)docker')
        self.assertEqual(schema.diff(lines, dict(lines)), [])


if __name__ == '__main__':
    unittest.main()

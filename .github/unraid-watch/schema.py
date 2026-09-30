"""Check GraphQL operations against an unraid/api schema and list the part of it FolderView3 cares about."""
import functools
import re

from graphql import (
    GraphQLEnumType, GraphQLError, GraphQLInputObjectType, GraphQLInterfaceType, GraphQLObjectType,
    GraphQLUnionType, TypeInfo, build_schema, get_named_type, parse, print_ast, validate, visit,
)
from graphql.language import Visitor
from graphql.utilities import TypeInfoVisitor
from graphql.validation import NoDeprecatedCustomRule

@functools.lru_cache(maxsize=32)
def load(sdl):
    """Schema for an SDL text; a run meets the same text several times and parses it once."""
    return build_schema(sdl)


def syntax_error(query):
    """Parser message for a document that is not GraphQL, else None."""
    try:
        parse(query)
    except GraphQLError as e:
        return e.message
    return None


class _Fields(Visitor):
    def __init__(self, info, used, where):
        super().__init__()
        self.info, self.used, self.where = info, used, where

    def enter_field(self, node, *_):
        parent = self.info.get_parent_type()
        if parent is not None:
            self.used.setdefault(f'{parent.name}.{node.name.value}', set()).update(self.where)


def check(schema, ops):
    """(errors, deprecations, {Type.field: call sites}) for [(query, [file:line])]; an error is (site, query, message)."""
    errors, deprecated, used = [], [], {}
    for query, where in ops:
        try:
            doc = parse(query)
            found = validate(schema, doc)
        except GraphQLError as e:
            found = [e]
        if found:
            errors += [(where[0], query, e.message) for e in found]
            continue
        deprecated += [(where[0], query, e.message) for e in validate(schema, doc, [NoDeprecatedCustomRule])]
        info = TypeInfo(schema)
        visit(doc, TypeInfoVisitor(info, _Fields(info, used, where)))
    return errors, deprecated, used


def _deprecated(item):
    return ' @deprecated' if getattr(item, 'deprecation_reason', None) else ''


def _args(field):
    out = []
    for name, arg in sorted(field.args.items()):
        default = getattr(getattr(arg, 'ast_node', None), 'default_value', None)
        out.append(f'{name}: {arg.type}' + (f' = {print_ast(default)}' if default is not None else '') + _deprecated(arg))
    return f"({', '.join(out)})" if out else ''


def surface(schema, pattern, used=()):
    """({coordinate: signature}, coordinates the plugin depends on): root fields matching pattern, all they reach, and used fields."""
    wanted = re.compile(pattern)
    lines, depends, seen, todo = {}, set(), set(), []

    def reach(t):
        t = get_named_type(t)
        if t.name not in seen:
            seen.add(t.name)
            todo.append(t)

    def field(owner, name, f, follow=True):
        lines[f'{owner}.{name}'] = f'{owner}.{name}{_args(f)}: {f.type}{_deprecated(f)}'
        if follow:
            for t in [f.type, *(a.type for a in f.args.values())]:
                reach(t)

    def values(enum):
        for name, value in enum.values.items():
            lines[f'{enum.name}.{name}'] = f'{enum.name}.{name}{_deprecated(value)}'

    roots = [t for t in (schema.query_type, schema.mutation_type, schema.subscription_type) if t]
    seen.update(t.name for t in roots)
    for root in roots:
        for name, f in root.fields.items():
            if wanted.search(name):
                field(root.name, name, f)
    while todo:
        t = todo.pop()
        if isinstance(t, (GraphQLObjectType, GraphQLInterfaceType)):
            for name, f in t.fields.items():
                field(t.name, name, f)
        elif isinstance(t, GraphQLInputObjectType):
            for name, f in t.fields.items():
                lines[f'{t.name}.{name}'] = f'{t.name}.{name}: {f.type}{_deprecated(f)}'
                reach(f.type)
        elif isinstance(t, GraphQLEnumType):
            values(t)
        elif isinstance(t, GraphQLUnionType):
            for member in t.types:
                lines[f'{t.name}.{member.name}'] = f'{t.name} may be {member.name}'
                reach(member)
    # The plugin compares enum results as strings, so every value of an enum it reads counts as used
    for coordinate in used:
        owner, _, name = coordinate.partition('.')
        f = getattr(schema.type_map.get(owner), 'fields', {}).get(name)
        if f is None:
            continue
        field(owner, name, f, follow=False)
        depends.add(coordinate)
        leaf = get_named_type(f.type)
        if isinstance(leaf, GraphQLEnumType):
            values(leaf)
            depends.update(f'{leaf.name}.{v}' for v in leaf.values)
    return lines, depends


def coverage(schema, pattern, used, namespaces):
    """(operations the plugin never calls, [(type, fields read, fields available)]) across the watched surface."""
    lines, depends = surface(schema, pattern, used)
    roots = [t.name for t in (schema.query_type, schema.mutation_type, schema.subscription_type) if t]
    callers = {*roots, *namespaces}
    idle = [lines[c] for c in sorted(lines)
            if c.split('.')[0] in callers and c not in depends and not c.endswith('.id')]
    tally = {}
    for coordinate in lines:
        owner = coordinate.split('.')[0]
        if owner not in callers:
            total, read = tally.get(owner, (0, 0))
            tally[owner] = (total + 1, read + (coordinate in depends))
    return idle, [(owner, read, total) for owner, (total, read) in sorted(tally.items()) if read < total]


def diff(old, new):
    """[(removed|changed|added, coordinate, text)] from one surface to the next."""
    out = []
    for coordinate in sorted(old.keys() | new.keys()):
        a, b = old.get(coordinate), new.get(coordinate)
        if a != b:
            out.append(('added', coordinate, b) if a is None else ('removed', coordinate, a) if b is None
                       else ('changed', coordinate, f'{a}  ->  {b}'))
    return out

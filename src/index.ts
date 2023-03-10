/**
 * @since 0.4.0
 */
import { Alternative1 } from 'fp-ts/lib/Alternative'
import { identity, pipe, tuple } from 'fp-ts/lib/function'
import { Monad1 } from 'fp-ts/lib/Monad'
import { Monoid } from 'fp-ts/lib/Monoid'
import { fromEither, isNone, none, Option, some } from 'fp-ts/lib/Option'
import { isEmpty } from 'fp-ts/lib/Record'
import { failure, Int, string, success, Type, Validation } from 'io-ts'
import { Contravariant1 } from 'fp-ts/lib/Contravariant'
import { apply, chain as chain_, either, identity as identity_, option, pipeable } from 'fp-ts'

/**
 * @category routes
 * @since 0.4.0
 */
export type QueryValues = string | Array<string> | undefined

/**
 * @category routes
 * @since 0.4.0
 */
export interface Query {
  [key: string]: QueryValues
}

const Query = {
  fromURLSearchParams: (searchParams: URLSearchParams): Query => {
    const query: Query = {}

    searchParams.forEach((v, k) => {
      const q = query[k]
      if (Array.isArray(q)) {
        q.push(v)
      } else if (q === undefined) {
        query[k] = v
      } else {
        query[k] = [q, v]
      }
    })

    return query
  },
  toURLSearchParams: (query: Query): URLSearchParams => {
    const searchParams = new URLSearchParams()

    for (const key in query) {
      const value = query[key]
      if (value === undefined) {
        continue
      } else if (Array.isArray(value)) {
        value.forEach((v) => {
          searchParams.append(key, v)
        })
      } else {
        searchParams.set(key, value)
      }
    }

    return searchParams
  }
}

/**
 * @category routes
 * @since 0.4.0
 */
export class Route {
  /**
   * @since 0.4.0
   */
  static empty = new Route([], {})
  constructor(readonly parts: Array<string>, readonly query: Query) {}
  /**
   * @since 0.4.0
   */
  static isEmpty(r: Route): boolean {
    return r.parts.length === 0 && isEmpty(r.query)
  }
  /**
   * @since 0.4.0
   */
  static parse(s: string, decode: boolean = true): Route {
    // Any valid origin can be used as the second argument as the value itself won't be used.
    const { pathname, searchParams } = new URL(s, 'https://example.com')
    const parts = pipe(pathname, (s) => {
      const r = s.split('/').filter(Boolean)
      return decode ? r.map(decodeURIComponent) : r
    })
    const query = Query.fromURLSearchParams(searchParams)
    return new Route(parts, query)
  }
  /**
   * @since 0.4.0
   */
  toString(encode: boolean = true): string {
    const searchParams = Query.toURLSearchParams(this.query)
    const qs = searchParams.toString().replace(/\+/g, '%20')
    const parts = encode ? this.parts.map(encodeURIComponent) : this.parts
    return '/' + parts.join('/') + (qs ? '?' + qs : '')
  }
}

const assign =
  <A>(a: A) =>
  <B>(b: B): A & B =>
    Object.assign({}, a, b)

/**
 * Encodes the constraint that a given object `O`
 * does not contain specific keys `K`
 *
 * @since 0.4.0
 */
export type RowLacks<O, K extends string | number | symbol> = O & Record<Extract<keyof O, K>, never>

declare module 'fp-ts/lib/HKT' {
  interface URItoKind<A> {
    'fp-ts-routing/Parser': Parser<A>
  }
}

const PARSER_URI = 'fp-ts-routing/Parser'

type PARSER_URI = typeof PARSER_URI

/**
 * @category parsers
 * @since 0.4.0
 */
export class Parser<A> {
  /**
   * @since 0.4.0
   */
  readonly _A!: A
  constructor(readonly run: (r: Route) => Option<[A, Route]>) {}
  /**
   * @since 0.4.0
   */
  static of<A>(a: A): Parser<A> {
    return new Parser((s) => some(tuple(a, s)))
  }
  /**
   * @since 0.4.0
   */
  map<B>(f: (a: A) => B): Parser<B> {
    return this.chain((a) => Parser.of(f(a))) // <= derived
  }
  /**
   * @since 0.4.0
   */
  ap<B>(fab: Parser<(a: A) => B>): Parser<B> {
    return fab.chain((f) => this.map(f)) // <= derived
  }
  /**
   * @since 0.4.0
   */
  chain<B>(f: (a: A) => Parser<B>): Parser<B> {
    return new Parser((r) => option.chain(([a, r2]: [A, Route]) => f(a).run(r2))(this.run(r)))
  }
  /**
   * @since 0.4.0
   */
  alt(that: Parser<A>): Parser<A> {
    return new Parser((r) => {
      const oar = this.run(r)
      return isNone(oar) ? that.run(r) : oar
    })
  }
  /**
   * @since 0.4.0
   */
  then<B>(that: Parser<RowLacks<B, keyof A>>): Parser<A & B> {
    return that.ap(this.map(assign as (a: A) => (b: B) => A & B))
  }
}

/**
 * @category parsers
 * @since 0.4.0
 */
export function zero<A>(): Parser<A> {
  return new Parser(() => none)
}

/**
 * @category parsers
 * @since 0.4.0
 */
export function parse<A>(parser: Parser<A>, r: Route, a: A): A {
  const oa = option.map(([a]: [A, Route]) => a)(parser.run(r))
  return isNone(oa) ? a : oa.value
}

/**
 * @category parsers
 * @since 0.5.1
 */
export const getParserMonoid = <A>(): Monoid<Parser<A>> => ({
  concat: (x, y) => x.alt(y),
  empty: zero<A>()
})

/**
 * @category parsers
 * @since 0.5.1
 */
export const parser: Monad1<PARSER_URI> & Alternative1<PARSER_URI> = {
  URI: PARSER_URI,
  map: (ma, f) => ma.map(f),
  of: Parser.of,
  ap: (mab, ma) => ma.ap(mab),
  chain: (ma, f) => ma.chain(f),
  alt: (fx, f) =>
    new Parser((r) => {
      const oar = fx.run(r)
      return isNone(oar) ? f().run(r) : oar
    }),
  zero
}

/**
 * @category parsers
 * @since 0.5.1
 */
export const alt = pipeable.alt(parser)

/**
 * @category parsers
 * @since 0.5.1
 */
export const ap = pipeable.ap(parser)

/**
 * @category parsers
 * @since 0.5.1
 */
export const apFirst = apply.apFirst(parser)

/**
 * @category parsers
 * @since 0.5.1
 */
export const apSecond = apply.apSecond(parser)

/**
 * @category parsers
 * @since 0.5.1
 */
export const chain = pipeable.chain(parser)

/**
 * @category parsers
 * @since 0.5.1
 */
export const chainFirst = chain_.chainFirst(parser)

/**
 * @category parsers
 * @since 0.5.1
 */
export const flatten = identity_.flatten(parser)

/**
 * @category parsers
 * @since 0.5.1
 */
export const map = pipeable.map(parser)

/**
 * @category formatters
 * @since 0.4.0
 */
export class Formatter<A> {
  /**
   * @since 0.4.0
   */
  readonly _A!: A
  constructor(readonly run: (r: Route, a: A) => Route) {}
  /**
   * @since 0.4.0
   */
  contramap<B>(f: (b: B) => A): Formatter<B> {
    return new Formatter((r, b) => this.run(r, f(b)))
  }
  /**
   * @since 0.4.0
   */
  then<B>(that: Formatter<B> & Formatter<RowLacks<B, keyof A>>): Formatter<A & B> {
    return new Formatter((r, ab) => that.run(this.run(r, ab), ab))
  }
}

/**
 * @category formatters
 * @since 0.4.0
 */
export function format<A>(formatter: Formatter<A>, a: A, encode: boolean = true): string {
  return formatter.run(Route.empty, a).toString(encode)
}

declare module 'fp-ts/lib/HKT' {
  interface URItoKind<A> {
    'fp-ts-routing/Formatter': Formatter<A>
  }
}

const FORMATTER_URI = 'fp-ts-routing/Formatter'

type FORMATTER_URI = typeof FORMATTER_URI

/**
 * @category formatters
 * @since 0.5.1
 */
export const formatter: Contravariant1<FORMATTER_URI> = {
  URI: FORMATTER_URI,
  contramap: (fa, f) => fa.contramap(f)
}

/**
 * @category formatters
 * @since 0.5.1
 */
export const contramap = pipeable.contramap(formatter)

/**
 * @category matchers
 * @since 0.4.0
 */
export class Match<A> {
  /**
   * @since 0.4.0
   */
  readonly _A!: A
  constructor(readonly parser: Parser<A>, readonly formatter: Formatter<A>) {}
  /**
   * @since 0.4.0
   */
  imap<B>(f: (a: A) => B, g: (b: B) => A): Match<B> {
    return new Match(this.parser.map(f), this.formatter.contramap(g))
  }
  /**
   * @since 0.4.0
   */
  then<B>(that: Match<B> & Match<RowLacks<B, keyof A>>): Match<A & B> {
    const p = this.parser.then(that.parser)
    const f = this.formatter.then<B>(that.formatter)
    return new Match(p, f)
  }
}

/**
 * @category matchers
 * @since 0.5.1
 */
export function imap<A, B>(f: (a: A) => B, g: (b: B) => A): (ma: Match<A>) => Match<B> {
  return (ma) => ma.imap(f, g)
}

/**
 * @category matchers
 * @since 0.5.1
 */
export function then<B>(mb: Match<B>): <A>(ma: Match<A> & Match<RowLacks<A, keyof B>>) => Match<A & B> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ma) => ma.then(mb as any)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const singleton = <K extends string, V>(k: K, v: V): { [_ in K]: V } => ({ [k as any]: v } as any)

/**
 * `succeed` matches everything but consumes nothing
 *
 * @category matchers
 * @since 0.4.0
 */
export function succeed<A>(a: A): Match<A> {
  return new Match(new Parser((r) => some(tuple(a, r))), new Formatter(identity))
}

/**
 * `end` matches the end of a route
 *
 * @category matchers
 * @since 0.4.0
 */
export const end: Match<object> = new Match(
  new Parser((r) => (Route.isEmpty(r) ? some(tuple({}, r)) : none)),
  new Formatter(identity)
)

/**
 * `type` matches any io-ts type path component
 *
 * @example
 * import * as t from 'io-ts'
 * import { lit, type, Route } from '@rjdellecese/fp-ts-routing'
 * import { some, none } from 'fp-ts/lib/Option'
 *
 * const T = t.keyof({
 *   a: null,
 *   b: null
 * })
 *
 * const match = lit('search').then(type('topic', T))
 *
 * assert.deepStrictEqual(match.parser.run(Route.parse('/search/a')), some([{ topic: 'a' }, Route.empty]))
 * assert.deepStrictEqual(match.parser.run(Route.parse('/search/b')), some([{ topic: 'b' }, Route.empty]))
 * assert.deepStrictEqual(match.parser.run(Route.parse('/search/')), none)
 *
 * @category matchers
 * @since 0.4.0
 */
export function type<K extends string, A>(k: K, type: Type<A, string>): Match<{ [_ in K]: A }> {
  return new Match(
    new Parser((r) => {
      if (r.parts.length === 0) {
        return none
      } else {
        const head = r.parts[0]
        const tail = r.parts.slice(1)
        return option.map((a: A) => tuple(singleton(k, a), new Route(tail, r.query)))(fromEither(type.decode(head)))
      }
    }),
    new Formatter((r, o) => new Route(r.parts.concat(type.encode(o[k])), r.query))
  )
}

/**
 * `str` matches any string path component
 *
 * @example
 * import { str, Route } from '@rjdellecese/fp-ts-routing'
 * import { some, none } from 'fp-ts/lib/Option'
 *
 * assert.deepStrictEqual(str('id').parser.run(Route.parse('/abc')), some([{ id: 'abc' }, new Route([], {})]))
 * assert.deepStrictEqual(str('id').parser.run(Route.parse('/')), none)
 *
 * @category matchers
 * @since 0.4.0
 */
export function str<K extends string>(k: K): Match<{ [_ in K]: string }> {
  return type(k, string)
}

/**
 * @internal
 */
export const IntegerFromString = new Type<number, string, unknown>(
  'IntegerFromString',
  (u): u is number => Int.is(u),
  (u, c) =>
    either.chain((s: string): Validation<number> => {
      const n = +s
      return isNaN(n) || !Number.isInteger(n) ? failure(s, c) : success(n)
    })(string.validate(u, c)),
  String
)

/**
 * `int` matches any integer path component
 *
 * @example
 * import { int, Route } from '@rjdellecese/fp-ts-routing'
 * import { some, none } from 'fp-ts/lib/Option'
 *
 * assert.deepStrictEqual(int('id').parser.run(Route.parse('/1')), some([{ id: 1 }, new Route([], {})]))
 * assert.deepStrictEqual(int('id').parser.run(Route.parse('/a')), none)
 *
 * @category matchers
 * @since 0.4.0
 */
export function int<K extends string>(k: K): Match<{ [_ in K]: number }> {
  return type(k, IntegerFromString)
}

/**
 * `lit(x)` will match exactly the path component `x`
 *
 * @example
 * import { lit, Route } from '@rjdellecese/fp-ts-routing'
 * import { some, none } from 'fp-ts/lib/Option'
 *
 * assert.deepStrictEqual(lit('subview').parser.run(Route.parse('/subview/')), some([{}, new Route([], {})]))
 * assert.deepStrictEqual(lit('subview').parser.run(Route.parse('/')), none)
 *
 * @category matchers
 * @since 0.4.0
 */
export function lit(literal: string): Match<object> {
  return new Match(
    new Parser((r) => {
      if (r.parts.length === 0) {
        return none
      } else {
        const head = r.parts[0]
        const tail = r.parts.slice(1)
        return head === literal ? some(tuple({}, new Route(tail, r.query))) : none
      }
    }),
    new Formatter((r) => new Route(r.parts.concat(literal), r.query))
  )
}

/**
 * Will match a querystring.
 *
 *
 * **Note**. Use `io-ts`'s `strict` instead of `type` otherwise excess properties won't be removed.
 *
 * @example
 * import * as t from 'io-ts'
 * import { lit, str, query, Route } from '@rjdellecese/fp-ts-routing'
 *
 * const route = lit('accounts')
 *   .then(str('accountId'))
 *   .then(lit('files'))
 *   .then(query(t.strict({ pathparam: t.string })))
 *   .formatter.run(Route.empty, { accountId: 'testId', pathparam: '123' })
 *   .toString()
 * assert.strictEqual(route, '/accounts/testId/files?pathparam=123')
 *
 * @category matchers
 * @since 0.4.0
 */
export function query<A>(type: Type<A, Record<string, QueryValues>>): Match<A> {
  return new Match(
    new Parser((r) => option.map((query: A) => tuple(query, new Route(r.parts, {})))(fromEither(type.decode(r.query)))),
    new Formatter((r, query) => new Route(r.parts, type.encode(query)))
  )
}

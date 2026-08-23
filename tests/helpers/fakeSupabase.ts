// Fake, minimal Supabase client for route-handler tests. Mimics the slice of
// the chainable query builder our API routes actually use:
//   from(table).upsert(...).select(...).single()/.maybeSingle()
//   from(table).insert(...)
//   from(table).update(...).eq(...).eq(...).select().maybeSingle()
//   from(table).delete().eq(...).eq(...).in(...)
//   rpc(fnName, args)
//   auth.getUser() / auth.getClaims()
//
// Not a test file itself (lives outside the `tests/**/*.test.ts` glob).
import { vi } from "vitest";

export interface TableResult {
  data: unknown;
  error: unknown;
}

export interface RecordedCall {
  method: string;
  args: unknown[];
}

/** A chainable, thenable fake query builder. Every chained method records
 * its call and returns `this`; awaiting the builder directly (as the route
 * handlers do after `.delete().eq().eq()`, with no trailing `.select()`)
 * resolves to the configured result, same as calling `.single()` /
 * `.maybeSingle()` would. */
export class FakeQueryBuilder implements PromiseLike<TableResult> {
  calls: RecordedCall[] = [];

  constructor(private readonly result: TableResult) {}

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  upsert(...args: unknown[]): this {
    return this.record("upsert", args);
  }

  insert(...args: unknown[]): this {
    return this.record("insert", args);
  }

  update(...args: unknown[]): this {
    return this.record("update", args);
  }

  delete(...args: unknown[]): this {
    return this.record("delete", args);
  }

  select(...args: unknown[]): this {
    return this.record("select", args);
  }

  eq(...args: unknown[]): this {
    return this.record("eq", args);
  }

  in(...args: unknown[]): this {
    return this.record("in", args);
  }

  single(): Promise<TableResult> {
    this.record("single", []);
    return Promise.resolve(this.result);
  }

  maybeSingle(): Promise<TableResult> {
    this.record("maybeSingle", []);
    return Promise.resolve(this.result);
  }

  then<TResult1 = TableResult, TResult2 = never>(
    onfulfilled?:
      | ((value: TableResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

export interface FakeUser {
  id: string;
}

export interface FakeSupabaseOptions {
  user?: FakeUser | null;
  authError?: unknown;
  /**
   * Result returned for each `.from(table)` call, keyed by table name.
   * A single `TableResult` is reused for every call to that table. Pass an
   * array to hand back different results for successive calls to the same
   * table within one request (e.g. a lookup select followed by an insert);
   * once the array is exhausted, its last entry is reused.
   */
  tableResults?: Record<string, TableResult | TableResult[]>;
  /**
   * Result returned for each `.rpc(fnName, args)` call, keyed by function
   * name. Same reuse/array rules as tableResults above.
   */
  rpcResults?: Record<string, TableResult | TableResult[]>;
}

export interface FakeSupabaseClient {
  auth: { getUser: ReturnType<typeof vi.fn>; getClaims: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  /** Every builder created per table, in call order, for assertions. */
  builders: Record<string, FakeQueryBuilder[]>;
  /** Every `.rpc()` call, in call order, for assertions. */
  rpcCalls: RecordedCall[];
}

const DEFAULT_RESULT: TableResult = { data: null, error: null };

export function createFakeSupabase(
  options: FakeSupabaseOptions = {},
): FakeSupabaseClient {
  const builders: Record<string, FakeQueryBuilder[]> = {};
  const rpcCallCounts: Record<string, number> = {};
  const rpcCalls: RecordedCall[] = [];

  const from = vi.fn((table: string) => {
    const configured = options.tableResults?.[table];
    let result: TableResult;
    if (Array.isArray(configured)) {
      const callIndex = builders[table]?.length ?? 0;
      result = configured[Math.min(callIndex, configured.length - 1)];
    } else {
      result = configured ?? DEFAULT_RESULT;
    }
    const builder = new FakeQueryBuilder(result);
    (builders[table] ??= []).push(builder);
    return builder;
  });

  const rpc = vi.fn((fnName: string, args?: unknown) => {
    rpcCalls.push({ method: fnName, args: [args] });
    const configured = options.rpcResults?.[fnName];
    let result: TableResult;
    if (Array.isArray(configured)) {
      const callIndex = rpcCallCounts[fnName] ?? 0;
      result = configured[Math.min(callIndex, configured.length - 1)];
    } else {
      result = configured ?? DEFAULT_RESULT;
    }
    rpcCallCounts[fnName] = (rpcCallCounts[fnName] ?? 0) + 1;
    return Promise.resolve(result);
  });

  const getUser = vi.fn().mockResolvedValue({
    data: { user: options.user ?? null },
    error: options.authError ?? null,
  });

  // requireUser() (src/lib/api/auth.ts) verifies the session via
  // getClaims(), not getUser() — mirror that shape here, keying off the same
  // `options.user`/`options.authError` so existing tests don't need to know
  // which method the route handler calls under the hood.
  const getClaims = vi.fn().mockResolvedValue({
    data: options.user ? { claims: { sub: options.user.id } } : null,
    error: options.authError ?? null,
  });

  return { auth: { getUser, getClaims }, from, rpc, builders, rpcCalls };
}

// Fake, minimal Supabase client for route-handler tests. Mimics the slice of
// the chainable query builder our API routes actually use:
//   from(table).upsert(...).select(...).single()/.maybeSingle()
//   from(table).insert(...)
//   from(table).update(...).eq(...).eq(...).select().maybeSingle()
//   from(table).delete().eq(...).eq(...)
//   auth.getUser()
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
  /** Result returned for each `.from(table)` call, keyed by table name. */
  tableResults?: Record<string, TableResult>;
}

export interface FakeSupabaseClient {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
  /** Every builder created per table, in call order, for assertions. */
  builders: Record<string, FakeQueryBuilder[]>;
}

const DEFAULT_RESULT: TableResult = { data: null, error: null };

export function createFakeSupabase(
  options: FakeSupabaseOptions = {},
): FakeSupabaseClient {
  const builders: Record<string, FakeQueryBuilder[]> = {};

  const from = vi.fn((table: string) => {
    const result = options.tableResults?.[table] ?? DEFAULT_RESULT;
    const builder = new FakeQueryBuilder(result);
    (builders[table] ??= []).push(builder);
    return builder;
  });

  const getUser = vi.fn().mockResolvedValue({
    data: { user: options.user ?? null },
    error: options.authError ?? null,
  });

  return { auth: { getUser }, from, builders };
}

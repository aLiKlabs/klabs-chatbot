type ApiError = { message: string } | null;
type ApiResult<T = unknown> = { data: T; error: ApiError; count?: number | null };
type Filter = { op: string; column: string; value: unknown };

const API_URL = process.env.LARAVEL_API_URL ?? "http://127.0.0.1:8000";

export type LaravelAuthUser = {
  id: string;
  email: string;
  role: string;
  full_name?: string | null;
};

export type LaravelClientOptions = {
  token?: string;
  internalKey?: string;
  onToken?: (token: string | null) => void | Promise<void>;
};

export class LaravelClient {
  readonly auth;
  readonly storage;

  constructor(private readonly options: LaravelClientOptions = {}) {
    this.auth = {
      getUser: async (): Promise<{ data: { user: LaravelAuthUser | null }; error: ApiError }> => {
        if (!this.options.token) return { data: { user: null }, error: { message: "Not authenticated" } };
        const result = await this.fetchJson<{ user: LaravelAuthUser }>("/api/v1/auth/me", { method: "GET" }, false);
        return { data: { user: result.data?.user ?? null }, error: result.error };
      },
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const result = await this.fetchJson<{ token: string; user: LaravelAuthUser }>(
          "/api/v1/auth/login",
          { method: "POST", body: JSON.stringify({ email, password }) },
          false,
        );
        if (result.data?.token) await this.options.onToken?.(result.data.token);
        return { data: { user: result.data?.user ?? null }, error: result.error };
      },
      signOut: async () => {
        if (this.options.token) await this.fetchJson("/api/v1/auth/logout", { method: "POST" }, false);
        await this.options.onToken?.(null);
        return { error: null };
      },
    };

    this.storage = {
      from: (_bucket: string) => ({
        download: async (path: string) => {
          const response = await this.fetchRaw(`/storage/download?path=${encodeURIComponent(path)}`, { method: "GET" });
          if (!response.ok) return { data: null, error: { message: await this.message(response) } };
          return { data: await response.blob(), error: null };
        },
        remove: async (paths: string[]) => this.fetchJson("/storage", { method: "DELETE", body: JSON.stringify({ paths }) }),
        upload: async (path: string, file: Blob, filename = "document") => {
          const body = new FormData();
          body.set("path", path); body.set("file", file, filename);
          return this.fetchJson("/storage/upload", {
            method: "POST",
            body,
            signal: AbortSignal.timeout(20_000),
          });
        },
      }),
    };
  }

  from(table: string) {
    return new LaravelQueryBuilder(this, table);
  }

  rpc(name: string, values: Record<string, unknown>): Promise<ApiResult> {
    const routes: Record<string, string> = {
      replace_source_chunks: "/rpc/replace-source-chunks",
      match_document_chunks: "/rpc/match-document-chunks",
    };
    const route = routes[name];
    if (!route) return Promise.resolve({ data: null, error: { message: `Unknown RPC ${name}` } });
    return this.fetchJson(route, { method: "POST", body: JSON.stringify(values) });
  }

  query(payload: Record<string, unknown>): Promise<ApiResult> {
    return this.fetchJson("/data/query", { method: "POST", body: JSON.stringify(payload) });
  }

  private endpoint(path: string) {
    const prefix = this.options.internalKey ? "/api/v1/internal" : "/api/v1";
    return `${API_URL}${prefix}${path}`;
  }

  private headers(body?: BodyInit | null) {
    const headers = new Headers({ Accept: "application/json" });
    if (!(body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (this.options.token) headers.set("Authorization", `Bearer ${this.options.token}`);
    if (this.options.internalKey) headers.set("X-Internal-Key", this.options.internalKey);
    return headers;
  }

  private fetchRaw(path: string, init: RequestInit) {
    return fetch(this.endpoint(path), { ...init, headers: this.headers(init.body), cache: "no-store" });
  }

  private async fetchJson<T = unknown>(path: string, init: RequestInit, scoped = true): Promise<ApiResult<T>> {
    try {
      const url = scoped ? this.endpoint(path) : `${API_URL}${path}`;
      const response = await fetch(url, { ...init, headers: this.headers(init.body), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return { data: null as T, error: { message: payload.message ?? payload.error?.message ?? "Laravel API request failed." } };
      if ("error" in payload || "data" in payload) return payload as ApiResult<T>;
      return { data: payload as T, error: null };
    } catch (error) {
      return { data: null as T, error: { message: error instanceof Error ? error.message : "Laravel API is unavailable." } };
    }
  }

  private async message(response: Response) {
    const payload = await response.json().catch(() => ({}));
    return payload.message ?? "Laravel storage request failed.";
  }
}

// The compatibility builder intentionally preserves dynamic row shapes while the
// dashboard is migrated incrementally from table-specific Supabase inference.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class LaravelQueryBuilder implements PromiseLike<ApiResult<any>> {
  private action = "select";
  private columns = "*";
  private values: unknown;
  private filters: Filter[] = [];
  private orderBy: Array<{ column: string; ascending: boolean }> = [];
  private maxRows?: number;
  private singleMode?: "single" | "maybeSingle";
  private countRows = false;
  private head = false;
  private conflict: string[] = [];

  constructor(private readonly client: LaravelClient, private readonly table: string) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    this.columns = columns; this.countRows = options?.count === "exact"; this.head = options?.head === true;
    return this;
  }
  insert(values: unknown) { this.action = "insert"; this.values = values; return this; }
  update(values: unknown) { this.action = "update"; this.values = values; return this; }
  delete() { this.action = "delete"; return this; }
  upsert(values: unknown, options?: { onConflict?: string }) {
    this.action = "upsert"; this.values = values; this.conflict = options?.onConflict?.split(",").map((value) => value.trim()) ?? [];
    return this;
  }
  eq(column: string, value: unknown) { return this.filter("eq", column, value); }
  neq(column: string, value: unknown) { return this.filter("neq", column, value); }
  gte(column: string, value: unknown) { return this.filter("gte", column, value); }
  lte(column: string, value: unknown) { return this.filter("lte", column, value); }
  gt(column: string, value: unknown) { return this.filter("gt", column, value); }
  lt(column: string, value: unknown) { return this.filter("lt", column, value); }
  in(column: string, value: unknown[]) { return this.filter("in", column, value); }
  is(column: string, value: unknown) { return this.filter("is", column, value); }
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is") throw new Error(`Unsupported filter: not ${operator}`);
    return this.filter("not_is", column, value);
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ column, ascending: options?.ascending !== false }); return this;
  }
  limit(value: number) { this.maxRows = value; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybeSingle"; return this; }
  private filter(op: string, column: string, value: unknown) { this.filters.push({ op, column, value }); return this; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<TResult1 = ApiResult<any>, TResult2 = never>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onfulfilled?: ((value: ApiResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.client.query({
      table: this.table, action: this.action, columns: this.columns, values: this.values,
      filters: this.filters, order: this.orderBy, limit: this.maxRows, single: this.singleMode,
      count: this.countRows, head: this.head, conflict: this.conflict,
    }).then(onfulfilled, onrejected);
  }
}

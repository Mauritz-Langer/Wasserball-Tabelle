import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

@Injectable({
    providedIn: 'root'
})
export class DatabaseService {
    private http = inject(HttpClient);
    private sqlProm: Promise<SqlJsStatic> | null = null;

    // Core archive DB (tables, games, scorers, …) and the lazily-loaded
    // per-game details DB (events, lineups, …) — kept separate so the heavy
    // details file is only downloaded when a user opens a game-details page.
    private db: Database | null = null;
    private detailsDb: Database | null = null;
    private initPromise: Promise<void> | null = null;
    private detailsInitPromise: Promise<void> | null = null;

    // The loaded databases are read-only/immutable, so identical (sql, params)
    // always yields identical rows. Caching them makes repeated navigation and
    // analytics tab/season toggles instant. Bounded to avoid unbounded growth.
    private cache = new Map<string, any[]>();
    private readonly maxCacheEntries = 300;

    /** True while an archive database is being downloaded / initialised. */
    readonly loading = signal<boolean>(false);
    /** Download progress in percent (0–100), or -1 when total size is unknown. */
    readonly progress = signal<number>(0);

    constructor() {
        // Initialize WASM
        this.sqlProm = initSqlJs({
            locateFile: (file: string) => `assets/${file}`
        });
    }

    async ensureDbLoaded(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = this.loadDatabase('assets/data/seasons.db')
            .then(db => { this.db = db; })
            .catch(e => {
                this.initPromise = null; // allow retry
                throw e;
            });
        return this.initPromise;
    }

    async ensureDetailsLoaded(): Promise<void> {
        if (this.detailsDb) return;
        if (this.detailsInitPromise) return this.detailsInitPromise;

        this.detailsInitPromise = this.loadDatabase('assets/data/details.db')
            .then(db => { this.detailsDb = db; })
            .catch(e => {
                this.detailsInitPromise = null; // allow retry
                throw e;
            });
        return this.detailsInitPromise;
    }

    private async loadDatabase(url: string): Promise<Database> {
        this.loading.set(true);
        this.progress.set(0);
        try {
            const SQL = await this.sqlProm!;
            const data = await this.fetchWithProgress(url);
            const db = new SQL.Database(new Uint8Array(data));
            console.log(`Database loaded: ${url}`);
            return db;
        } catch (e) {
            console.error(`Failed to load database ${url}:`, e);
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    private fetchWithProgress(url: string): Promise<ArrayBuffer> {
        return new Promise<ArrayBuffer>((resolve, reject) => {
            this.http.get(url, {
                responseType: 'arraybuffer',
                observe: 'events',
                reportProgress: true
            }).subscribe({
                next: event => {
                    if (event.type === HttpEventType.DownloadProgress) {
                        this.progress.set(
                            event.total ? Math.round((event.loaded / event.total) * 100) : -1
                        );
                    } else if (event.type === HttpEventType.Response) {
                        this.progress.set(100);
                        resolve(event.body as ArrayBuffer);
                    }
                },
                error: reject
            });
        });
    }

    /**
     * Run a parameterised query against the core DB. Results are cached: the
     * returned array is shared and must be treated as read-only by callers.
     */
    async query(sql: string, params: any[] = []): Promise<any[]> {
        await this.ensureDbLoaded();
        return this.runQuery(this.db, 'core', sql, params);
    }

    /** Run a parameterised query against the lazily-loaded details DB. */
    async queryDetails(sql: string, params: any[] = []): Promise<any[]> {
        await this.ensureDetailsLoaded();
        return this.runQuery(this.detailsDb, 'details', sql, params);
    }

    private runQuery(db: Database | null, scope: string, sql: string, params: any[]): any[] {
        if (!db) return [];
        const key = scope + '|' + sql + '|' + JSON.stringify(params);
        const cached = this.cache.get(key);
        if (cached) return cached;

        try {
            const stmt = db.prepare(sql); // prepared statement is safe for params
            stmt.bind(params);

            const results: any[] = [];
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();

            // Simple bounded FIFO cache.
            if (this.cache.size >= this.maxCacheEntries) {
                this.cache.delete(this.cache.keys().next().value as string);
            }
            this.cache.set(key, results);
            return results;
        } catch (e) {
            console.error('DB Query Error:', e);
            return [];
        }
    }

    async getOne(sql: string, params: any[] = []): Promise<any | undefined> {
        const res = await this.query(sql, params);
        return res.length > 0 ? res[0] : undefined;
    }
}

import { Injectable, signal } from '@angular/core';
import type { Database, SqlJsStatic } from 'sql.js';

const ARCHIVE_DIR = 'assets/data/archive';

/** The archive database with everything the statistics need (all seasons). */
export const STATS_DB = 'stats';
/** Leagues, games, tables and scorers of one archive season. */
export const seasonDb = (season: string) => `season-${season}`;
/** Events, lineups and officials of the games of one archive season. */
export const detailsDb = (season: string) => `details-${season}`;
/** Static image file of a team logo (written by scripts/build-archive.js). */
export const logoUrl = (hash: string | null | undefined) => (hash ? `${ARCHIVE_DIR}/logos/${hash}.svg` : '');

/**
 * Read-only access to the archive, which lives in the browser: small SQLite
 * files (one per purpose and season, gzip-compressed) are downloaded on demand
 * and queried in memory with sql.js. Nothing is loaded until a view asks for
 * it, and a file is fetched at most once per session.
 */
@Injectable({
    providedIn: 'root'
})
export class DatabaseService {
    private sqlProm: Promise<SqlJsStatic> | null = null;
    private readonly open = new Map<string, Promise<Database>>();

    // The files are immutable, so identical (file, sql, params) always yields
    // identical rows. Caching them makes repeated navigation and filter toggles
    // instant. Bounded to avoid unbounded growth.
    private cache = new Map<string, any[]>();
    private readonly maxCacheEntries = 300;
    private active = 0;

    /** True while an archive file is being downloaded / opened. */
    readonly loading = signal<boolean>(false);
    /** Download progress in percent (0–100), or -1 when the size is unknown. */
    readonly progress = signal<number>(0);

    /**
     * sql.js (JS + WASM) is only needed for archive seasons and statistics, so
     * it is loaded on first use instead of with the app shell.
     */
    private loadSql(): Promise<SqlJsStatic> {
        this.sqlProm ??= import('sql.js').then(mod => {
            const init = ((mod as any).default ?? mod) as (cfg: object) => Promise<SqlJsStatic>;
            return init({ locateFile: (file: string) => `assets/${file}` });
        });
        return this.sqlProm;
    }

    /** Whether an archive file is already in memory. */
    isLoaded(file: string): boolean {
        return this.open.has(file);
    }

    /** Download and open an archive file (idempotent). */
    ensure(file: string): Promise<Database> {
        let db = this.open.get(file);
        if (!db) {
            db = this.load(file);
            this.open.set(file, db);
            db.catch(() => this.open.delete(file)); // allow retry
        }
        return db;
    }

    private async load(file: string): Promise<Database> {
        this.active++;
        this.loading.set(true);
        this.progress.set(0);
        try {
            const [SQL, bytes] = await Promise.all([
                this.loadSql(),
                this.download(`${ARCHIVE_DIR}/${file}.db.gz`)
            ]);
            return new SQL.Database(await this.inflate(bytes));
        } catch (e) {
            console.error(`Archivdatei ${file} konnte nicht geladen werden:`, e);
            throw e;
        } finally {
            if (--this.active === 0) this.loading.set(false);
        }
    }

    private async download(url: string): Promise<Uint8Array> {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);

        const total = Number(res.headers.get('Content-Length')) || 0;
        if (!res.body) {
            this.progress.set(100);
            return new Uint8Array(await res.arrayBuffer());
        }
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            this.progress.set(total ? Math.min(100, Math.round(received / total * 100)) : -1);
        }
        const bytes = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        this.progress.set(100);
        return bytes;
    }

    /**
     * Unpack a gzip file. Some hosts already decompress `.gz` transparently,
     * so only inflate when the bytes really are gzip (magic 1f 8b).
     */
    private async inflate(bytes: Uint8Array): Promise<Uint8Array> {
        if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('Dieser Browser kann das Archiv nicht entpacken (DecompressionStream fehlt).');
        }
        const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    /**
     * Run a parameterised query against an archive file. Results are cached:
     * the returned array is shared and must be treated as read-only.
     */
    async query<T = any>(file: string, sql: string, params: any[] = []): Promise<T[]> {
        const db = await this.ensure(file);
        const key = file + '|' + sql + '|' + JSON.stringify(params);
        const cached = this.cache.get(key);
        if (cached) return cached;

        const stmt = db.prepare(sql); // prepared statement is safe for params
        try {
            stmt.bind(params);
            const results: any[] = [];
            while (stmt.step()) results.push(stmt.getAsObject());

            // Simple bounded FIFO cache.
            if (this.cache.size >= this.maxCacheEntries) {
                this.cache.delete(this.cache.keys().next().value as string);
            }
            this.cache.set(key, results);
            return results;
        } finally {
            stmt.free();
        }
    }

    async getOne<T = any>(file: string, sql: string, params: any[] = []): Promise<T | undefined> {
        return (await this.query<T>(file, sql, params))[0];
    }
}

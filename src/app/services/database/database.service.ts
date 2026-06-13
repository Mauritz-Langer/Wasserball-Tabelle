import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

@Injectable({
    providedIn: 'root'
})
export class DatabaseService {
    private http = inject(HttpClient);
    private db: Database | null = null;
    private sqlProm: Promise<SqlJsStatic> | null = null;
    private initPromise: Promise<void> | null = null;

    constructor() {
        // Initialize WASM
        this.sqlProm = initSqlJs({
            locateFile: (file: string) => `assets/${file}`
        });
    }

    async ensureDbLoaded(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                const SQL = await this.sqlProm!;

                // Fetch DB file
                const dbData = await firstValueFrom(
                    this.http.get('assets/data/seasons.db', { responseType: 'arraybuffer' })
                );

                this.db = new SQL.Database(new Uint8Array(dbData));
                console.log('Historical Database loaded successfully.');
            } catch (e) {
                console.error('Failed to load historical database:', e);
                throw e;
            }
        })();

        return this.initPromise;
    }

    async query(sql: string, params: any[] = []): Promise<any[]> {
        await this.ensureDbLoaded();
        if (!this.db) return [];

        try {
            // exec returns [{columns, values}]
            // prepare statement is safer for params
            const stmt = this.db.prepare(sql);
            stmt.bind(params);

            const results: any[] = [];
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
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

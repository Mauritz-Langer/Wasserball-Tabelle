declare module 'sql.js' {
    export interface Database {
        run(sql: string, params?: any[]): void;
        exec(sql: string): { columns: string[]; values: any[][] }[];
        prepare(sql: string, params?: any[]): Statement;
        close(): void;
        export(): Uint8Array;
    }

    export interface Statement {
        bind(values: any[]): boolean;
        step(): boolean;
        get(params?: any[]): any[];
        getColumnNames(): string[];
        getAsObject(params?: any[]): any;
        run(params?: any[]): void;
        free(): void;
    }

    export interface SqlJsStatic {
        Database: new (data?: Uint8Array) => Database;
    }

    export interface SqlJsConfig {
        locateFile?: (file: string) => string;
        wasmBinary?: ArrayBuffer;
    }

    export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}

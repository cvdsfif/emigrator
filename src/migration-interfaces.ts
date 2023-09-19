import { CdkCustomResourceEvent, CdkCustomResourceResponse } from "aws-lambda";
import { Migrator } from "./migrator";

export interface Migration {
    order: number;
    description: string;
    query: string;
}

export interface IQueryInterface {
    query(request: string, queryObject?: any): Promise<{ records: any[] }>;
}

export interface MigrationResult {
    successful: boolean,
    numberMigrated?: number
    errorMessage?: string
}

export interface MigrationError {
    migration: Migration;
    errorMessage: string;
}

export interface IMigrator {
    migrate(runner: MigrationRunner): Promise<MigrationResult>;
    migration(migration: Migration): Migrator;
    lastMigration(): number;
}

export interface ICdkMigratorHandler {
    handle(
        migrator: IMigrator,
        runner: MigrationRunner,
        event: CdkCustomResourceEvent
    ): Promise<CdkCustomResourceResponse>;
}

export abstract class MigrationRunner {
    protected db: IQueryInterface;

    constructor(db: IQueryInterface) {
        this.db = db;
    }

    abstract getFirstToMigrate(): Promise<number>;
    abstract run(inc: Migration): Promise<MigrationResult>;
    abstract migrationFailed(error: MigrationError): Promise<void>;
    abstract migrationSuccessful(migration: Migration, duration: number): Promise<void>;
    abstract initialiseMigrationTable(): Promise<void>;
    abstract cleanupFailedMigrationsReports(): Promise<void>;
}

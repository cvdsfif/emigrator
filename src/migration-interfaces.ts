import { CdkCustomResourceEvent, CdkCustomResourceResponse } from "aws-lambda";
import { IQueryInterface } from "pepelaz-db";

export interface Migration {
    order: number;
    description: string;
    query: string;
    version?: number;
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
    migrate(runner: IMigrationRunner): Promise<MigrationResult>;
    migration(migration: Migration): IMigrator;
    lastMigration(): string;
}

export interface ICdkMigratorHandler {
    handle(
        migrator: IMigrator,
        runner: IMigrationRunner,
        event: CdkCustomResourceEvent
    ): Promise<CdkCustomResourceResponse>;
}

export interface IMigrationRunner {
    getFirstToMigrate(): Promise<number>;
    run(inc: Migration): Promise<MigrationResult>;
    migrationFailed(error: MigrationError): Promise<void>;
    migrationSuccessful(migration: Migration, duration: number): Promise<void>;
    initialiseMigrationTable(): Promise<void>;
    cleanupFailedMigrationsReports(): Promise<void>;
}

export abstract class MigrationRunner implements IMigrationRunner {
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

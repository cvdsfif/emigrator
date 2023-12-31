import { IQueryInterface } from "pepelaz-db";
import { Migration, MigrationError, MigrationResult, MigrationRunner } from "./migration-interfaces";

export default class PostgresRunner extends MigrationRunner {
    constructor(db: IQueryInterface, private readonly migrationTableName = "migration_log") {
        super(db);
    }

    get migrationTable() {
        return this.migrationTableName;
    }

    async getFirstToMigrate(): Promise<number> {
        const results = await this.db.query(`
            SELECT MAX(creation_order) AS maxorder FROM ${this.migrationTableName}
        `);
        return parseInt(results.records[0].maxorder ?? 0);
    }

    async run(migration: Migration): Promise<MigrationResult> {
        try {
            await this.db.query(migration.query)
                .catch(err => {
                    throw new Error(
                        `Migration error:${JSON.stringify(err.message, null, 3)},stack:${JSON.stringify(err.stack, null, 3)}`);
                });
            return { successful: true }
        } catch (err: any) {
            return {
                successful: false,
                errorMessage: `message:${JSON.stringify(err.message, null, 3)},stack:${JSON.stringify(err.stack, null, 3)}`
            }
        }
    }

    async migrationFailed(err: MigrationError): Promise<void> {
        await this.db.query(
            `
                INSERT INTO ${this.migrationTableName}(creation_order,description,run_ts,query_executed,successful,message)
                VALUES(:creationOrder,:description,now(),:queryExecuted,FALSE,:message)
            `, {
            creationOrder: err.migration.order,
            description: err.migration.description,
            queryExecuted: err.migration.query,
            message: err.errorMessage
        });
    }

    async migrationSuccessful(migration: Migration, duration: number): Promise<void> {
        await this.db.query(
            `
                INSERT INTO ${this.migrationTableName}(creation_order,description,run_ts,query_executed,successful,message)
                VALUES(:creationOrder,:description,now(),:queryExecuted,TRUE,:message)
            `, {
            creationOrder: migration.order,
            description: migration.description,
            queryExecuted: migration.query,
            message: `Executed in ${duration}ms`
        })
    }

    async initialiseMigrationTable(): Promise<void> {
        await this.db.query(`
            CREATE TABLE IF NOT EXISTS ${this.migrationTableName}(
                creation_order bigint primary key,
                description varchar(255),
                run_ts timestamptz not null,
                query_executed text not null,
                successful boolean not null,
                message text
            )
        `);
    }
    async cleanupFailedMigrationsReports(): Promise<void> {
        await this.db.query(`DELETE FROM ${this.migrationTableName} WHERE NOT successful`);
    }

}
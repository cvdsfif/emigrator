import { IQueryInterface } from "pepelaz-db";
import { CdkMigratorHandler } from "./cdk-migrator-handler";
import { ICdkMigratorHandler, IMigrationRunner, IMigrator } from "./migration-interfaces";
import { Migrator } from "./migrator";
import PostgresRunner from "./postgres-runner";

export const createEmigrator = (): IMigrator => {
    return new Migrator();
}

export const createPostgresRunner = (db: IQueryInterface): IMigrationRunner => {
    return new PostgresRunner(db);
}

export const createMigratorHandler = (): ICdkMigratorHandler => {
    return new CdkMigratorHandler();
}

export { IMigrator } from "./migration-interfaces";
export { IMigrationRunner, MigrationResult, Migration, MigrationError, ICdkMigratorHandler } from "./migration-interfaces";
export { listDatabaseChanges } from "./list-database-changes";
export { databaseChange, DatabaseChangeRecord } from "./database-change";
export {
    MultistackProps, migratedDatabaseDefaultProps,
    IMigratedDatabaseProps, MigratedDatabase, ILambdaProps, defaultLambdaProps,
    ApiLambdaProps, IApiProps
} from "./migrated-database-construct";


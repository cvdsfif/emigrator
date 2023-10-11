import { CdkMigratorHandler } from "./cdk-migrator-handler";
import { ICdkMigratorHandler, IMigrationRunner, IMigrator, IQueryInterface } from "./migration-interfaces";
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

export { IMigrator, IQueryInterface } from "./migration-interfaces";
export { IMigrationRunner, MigrationResult, Migration, MigrationError, ICdkMigratorHandler } from "./migration-interfaces";
export { listDatabaseChanges } from "./list-database-changes";
export {
    typedFacade, ITypedFacade
} from "./typed-facade";
export { databaseChange, DatabaseChangeRecord } from "./database-change";
export {
    db, MultistackProps, migratedDatabaseDefaultProps,
    IMigratedDatabaseProps, MigratedDatabase, ILambdaProps, defaultLambdaProps
} from "./migrated-database-construct";
export { setConnectionTimeouts, ReportedEvent, HandlerProps, interfaceHandler } from "./lambda-utils";
export * from "../pepelaz";
import { IMigrationRunner, IMigrator, IQueryInterface } from "./migration-interfaces";
import { Migrator } from "./migrator";
import PostgresRunner from "./postgres-runner";

export const createEmigrator = (): IMigrator => {
    return new Migrator();
}

export const createPostgresRunner = (db: IQueryInterface): IMigrationRunner => {
    return new PostgresRunner(db);
}

export { IMigrator, IQueryInterface };
export { IMigrationRunner, MigrationResult, Migration, MigrationError } from "./migration-interfaces";
export { getConnectedPostgresInterface, IConnectedTestInterface } from "./postgres-test-interface";
export { listDatabaseChanges } from "./list-database-changes";
export {
    typedFacade, ITypedFacade, DbRecord, FieldType, DataField, NotNull,
    booleanField, dateField, integerField, notNull, stringField, bigIntField
} from "./typed-facade";
export { DatabaseChange, DatabaseChangeRecord } from "./database-change";
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

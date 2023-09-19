import { IMigrator, IQueryInterface } from "./migration-interfaces";
import { Migrator } from "./migrator";
import PostgresRunner from "./postgres-runner";

export const createEmigrator = (): IMigrator => {
    return new Migrator();
}

export const createPostgresRunner = (db: IQueryInterface) => {
    return new PostgresRunner(db);
}

export { IMigrator, IQueryInterface }

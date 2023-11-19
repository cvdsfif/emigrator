import { ITypedFacade } from "pepelaz-db";
import { databaseChange } from "./database-change";
import PostgresRunner from "./postgres-runner";

export async function listDatabaseChanges(db: ITypedFacade) {
    const queryResult = await db.typedQuery(databaseChange, `
        SELECT creation_order,description,run_ts,query_executed,successful,message
        FROM ${PostgresRunner.MIGRATION_TABLE}
        ORDER BY run_ts DESC
    `);
    return queryResult?.records;
}
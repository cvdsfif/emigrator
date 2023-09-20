import { DatabaseChange as DatabaseChange, DatabaseChangeRecord } from "./database-change";
import PostgresRunner from "./postgres-runner";
import { ITypedFacade } from "./typed-facade";

export async function listDatabaseChanges(db: ITypedFacade): Promise<DatabaseChangeRecord[]> {
    const queryResult = await db.typedQuery<DatabaseChange>(DatabaseChange, `
        SELECT creation_order,description,run_ts,query_executed,successful,message
        FROM ${PostgresRunner.MIGRATION_TABLE}
        ORDER BY run_ts DESC
    `);
    return queryResult?.records;
}
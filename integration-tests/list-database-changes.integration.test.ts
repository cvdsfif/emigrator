import { typedFacade } from "pepelaz-db";
import { IMigrationRunner, createEmigrator, createPostgresRunner } from "../src";
import { listDatabaseChanges } from "../src/list-database-changes";
import PostgresRunner from "../src/postgres-runner";
import { IConnectedTestInterface, getConnectedPostgresInterface } from "../src/postgres-test-interface";

describe("Testing integrity of the test runner", () => {
    jest.setTimeout(60000);

    let connectedInterface: IConnectedTestInterface;
    const TEST_TABLE = "test_table";

    beforeAll(async () => connectedInterface = await getConnectedPostgresInterface());

    afterAll(async () => await connectedInterface.disconnect());

    beforeEach(async () => {
        const runner: IMigrationRunner = createPostgresRunner(connectedInterface);
        await runner.initialiseMigrationTable();
        await createEmigrator()
            .migration({
                order: 1,
                query: `CREATE TABLE ${TEST_TABLE}(message TEXT)`,
                description: "Test table created"
            })
            .migrate(runner);
    });

    // Rollback is actually not implemented, so we do manual cleanup
    afterEach(async () => {
        await connectedInterface.query(`DROP TABLE IF EXISTS ${PostgresRunner.MIGRATION_TABLE}`);
        await connectedInterface.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
    });

    test("Should correctly get the migrated objects' list", async () => {
        const newLocal = await listDatabaseChanges(typedFacade(connectedInterface));
        expect(newLocal[0])
            .toEqual(expect.objectContaining({ creationOrder: 1 }))
    })
});
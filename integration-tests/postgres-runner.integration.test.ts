import { createEmigrator, createPostgresRunner } from "../src";
import { IMigrationRunner } from "../src/migration-interfaces";
import { getConnectedPostgresInterface, IConnectedTestInterface } from "../src/postgres-test-interface";

describe("Testing migration on a real PostgreSQL database instance", () => {
    jest.setTimeout(90000);

    let connectedInterface: IConnectedTestInterface;
    let runner: IMigrationRunner;

    const TEST_TABLE = "test_table";

    beforeAll(async () => connectedInterface = await getConnectedPostgresInterface());

    afterAll(async () => await connectedInterface.disconnect());

    beforeEach(async () => {
        runner = createPostgresRunner(connectedInterface, "runner_test_log");
        await runner.initialiseMigrationTable();
    });

    // Rollback is actually not implemented, so we do manual cleanup
    afterEach(async () => {
        await connectedInterface.query(`DROP TABLE IF EXISTS ${runner.migrationTable}`);
        await connectedInterface.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
    });

    test("Migration table should exist", async () => await connectedInterface.expectTableExists(runner.migrationTable));

    test("Successful migration should pass, it should be reported and the table should be visible, non-existent tables should not show", async () => {
        await createEmigrator()
            .migration({
                order: 1,
                query: `CREATE TABLE ${TEST_TABLE}(message TEXT)`,
                description: "Test table created"
            })
            .migrate(runner);
        expect(
            (await connectedInterface.query(
                `SELECT * FROM ${runner.migrationTable} WHERE creation_order=1`)).records[0]
        ).toStrictEqual(expect.objectContaining({ successful: true }));
        connectedInterface.expectTableExists(TEST_TABLE);
        connectedInterface.expectTableExists("wrong_table", false);
    });

    test("Failed migration should correctly report failure and stop execution", async () => {
        await createEmigrator()
            .migration({
                order: 1,
                query: `Bullshit that Postgres doesn't understand`,
                description: "Test table created"
            })
            .migration({
                order: 2,
                query: `SELECT 1`,
                description: "Successful placeholder"
            })
            .migrate(runner);
        expect(
            (await connectedInterface.query(
                `SELECT * FROM ${runner.migrationTable} WHERE creation_order=1`)).records[0]
        ).toStrictEqual(expect.objectContaining({ successful: false }));
        expect(
            (await connectedInterface.query(
                `SELECT * FROM ${runner.migrationTable} WHERE creation_order=2`)).records.length
        ).toBe(0);
    });

    test("Consecutive migrations should pass, only needed migrations should be executed", async () => {
        await createEmigrator()
            .migration({
                order: 1,
                query: `CREATE TABLE ${TEST_TABLE}(message TEXT)`,
                description: "Test table created"
            })
            .migrate(runner);
        expect((await createEmigrator()
            .migration({
                order: 1,
                query: `CREATE TABLE ${TEST_TABLE}(message TEXT)`,
                description: "Test table created"
            }).migration({
                order: 2,
                query: `SELECT 1`,
                description: "Empty migration"
            })
            .migrate(runner)).numberMigrated).toBe(1);
    });
});
import { createEmigrator, createPostgresRunner } from "../src";
import { IMigrator, MigrationRunner } from "../src/migration-interfaces";
import PostgresRunner from "../src/postgres-runner";
import PostgresTestInterface from "../src/postgres-test-interface";

describe("Testing migration on a real PostgreSQL database instance", () => {
    jest.setTimeout(60000);

    let connectedInterface: PostgresTestInterface;
    let runner: MigrationRunner;

    const TEST_TABLE = "test_table";

    beforeAll(async () => connectedInterface = await PostgresTestInterface.getConnectedInstance());

    afterAll(async () => await connectedInterface.disconnect());

    beforeEach(async () => {
        runner = createPostgresRunner(connectedInterface);
        await runner.initialiseMigrationTable();
    });

    // Rollback is actually not implemented, so we do manual cleanup
    afterEach(async () => {
        await connectedInterface.query(`DROP TABLE IF EXISTS ${PostgresRunner.MIGRATION_TABLE}`);
        await connectedInterface.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
    });

    test("Migration table should exist", async () => await connectedInterface.expectTableExists(PostgresRunner.MIGRATION_TABLE));

    test("Empty migration should pass", async () => await createEmigrator().migrate(runner));

    test("Successful migration should pass, it should be reported and the table should be visible", async () => {
        await createEmigrator()
            .migration({
                order: 1,
                query: `CREATE TABLE ${TEST_TABLE}(message TEXT)`,
                description: "Test table created"
            })
            .migrate(runner);
        expect(
            (await connectedInterface.query(
                `SELECT * FROM ${PostgresRunner.MIGRATION_TABLE} WHERE creation_order=1`)).records[0]
        ).toStrictEqual(expect.objectContaining({ successful: true }));
        connectedInterface.expectTableExists(TEST_TABLE);
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
                `SELECT * FROM ${PostgresRunner.MIGRATION_TABLE} WHERE creation_order=1`)).records[0]
        ).toStrictEqual(expect.objectContaining({ successful: false }));
        expect(
            (await connectedInterface.query(
                `SELECT * FROM ${PostgresRunner.MIGRATION_TABLE} WHERE creation_order=2`)).records.length
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
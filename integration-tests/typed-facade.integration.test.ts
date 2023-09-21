import { DbRecord, IConnectedTestInterface, IMigrationRunner, ITypedFacade, bigIntField, createEmigrator, createPostgresRunner, getConnectedPostgresInterface, stringField, typedFacade } from "../src";
import PostgresRunner from "../src/postgres-runner";

describe("Testing database-related features of typed facade", () => {
    jest.setTimeout(60000);

    let connectedInterface: IConnectedTestInterface;
    let facade: ITypedFacade;

    const TEST_TABLE = "test_table";

    beforeAll(async () => {
        connectedInterface = await getConnectedPostgresInterface();
        facade = typedFacade(connectedInterface);
    });

    afterAll(async () => await connectedInterface.disconnect());

    beforeEach(async () => {
        const runner: IMigrationRunner = createPostgresRunner(connectedInterface);
        await runner.initialiseMigrationTable();
        await createEmigrator()
            .migration({
                order: 1,
                query: `CREATE TABLE ${TEST_TABLE}(id BIGINT, some_value VARCHAR)`,
                description: "Test table created"
            })
            .migrate(runner);
    });

    // Rollback is actually not implemented, so we do manual cleanup
    afterEach(async () => {
        await connectedInterface.query(`DROP TABLE IF EXISTS ${PostgresRunner.MIGRATION_TABLE}`);
        await connectedInterface.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
    });

    test("Should correctly proceed to multiple inserts", async () => {
        class Input {
            id = bigIntField();
            someValue = stringField
        };
        const records = [
            { id: 1, someValue: "txt" },
            { id: 2, someValue: "pwd" }
        ];
        await facade.multiInsert(TEST_TABLE, records);
        const results = await facade.typedQuery<Input>(Input, `SELECT id,some_value from ${TEST_TABLE}`);
        expect(results.records[0].id).toEqual(1n);
        expect(results.records[1].id).toEqual(2n);
        expect(results.records[0].someValue).toEqual("txt");
        expect(results.records[1].someValue).toEqual("pwd");
    })
})
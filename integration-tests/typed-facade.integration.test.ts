import { DbRecord, IConnectedTestInterface, IMigrationRunner, ITypedFacade, bigIntField, createEmigrator, createPostgresRunner, dateField, getConnectedPostgresInterface, integerField, notNull, stringField, typedFacade } from "../src";
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
                query: `CREATE TABLE ${TEST_TABLE}
                    (id BIGINT, some_value VARCHAR, num_field Numeric(16,2), int_field Numeric(16,2), date_field TIMESTAMPTZ)`,
                description: "Test table created"
            })
            .migrate(runner);
    });

    class Input {
        id = bigIntField(notNull);
        someValue = stringField();
        numField = bigIntField();
        intField = integerField();
        dateField = dateField();
    };

    // Rollback is actually not implemented, so we do manual cleanup
    afterEach(async () => {
        await connectedInterface.query(`DROP TABLE IF EXISTS ${PostgresRunner.MIGRATION_TABLE}`);
        await connectedInterface.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
    });

    test("Should correctly proceed to multiple inserts", async () => {
        const records = [
            { id: 1, someValue: "txt" },
            { id: 2, someValue: "pwd" }
        ];
        await facade.multiInsert(TEST_TABLE, records);
        const results = await facade.typedQuery(Input, `SELECT id,some_value from ${TEST_TABLE}`);
        expect(results.records[0].id).toEqual(1n);
        expect(results.records[1].id).toEqual(2n);
        expect(results.records[0].someValue).toEqual("txt");
        expect(results.records[1].someValue).toEqual("pwd");
    });

    test("Should correctly insert and retake bigints", async () => {
        const hugeValue = 1000000000000000n;
        const stopizot = 100500;
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot }];
        await facade.multiInsert(TEST_TABLE, record);
        const results = (await facade.typedQuery(Input, `SELECT id,num_field from ${TEST_TABLE}`)).records;
        expect(results[0].id).toEqual(hugeValue);
        expect(results[0].numField).toEqual(BigInt(stopizot));
    });

    test("Should correctly insert and retake integers", async () => {
        const hugeValue = 1000000000000000n;
        const stopizot = 100500;
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot }];
        await facade.multiInsert(TEST_TABLE, record);
        const results = (await facade.typedQuery(Input, `SELECT id,num_field from ${TEST_TABLE}`)).records;
        expect(results[0].id).toEqual(hugeValue);
        expect(results[0].numField).toEqual(BigInt(stopizot));
    });

    test("Should correctly store bigints in integer fields", async () => {
        const hugeValue = 1000000000000000n;
        const ifi = 500;
        const record = [{ id: hugeValue, someValue: "gig", intField: ifi }];
        await facade.multiInsert(TEST_TABLE, record);
        const results = (await facade.typedQuery(Input, `SELECT id,int_field from ${TEST_TABLE}`)).records;
        expect(results[0].intField).toEqual(ifi);
    });

    test("Should correctly treat null values", async () => {
        const hugeValue = 1000000000000000n;
        const record = [{ id: hugeValue, someValue: "gig" }];
        await facade.multiInsert(TEST_TABLE, record);
        const results = (await facade.typedQuery(Input, `SELECT id,int_field from ${TEST_TABLE}`)).records;
        expect(results[0].intField).toBeNull();
    });

    test("Select should execute a sane query", async () => {
        const hugeValue = 1000000000000000n;
        const stopizot = 100500;
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot }];
        await facade.multiInsert(TEST_TABLE, record);
        const results = (await facade.select(Input, TEST_TABLE));
        expect(results[0].id).toEqual(hugeValue);
        expect(results[0].numField).toEqual(BigInt(stopizot));
    });

    test("Should correctly accept time fields", async () => {
        const hugeValue = 1000000000000000n;
        const stopizot = 100500;
        const datushka = "1990-03-11T04:20:35Z";
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot, dateField: datushka }];
        await facade.multiInsert(TEST_TABLE, record);
        const results = (await facade.select(Input, TEST_TABLE));
        expect(results[0].dateField).toEqual(new Date(datushka));
    });
})
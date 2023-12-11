import { IMigrationRunner, createEmigrator, createPostgresRunner } from "../src";
import { bigIntField, booleanField, dateField, fieldObject, integerField, notNull, stringField } from "pepelaz";
import PostgresRunner from "../src/postgres-runner";
import { IConnectedTestInterface, getConnectedPostgresInterface } from "../src/postgres-test-interface";
import { ITypedFacade, typedFacade } from "pepelaz-db";

describe("Testing database-related features of typed facade", () => {
    jest.setTimeout(90000);

    let connectedInterface: IConnectedTestInterface;
    let facade: ITypedFacade;

    const TEST_TABLE = "test_table";

    beforeAll(async () => {
        connectedInterface = await getConnectedPostgresInterface();
        facade = typedFacade(connectedInterface);
    });

    afterAll(async () => await connectedInterface.disconnect());

    let runner: IMigrationRunner;

    beforeEach(async () => {
        runner = createPostgresRunner(connectedInterface, "test_migration_log");
        await runner.initialiseMigrationTable();
        await createEmigrator()
            .migration({
                order: 1,
                query: `CREATE TABLE IF NOT EXISTS ${TEST_TABLE}
                    (id BIGINT PRIMARY KEY, some_value VARCHAR, num_field Numeric(16,2), 
                    int_field Numeric(16,2), date_field TIMESTAMPTZ, is_cool BOOLEAN DEFAULT TRUE)`,
                description: "Test table created"
            })
            .migrate(runner);
    });

    const input = fieldObject({
        id: bigIntField(notNull),
        someValue: stringField(),
        numField: bigIntField(),
        intField: integerField(),
        dateField: dateField(),
        isCool: booleanField(),
    });

    // Rollback is actually not implemented, so we do manual cleanup
    afterEach(async () => {
        await connectedInterface.query(`DROP TABLE IF EXISTS ${runner.migrationTable}`);
        await connectedInterface.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
    });

    test("Should correctly proceed to multiple inserts", async () => {
        const records = [
            { id: 1n, someValue: "txt" },
            { id: 2n, someValue: "pwd" }
        ];
        await facade.multiInsert(input, TEST_TABLE, records);
        const results = await facade.typedQuery(input, `SELECT id,some_value from ${TEST_TABLE}`);
        expect(results.records[0].id).toEqual(1n);
        expect(results.records[1].id).toEqual(2n);
        expect(results.records[0].someValue).toEqual("txt");
        expect(results.records[1].someValue).toEqual("pwd");
    });

    test("Should correctly proceed to multiple upserts", async () => {
        const records = [
            { id: 1n, someValue: "txt" },
            { id: 2n, someValue: "pwd" }
        ];
        const records2 = [
            { id: 1n, someValue: "txt2" },
            { id: 2n, someValue: "pwd2" }
        ];
        await facade.multiUpsert(input, TEST_TABLE, records, { upsertFields: ["id"] });
        await new Promise(res => setTimeout(res, 500));
        await facade.multiUpsert(input, TEST_TABLE, records2, { upsertFields: ["id"] });
        const results = await facade.typedQuery(input, `SELECT id,some_value from ${TEST_TABLE}`);
        expect(results.records[0].id).toEqual(1n);
        expect(results.records[1].id).toEqual(2n);
        expect(results.records[0].someValue).toEqual("txt2");
        expect(results.records[1].someValue).toEqual("pwd2");
    });

    test("Should correctly proceed to multiple upserts with nulls ignored", async () => {
        const records = [
            { id: 1n, someValue: "txt" },
            { id: 2n, someValue: null }
        ];
        const records2 = [
            { id: 1n, someValue: "txt2" },
            { id: 2n, someValue: "pwd2" }
        ];
        await facade.multiUpsert(input, TEST_TABLE, records, { upsertFields: ["id"], onlyReplaceNulls: true });
        await new Promise(res => setTimeout(res, 500));
        await facade.multiUpsert(input, TEST_TABLE, records2, { upsertFields: ["id"], onlyReplaceNulls: true });
        const results = await facade.typedQuery(input, `SELECT id,some_value from ${TEST_TABLE}`);
        expect(results.records[0].id).toEqual(1n);
        expect(results.records[1].id).toEqual(2n);
        expect(results.records[0].someValue).toEqual("txt");
        expect(results.records[1].someValue).toEqual("pwd2");
    });

    test("Should correctly insert and retake bigints", async () => {
        const hugeValue = 1000000000000001n;
        const stopizot = 100500n;
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot }];
        await facade.multiInsert(input, TEST_TABLE, record);
        const results = (await facade.typedQuery(input, `SELECT id,num_field from ${TEST_TABLE}`)).records;
        expect(results[0].id).toEqual(hugeValue);
        expect(results[0].numField).toEqual(BigInt(stopizot));
    });

    test("Should correctly insert and retake integers", async () => {
        const hugeValue = 1000000000000000n;
        const stopizot = 100500n;
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot }];
        await facade.multiInsert(input, TEST_TABLE, record);
        const results = (await facade.typedQuery(input, `SELECT id,num_field from ${TEST_TABLE}`)).records;
        expect(results[0].id).toEqual(hugeValue);
        expect(results[0].numField).toEqual(BigInt(stopizot));
    });

    test("Should correctly store bigints in integer fields", async () => {
        const hugeValue = 1000000000000001n;
        const ifi = 500;
        const record = [{ id: hugeValue, someValue: "gig", intField: ifi }];
        await facade.multiInsert(input, TEST_TABLE, record);
        const results = (await facade.typedQuery(input, `SELECT id,int_field from ${TEST_TABLE}`)).records;
        expect(results[0].intField).toEqual(ifi);
    });

    test("Should correctly treat null values", async () => {
        const hugeValue = 1000000000000000n;
        const record = [{ id: hugeValue, someValue: "gig" }];
        await facade.multiInsert(input, TEST_TABLE, record);
        const results = (await facade.typedQuery(input, `SELECT id,int_field from ${TEST_TABLE}`)).records;
        expect(results[0].intField).toBeNull();
    });

    test("Select should execute a sane query", async () => {
        const hugeValue = 1000000000000001n;
        const stopizot = 100500n;
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot }];
        await facade.multiInsert(input, TEST_TABLE, record);
        const results = (await facade.select(input, TEST_TABLE));
        expect(results[0].id).toEqual(hugeValue);
        expect(results[0].numField).toEqual(BigInt(stopizot));
    });

    test("Should correctly accept date fields", async () => {
        const hugeValue = 1000000000000001n;
        const stopizot = 100500n;
        const datushka = new Date("1990-03-11T04:20:35Z");
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot, dateField: datushka }];
        await facade.multiInsert(input, TEST_TABLE, record);
        const results = (await facade.select(input, TEST_TABLE));
        expect(results[0].dateField).toEqual(new Date(datushka));
    });

    test("Should correctly false booleans when default is true", async () => {
        const hugeValue = 1000000000000001n;
        const stopizot = 100500n;
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot, isCool: false }];
        await facade.multiInsert(input, TEST_TABLE, record);
        const results = (await facade.select(input, TEST_TABLE));
        expect(results[0].isCool).toBeFalsy();
    });

    test("Should correctly accept date fields with current server date value", async () => {
        const hugeValue = 1000000000000001n;
        const stopizot = 100500n;
        const datushka = new Date(0);
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot, dateField: datushka }];
        await facade.multiInsert(input, TEST_TABLE, record);
        const results = (await facade.query(`SELECT id FROM ${TEST_TABLE} WHERE date_field BETWEEN now() - INTERVAL '1 minute' AND now()`));
        expect(results.records[0].id).toEqual(hugeValue.toString());
    });

    test("Should accept null date fields with current server date value", async () => {
        const hugeValue = 1000000000000001n;
        const stopizot = 100500n;
        const datushka = null;
        const record = [{ id: hugeValue, someValue: "gig", numField: stopizot, dateField: datushka }];
        await facade.multiInsert(input, TEST_TABLE, record);
        const results = (await facade.query(`SELECT id FROM ${TEST_TABLE} WHERE date_field IS NULL`));
        expect(results.records[0].id).toEqual(hugeValue.toString());
    });
})
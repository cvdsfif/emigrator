import { DatabaseError } from "pg";
import { DatabaseChange, IQueryInterface } from "../src";
import { DbRecord, bigIntField, booleanField, dateField, floatField, integerField, notNull, stringField, typedFacade } from "../src/typed-facade";
import { extendExpectWithContainString } from "./expect-string-containing";

describe("Testing typed query fadace conversions", () => {
    class QueryInterfaceMock implements IQueryInterface { query = jest.fn(); }

    let dbMock: QueryInterfaceMock;

    beforeEach(() => dbMock = new QueryInterfaceMock());

    extendExpectWithContainString();

    class DatabaseChangeInput {
        creationOrder = integerField(5);
        intNotNull = integerField(notNull);
        nullableInt = integerField();
        somethingFloat = floatField();
        somethingBig = bigIntField(notNull);
        nullableBig = bigIntField();
        ecriture = stringField();
        unJour = dateField();
        veritas = booleanField();
        incorrect = 42;
        moreIncorrect = 43;
        calculated = integerField(() => 2 * 2);
        explicitlyNullableInt = integerField(null);
        stringWithDefault = stringField("");
        calculatedNullableDefault = stringField(() => null);
        calculatedNotNullableDefault = stringField(() => notNull);
        falsishBool = booleanField();
        nullishBool = booleanField();
    }

    type DatabaseChangeRecord = DbRecord<DatabaseChangeInput>;

    test("Types should be converted correctly", async () => {
        dbMock.query.mockReturnValue(Promise
            .resolve(
                {
                    records: [{
                        intNotNull: "0",
                        creationorder: "1",
                        somethingfloat: "3.456",
                        something_big: "12345678901234567890",
                        ecriture: "451",
                        un_jour: "1990-03-11",
                        veritas: true,
                        calculatedNotNullableDefault: "str"
                    }]
                }
            ));
        const record: DatabaseChangeRecord =
            (await typedFacade(dbMock).typedQuery(DatabaseChangeInput, "")).records[0];
        expect(record.creationOrder).toEqual(1);
        expect(record.somethingFloat).toEqual(3.456);
        expect(record.somethingBig).toEqual(BigInt("12345678901234567890"));
        expect(record.ecriture).toEqual("451");
        expect(record.unJour).toEqual(new Date("1990-03-11"));
        expect(record.veritas).toBeTruthy();
    });

    test("Fields should take default values if omitted", async () => {
        dbMock.query.mockReturnValue(Promise
            .resolve(
                {
                    records: [{
                        intNotNull: "0",
                        somethingfloat: "3.456",
                        something_big: "12345678901234567890",
                        ecriture: "451",
                        un_jour: "1990-03-11",
                        calculatedNotNullableDefault: "str"
                    }]
                }
            ));
        const record: DatabaseChangeRecord =
            (await typedFacade(dbMock).typedQuery(DatabaseChangeInput, "")).records[0];
        expect(record.creationOrder).toEqual(5);
    });

    test("Dummy values fields should be accepted, both default and valued", async () => {
        dbMock.query.mockReturnValue(Promise
            .resolve(
                {
                    records: [{
                        intNotNull: "0",
                        somethingfloat: "3.456",
                        something_big: "12345678901234567890",
                        ecriture: "451",
                        un_jour: "1990-03-11",
                        moreIncorrect: 51,
                        calculatedNotNullableDefault: "str"
                    }]
                }
            ));
        const record: DatabaseChangeRecord =
            (await typedFacade(dbMock).typedQuery(DatabaseChangeInput, "")).records[0];
        expect(record.incorrect).toEqual(42);
        expect(record.moreIncorrect).toEqual(51);
    });

    test("Should throw exception if a mandatory field is omitted", async () => {
        dbMock.query.mockReturnValue(Promise
            .resolve(
                {
                    records: [{
                        intNotNull: "0",
                        somethingfloat: "3.456",
                        ecriture: "451",
                        un_jour: "1990-03-11",
                        calculatedNotNullableDefault: "str"
                    }]
                }
            ));
        try {
            await typedFacade(dbMock).typedQuery(DatabaseChangeInput, "");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }
    });

    test("Should accept functions as default initializers", async () => {
        dbMock.query.mockReturnValue(Promise
            .resolve(
                {
                    records: [{
                        intNotNull: "0",
                        somethingfloat: "3.456",
                        something_big: "12345678901234567890",
                        ecriture: "451",
                        un_jour: "1990-03-11",
                        moreIncorrect: 51,
                        calculatedNotNullableDefault: "str"
                    }]
                }
            ));
        const record: DatabaseChangeRecord =
            (await typedFacade(dbMock).typedQuery(DatabaseChangeInput, "")).records[0];
        expect(record.calculated).toEqual(4);
    });

    test("Boolean field should make difference between false and null", async () => {
        dbMock.query.mockReturnValue(Promise
            .resolve(
                {
                    records: [{
                        intNotNull: 0,
                        somethingfloat: "3.456",
                        something_big: "12345678901234567890",
                        ecriture: "451",
                        un_jour: "1990-03-11",
                        moreIncorrect: 51,
                        falsishBool: false,
                        nullishBool: null,
                        calculatedNotNullableDefault: "str"
                    }]
                }
            ));
        const record: DatabaseChangeRecord =
            (await typedFacade(dbMock).typedQuery(DatabaseChangeInput, "")).records[0];
        expect(record.nullishBool).toBeNull();
        expect(record.falsishBool).toBe(false);
    });

    test("Should translate query with two insert values", async () => {
        class DbEntries {
            id = integerField();
            someValue = stringField();
        }
        const records = [
            { id: 1, someValue: "txt" },
            { id: 2, someValue: "pwd" }
        ];
        const TABLE_NAME = "test_tab";
        await typedFacade(dbMock).multiInsert(DbEntries, TABLE_NAME, records);
        expect(dbMock.query).toBeCalledWith(
            `INSERT INTO ${TABLE_NAME}(id,some_value) VALUES(:id_0,:someValue_0),(:id_1,:someValue_1)`,
            { id_0: 1, someValue_0: "txt", id_1: 2, someValue_1: "pwd" }
        )
    });

    test("Should never call subsequent queries if the arguments list is empty", async () => {
        class EmptyEntries { }
        const records: any[] = [];
        const TABLE_NAME = "test_tab";
        await typedFacade(dbMock).multiInsert(EmptyEntries, TABLE_NAME, records);
        expect(dbMock.query).not.toBeCalled();
    })

    test("Nullable input values should produce nullable fields in the target interface", () => {
        class TestInput {
            id = integerField();
            str = stringField(notNull);
        };
        type TestClass = DbRecord<TestInput>;
        const val: TestClass = { str: "15" };
        expect(val.id).toBeUndefined();
    });

    test("Select all with fields autofill should pass", async () => {
        const intValue = 5;
        const floatValue = 5.5;
        const bigIntValue = 100n;
        const stringValue = "str";
        const dateValue = new Date("1974-03-02");
        const input: DatabaseChangeRecord = {
            creationOrder: intValue,
            nullableInt: 0,
            somethingFloat: floatValue,
            somethingBig: bigIntValue,
            nullableBig: 0n,
            ecriture: stringValue,
            unJour: dateValue,
            intNotNull: 0,
            calculatedNotNullableDefault: "str",
            veritas: true
        };
        dbMock.query.mockReturnValue({ records: [input] });
        const retval = (await typedFacade(dbMock).select(DatabaseChangeInput, "storage_table WHERE int_value > 0", {}))[0];
        expect(dbMock.query).toBeCalledWith(
            "SELECT creation_order,int_not_null,nullable_int,something_float,something_big,nullable_big,ecriture,un_jour,veritas,incorrect,more_incorrect,calculated,explicitly_nullable_int,string_with_default,calculated_nullable_default,calculated_not_nullable_default,falsish_bool,nullish_bool FROM storage_table WHERE int_value > 0",
            {});
        expect(retval.creationOrder).toEqual(intValue);
    });

    test("Error in multiinsert should throw an informative error", async () => {
        class DbEntries {
            id = integerField();
            someValue = stringField();
        }
        const records = [
            { id: 1, someValue: "txt" },
            { id: 2, someValue: "pwd" }
        ];
        const TABLE_NAME = "test_tab";
        dbMock.query.mockImplementation(() => { throw new Error("Gluks"); });
        try {
            await typedFacade(dbMock).multiInsert(DbEntries, TABLE_NAME, records);
            fail("Should never get here");
        } catch (err) {
            expect(err).toContainString("insert query");
        }
    });

    test("Date insert should convert string input values to date", async () => {
        class DbEntries {
            dateField = dateField();
        }
        const records = [{}];
        // We force a wrongly typed value for the field
        // This happens for example with some wrong conversions coming from GraphQL APIs
        const dateString = "1990-03-11T12:00:00Z";
        (records as any)[0]["dateField"] = dateString;
        await typedFacade(dbMock).multiInsert(DbEntries, "table_name", records);
        expect(dbMock.query).toBeCalledWith(expect.anything(), { dateField_0: new Date(dateString) });
    });

    test("Should correctly insert false to nullable boolean fields", async () => {
        class DbEntries {
            bulk = booleanField();
        }
        const records = [
            { bulk: false },
        ];
        const TABLE_NAME = "test_tab";
        await typedFacade(dbMock).multiInsert(DbEntries, TABLE_NAME, records);
        expect(dbMock.query).toBeCalledWith(
            `INSERT INTO ${TABLE_NAME}(bulk) VALUES(:bulk_0)`,
            { bulk_0: false }
        )
    });
})
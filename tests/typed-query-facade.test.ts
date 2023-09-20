import { IQueryInterface } from "../src";
import { DbRecord, bigIntField, booleanField, dateField, floatField, integerField, notNull, stringField, typedFacade } from "../src/typed-facade";

describe("Testing typed query fadace conversions", () => {
    class QueryInterfaceMock implements IQueryInterface { query = jest.fn(); }

    let dbMock: QueryInterfaceMock;

    beforeEach(() => dbMock = new QueryInterfaceMock());

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
})
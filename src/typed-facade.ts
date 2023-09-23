import { IQueryInterface } from "./migration-interfaces";

export class NotNull { }
export const notNull = new NotNull();

export abstract class DataField<T> {
    defaultIfNull: () => T | null | NotNull;

    constructor(defaultValueOrFunction: T | null | NotNull | (() => T | null | NotNull) = null) {
        if (typeof defaultValueOrFunction === "function") this.defaultIfNull = (defaultValueOrFunction as () => T | null | NotNull);
        else this.defaultIfNull = () => defaultValueOrFunction;
    };
};
export type FieldType<T> = T extends DataField<infer R> ? R : T;

class IntegerField extends DataField<number>{ };
export const integerField = (defaultIfNull: number | null | NotNull | (() => number) = null) => new IntegerField(defaultIfNull);
class FloatField extends DataField<number>{ };
export const floatField = (defaultIfNull: number | null | NotNull | (() => number) = null) => new FloatField(defaultIfNull);
class BigIntField extends DataField<BigInt>{ };
export const bigIntField = (defaultIfNull: BigInt | null | NotNull | (() => BigInt) = null) => new BigIntField(defaultIfNull);
class StringField extends DataField<string>{ };
export const stringField = (defaultIfNull: string | null | NotNull | (() => string) = null) => new StringField(defaultIfNull);
class DateField extends DataField<Date>{ };
export const dateField = (defaultIfNull: Date | null | NotNull | (() => Date) = null) => new DateField(defaultIfNull);
class BooleanField extends DataField<boolean>{ };
export const booleanField = (defaultIfNull: boolean | null | NotNull | (() => boolean) = null) => new BooleanField(defaultIfNull);

export type DbRecord<T> = {
    [P in keyof T]?: FieldType<T[P]> | null;
}

export interface ITypedFacade extends IQueryInterface {
    query(request: string, queryObject?: any): Promise<{ records: any[]; }>;
    typedQuery<T extends Object>(c: new () => T, request: string, queryObject?: any): Promise<{ records: DbRecord<T>[]; }>;
    multiInsert<T>(tableName: string, records: T[]): Promise<T[]>;
    select<T extends Object>(c: new () => T, tableQuery: string, queryObject?: any): Promise<DbRecord<T>[]>;
}

class TypedFacade implements ITypedFacade {
    private db: IQueryInterface;

    constructor(db: IQueryInterface) {
        this.db = db;
    }

    private convertUppercaseIntoUnderscored = (s: String) => s.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`);

    async typedQuery<T extends Object>(c: new () => T, request: string, queryObject?: any): Promise<{ records: DbRecord<T>[]; }> {
        return {
            records: (await this.query(request, queryObject))
                .records.map((record: any): DbRecord<T> => {
                    const typedRecord: T = new c();
                    const newRecord = new Object();
                    Object.keys((typedRecord as any)).forEach(key => {
                        const field = (typedRecord as any)[key];
                        const matchingField =
                            record[key] ??
                            record[key.toLowerCase()] ??
                            record[this.convertUppercaseIntoUnderscored(key)];
                        if (field instanceof DataField && !matchingField && matchingField !== false && matchingField !== 0) {
                            if (field.defaultIfNull() instanceof NotNull) throw new Error(`Null value is not allowed for the field ${key}`);
                            (newRecord as any)[key] = field.defaultIfNull();
                        }
                        else if (field instanceof IntegerField) (newRecord as any)[key] = parseInt(matchingField);
                        else if (field instanceof BigIntField)
                            (newRecord as any)[key] = BigInt(`${matchingField}`.replace(/(^-?\d+)(.*)/, "$1"));
                        else if (field instanceof FloatField) (newRecord as any)[key] = parseFloat(matchingField);
                        else if (field instanceof StringField) (newRecord as any)[key] = `${matchingField}`;
                        else if (field instanceof DateField) (newRecord as any)[key] = new Date(matchingField);
                        else if (field instanceof BooleanField) (newRecord as any)[key] = Boolean(matchingField).valueOf();
                        else (newRecord as any)[key] = matchingField ?? field;
                    })
                    return (newRecord as DbRecord<T>);
                })
        };
    }

    async query(request: string, queryObject?: any): Promise<{ records: any[]; }> {
        return await this.db.query(request, queryObject);
    }

    private expandTableFields(field: any): string {
        return Object.keys(field).map(key => this.convertUppercaseIntoUnderscored(key)).join(',');
    }

    private indexedRecordExpansion = (record: any, index: number) => {
        const fillTarget = {};
        Object.keys(record).forEach(key => (fillTarget as any)[`${key}_${index}`] = (record as any)[key]);
        return fillTarget;
    }

    private expandedValuesList = (transactions: any[]) =>
        transactions.reduce((accumulator, record, index) =>
            ({ ...accumulator, ...this.indexedRecordExpansion(record, index) })
            , {})

    private translateTransactionFieldsIntoIndexedArguments = (record: any, index: number) =>
        Object.keys(record).map(key => `:${key}_${index}`).join(",");

    private expandedArgumentsList = (records: any) =>
        records.map((record: any, index: number) => `(${this.translateTransactionFieldsIntoIndexedArguments(record, index)})`).join(",");

    async multiInsert<T>(tableName: string, records: T[]): Promise<T[]> {
        if (records.length > 0) {
            let query: string;
            let values: any;
            try {
                query = `INSERT INTO ${tableName}(${this.expandTableFields(records[0])}) VALUES${this.expandedArgumentsList(records)}`
                values = this.expandedValuesList(records);
                await this.db.query(query, values);
            } catch (err: any) {
                throw new Error(`
                    Error for the executed insert query:
                    ${query!},
                    values: ${JSON.stringify(values, null, 3)}
                    Original error:${err.message},
                    Error stack:${err.stack}
                    `);
            }
        }
        return records;
    }

    async select<T extends Object>(c: new () => T, tableQuery: string, queryObject?: any): Promise<DbRecord<T>[]> {
        const fieldExample: T = new c();
        return (await this.typedQuery<T>(c,
            `SELECT ${this.expandTableFields(fieldExample)} FROM ${tableQuery}`, queryObject
        )).records
    }
}

export function typedFacade(db: IQueryInterface): ITypedFacade {
    return new TypedFacade(db);
}
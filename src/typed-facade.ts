import { BigIntField, DbRecord, FieldObject, FieldObjectDefinition, bigIntField, stringifyWithBigints, unmarshal } from "../pepelaz";
import { IQueryInterface } from "./migration-interfaces";

export interface ITypedFacade extends IQueryInterface {
    query(request: string, queryObject?: any): Promise<{ records: any[]; }>;
    typedQuery<T extends FieldObjectDefinition>(template: FieldObject<T>, request: string, queryObject?: any): Promise<{ records: DbRecord<T>[]; }>;
    multiInsert<T extends FieldObjectDefinition>(template: FieldObject<T>, tableName: string, records: DbRecord<T>[]): Promise<DbRecord<T>[]>;
    select<T extends FieldObjectDefinition>(template: FieldObject<T>, tableQuery: string, queryObject?: any): Promise<DbRecord<T>[]>;
}

class TypedFacade implements ITypedFacade {
    private db: IQueryInterface;

    constructor(db: IQueryInterface) {
        this.db = db;
    }

    private convertUppercaseIntoUnderscored = (s: String) => s.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`);

    async typedQuery<T extends FieldObjectDefinition>(template: FieldObject<T> | T, request: string, queryObject?: any): Promise<{ records: DbRecord<T>[]; }> {
        return {
            records: (await this.query(request, queryObject))
                .records.map((record: any): DbRecord<T> => unmarshal(template, record))
        };
    }

    async query(request: string, queryObject?: any): Promise<{ records: any[]; }> {
        return await this.db.query(request, queryObject);
    }

    private expandTableFields = <T extends FieldObjectDefinition>(template: FieldObject<T>): string => {
        return Object.keys(template.definition).map(key => this.convertUppercaseIntoUnderscored(key)).join(',');
    }

    private indexedRecordExpansion = <T extends FieldObjectDefinition>(record: any, index: number, template: FieldObject<T>) => {
        const fillTarget = {};
        Object.keys(record).forEach(key =>
            (fillTarget as any)[`${key}_${index}`] = template.definition[key] instanceof BigIntField ? Number(record[key]) : record[key]);
        return fillTarget;
    }

    private expandedValuesList = <T extends FieldObjectDefinition>(transactions: any[], template: FieldObject<T>) =>
        transactions.reduce((accumulator, record, index) =>
            ({ ...accumulator, ...this.indexedRecordExpansion(record, index, template) })
            , {})

    private translateTransactionFieldsIntoIndexedArguments = (record: any, index: number, template: any) =>
        Object.keys(template.definition).map(key => `:${key}_${index}`).join(",");

    private expandedArgumentsList = (records: any, template: any) =>
        records.map((record: any, index: number) =>
            `(${this.translateTransactionFieldsIntoIndexedArguments(record, index, template)})`)
            .join(",");

    async multiInsert<T extends FieldObjectDefinition>(template: FieldObject<T>, tableName: string, records: DbRecord<T>[]): Promise<DbRecord<T>[]> {
        if (records.length == 0) return [];
        let query: string;
        let values: any;
        try {
            query = `INSERT INTO ${tableName}(${this.expandTableFields(template)}) VALUES${this.expandedArgumentsList(records, template)}`
            console.log(query);
            console.log(stringifyWithBigints(records));
            values = this.expandedValuesList(records, template);
            console.log(values);
            await this.db.query(query, values);
            return records;
        } catch (err: any) {
            throw new Error(`
                    Error for the executed insert query:
                    ${query!},
                    values: ${stringifyWithBigints(values)}
                    Original error:${err.message},
                    Error stack:${err.stack}
                    `);
        }
    }

    async select<T extends FieldObjectDefinition>(template: FieldObject<T>, tableQuery: string, queryObject?: any): Promise<DbRecord<T>[]> {
        return (await this.typedQuery<T>(template,
            `SELECT ${this.expandTableFields(template)} FROM ${tableQuery}`, queryObject
        )).records
    }
}

export function typedFacade(db: IQueryInterface): ITypedFacade {
    return new TypedFacade(db);
}
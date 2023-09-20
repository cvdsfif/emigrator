import { DbRecord, booleanField, dateField, integerField, notNull, stringField } from "./typed-facade";

export class DatabaseChange {
    creationOrder = integerField(notNull);
    description = stringField(notNull);
    runTs = dateField(notNull);
    queryExecuted = stringField(notNull);
    successful = booleanField(notNull);
    message = stringField();
}

export type DatabaseChangeRecord = DbRecord<DatabaseChange>;

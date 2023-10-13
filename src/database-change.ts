import { DbRecord, booleanField, dateField, fieldObject, integerField, notNull, stringField } from "pepelaz";

export const databaseChange = fieldObject({
    creationOrder: integerField(notNull),
    description: stringField(notNull),
    runTs: dateField(notNull),
    queryExecuted: stringField(notNull),
    successful: booleanField(notNull),
    message: stringField()
});

export type DatabaseChangeRecord = DbRecord<typeof databaseChange>;
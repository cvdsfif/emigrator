import { ReportedEvent, typedFacade } from "pepelaz-db";
import { InputProps, LayerApisImplementations, LayerApisList } from "./migrated-database-construct";
import { VoidField, unmarshal } from "pepelaz";

export const CONNECTED = "@connected";

export class IntegrationHandler<T extends LayerApisList = any> {
    constructor(private apisList: T, private implementations: LayerApisImplementations<T>) { }

    handle = async <R extends keyof T>(
        props: InputProps,
        apiKey: R,
        func: keyof T[R],
        event: ReportedEvent,
        testConnection: boolean) => {
        const caller = this.implementations[apiKey]?.[func];
        if (!caller) throw new Error("Function not implemented");
        if (testConnection) return Promise.resolve(CONNECTED);
        (BigInt.prototype as any).toJSON = function () { return this.toString(); }
        const template = this.apisList[apiKey][func];
        const argument =
            template.arg instanceof VoidField ?
                void {} :
                unmarshal(template.arg, JSON.parse(event.body));
        return await caller({
            db: typedFacade(props.db)
        }, argument);
    }
}
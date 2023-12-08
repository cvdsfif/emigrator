import { CONNECTED } from "./integration-handler";
import { InputProps, LayerApisList } from "./migrated-database-construct";
import { ReportedEvent } from "pepelaz-db";

export const testApiConnectivity = <T extends LayerApisList>(
    apisList: T,
    handler: <K extends keyof T>(
        db: InputProps,
        apiKey: K,
        func: keyof T[K],
        event: ReportedEvent,
        testConnection: boolean) => Promise<unknown>,
    onlyApis: (keyof T)[]
) => {
    test.each(onlyApis.map(key => Object.keys(apisList[key]).map(funcKey => [key, funcKey])).flat())
        ("Testing interface connectivity for %p.%p", async (api, func) => {
            expect(await handler({} as InputProps, api, func as keyof T[keyof T], { body: "" }, true)).toEqual(CONNECTED);
        });
}
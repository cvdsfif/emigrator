import { ApiDefinition, integerField, stringField, voidField } from "pepelaz";
import { ApiAsyncImplementation, ImplementationProps, InputProps, LayerApisList } from "../src/migrated-database-construct";
import { CONNECTED, IntegrationHandler } from "../src/integration-handler";
import { ReportedEvent } from "pepelaz-db";
import { testApiConnectivity } from "../src/integration-connectivity-test";

describe("Testing layer API lambda integration", () => {
    const api = {
        callFunc: { arg: integerField(), ret: stringField() },
        voidFunc: { arg: voidField(), ret: stringField() }
    } satisfies ApiDefinition;

    const apiImplementation = {
        callFunc: (props: ImplementationProps, arg: number) => Promise.resolve(`N${arg + arg}`),
        voidFunc: (props: ImplementationProps) => Promise.resolve("VOID")
    } satisfies ApiAsyncImplementation<typeof api>;

    const apisList = {
        testApi: api
    } satisfies LayerApisList;
    type ApisList = typeof apisList;

    const implementationInterface = new IntegrationHandler(apisList, {
        testApi: apiImplementation
    });

    const handle = async <R extends keyof ApisList>(db: InputProps, apiKey: R, func: keyof ApisList[R], event: ReportedEvent, testConnection = false) =>
        await implementationInterface.handle(db, apiKey, func, event, testConnection);

    test("Should call matching function by name with unmarshalled parameters", async () => {
        expect(await handle({} as ImplementationProps, "testApi", "callFunc", { body: "2" })).toEqual("N4");
    });

    test("Should accept void function arguments", async () => {
        expect(await handle({} as ImplementationProps, "testApi", "voidFunc", { body: "" })).toEqual("VOID");
    });

    test("Should throw exception if a function is not implemented", async () => {
        const implementationInterface = new IntegrationHandler(apisList, {});
        const emptyHandle = async <R extends keyof ApisList>(db: InputProps, apiKey: R, func: keyof ApisList[R], event: ReportedEvent) =>
            await implementationInterface.handle(db, apiKey, func, event, false);
        await expect(emptyHandle({} as ImplementationProps, "testApi", "voidFunc", { body: "" })).rejects.toThrow();
    });

    test("Should be able to test connections", async () => {
        expect(await handle({} as ImplementationProps, "testApi", "callFunc", { body: "2" }, true)).toEqual(CONNECTED);
    })

    testApiConnectivity(apisList, handle, ["testApi"]);

})
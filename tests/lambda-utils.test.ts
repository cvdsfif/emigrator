import { HandlerProps, interfaceHandler, setConnectionTimeouts } from "../src/lambda-utils";
import { fieldObject, integerField, stringField, functionField, DataInterfaceDefinition, stringifyWithBigints, fieldArray, voidField } from "pepelaz";

describe("Checking the lambda utils behaviour", () => {

    const AWS = require("aws-sdk");

    beforeEach(() => {
        AWS.config.update = jest.fn();
    });

    test("Should correctly set up timeouts", () => {
        setConnectionTimeouts(1, 2);
        expect(AWS.config.update).toBeCalledWith({ maxRetries: 3, httpOptions: { connectTimeout: 2, timeout: 1 } });
    });

    test("Should correctly handle lambda interface", async () => {
        const argumentDefinition = fieldArray(fieldObject({ arg: integerField() }));
        const retvalDefinition = stringField();
        const exportInterface: DataInterfaceDefinition = {
            exportFn: functionField(argumentDefinition, retvalDefinition)
        };
        interface Input { arg: number };
        const callerFunction = async (inval: Input[], props: HandlerProps) => `Returning ${stringifyWithBigints(inval)}`;
        const result = await interfaceHandler(
            exportInterface,
            "exportFn",
            callerFunction,
            { body: `[{"arg":"1"}]` },
            {}
        );
        expect(AWS.config.update).toBeCalled();
        expect(result).toBe(`Returning [{\"arg\":1}]`);
    });

    test("Should allow empty list of arguments and void return type", async () => {
        const voidInterface: DataInterfaceDefinition = {
            run: functionField(voidField(), voidField())
        }
        //const callerFunction = async (input: void, props: HandlerProps): Promise<void> => { };
        const callerFunction = jest.fn();
        await interfaceHandler(
            voidInterface,
            "run",
            callerFunction,
            { body: `` }, {}
        );
        expect(callerFunction).toBeCalledWith(undefined, {});
    })

});
import { HandlerProps, interfaceHandler, setConnectionTimeouts } from "../src/lambda-utils";
import { fieldObject, integerField, stringField, functionField, DataInterfaceDefinition, FunctionFieldType, stringifyWithBigints, FunctionArgumentType, FunctionReturnType, fieldArray } from "../pepelaz";
import { testInterfaceImplementation } from "../src/lambda-utils-test-support";

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
        //await testInterfaceImplementation(exportInterface, "exportFn", `[{"arg":"1"}]`);
        expect(AWS.config.update).toBeCalled();
        expect(result).toBe(`Returning [{\"arg\":1}]`);
    });

});
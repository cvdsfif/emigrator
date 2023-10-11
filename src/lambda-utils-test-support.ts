import { DataInterfaceDefinition, FunctionFieldType, stringifyWithBigints } from "../pepelaz";
import { interfaceHandler } from "./lambda-utils";

export const testInterfaceImplementation = async <T extends DataInterfaceDefinition>(
    testedInterface: T,
    fieldName: keyof T,
    correctTestData: string
) => {
    const callerFunction: FunctionFieldType<T[keyof T]> = jest.fn() as unknown as FunctionFieldType<T[keyof T]>;
    (callerFunction as unknown as jest.Mock).mockImplementation(arg => `Returns ${stringifyWithBigints(arg)}`);
    const retval = await interfaceHandler(testedInterface, fieldName, callerFunction, { body: correctTestData }, {});
    expect(callerFunction).toBeCalledWith(JSON.parse(correctTestData), {});
    expect(retval).toEqual("Returns {\"arg\":1}");
}
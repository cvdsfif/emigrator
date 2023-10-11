import { DataInterfaceDefinition, FunctionArgumentType, FunctionReturnType, stringifyWithBigints, unmarshal } from "../pepelaz";
import { ITypedFacade } from "./typed-facade";

export const setConnectionTimeouts = (requestTimeout = 30000, connectTimeout = 10000, maxRetries = 3) => {
    const AWS = require("aws-sdk");

    AWS.config.update({
        maxRetries: maxRetries,
        httpOptions: {
            timeout: requestTimeout,
            connectTimeout: connectTimeout
        }
    });
}

export type ReportedEvent = {
    body: string
}

export type HandlerProps = {
    db?: ITypedFacade
}

export const interfaceHandler = async <T extends DataInterfaceDefinition, K extends keyof T>
    (
        template: T,
        implemented: K,
        handleFunction: (arg: FunctionArgumentType<T[K]>, props: HandlerProps) => FunctionReturnType<T[K]>,
        event: ReportedEvent,
        props: HandlerProps
    ): Promise<FunctionReturnType<T[K]>> => {
    setConnectionTimeouts();
    console.log("Converting input");
    console.log(event.body);
    const argument = unmarshal(template[implemented].argument, JSON.parse(event.body));
    console.log(stringifyWithBigints(argument));
    return await handleFunction(argument, props);
}
import { getConnectedPostgresInterface } from "../src/postgres-test-interface";

describe("Testing integrity of the test runner", () => {
    jest.setTimeout(60000);

    test("Second disconnection doesn't break tests", async () => {
        const connectedInstance = await getConnectedPostgresInterface();
        await connectedInstance.disconnect();
        await connectedInstance.disconnect();
    })
});
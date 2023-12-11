import { createEmigrator, createPostgresRunner } from "../src";
import { IConnectedTestInterface, getConnectedPostgresInterface } from "../src/postgres-test-interface";

describe("Testing the validity of an empty migration environment", () => {
    jest.setTimeout(90000);

    let connectedInterface: IConnectedTestInterface;

    beforeAll(async () => connectedInterface = await getConnectedPostgresInterface());

    afterAll(async () => await connectedInterface.disconnect());

    test("Should do an empty migration without errors", async () => {
        const runner = createPostgresRunner(connectedInterface);
        await runner.initialiseMigrationTable();
        await createEmigrator().migrate(runner)
    });
});
import { CdkMigratorHandler } from "../src/cdk-migrator-handler";
import { IMigrator, Migration, MigrationError, MigrationResult, MigrationRunner } from "../src/migration-interfaces";
import { Migrator } from "../src/migrator";

describe("Testing the custom CDK DB migration resource handler", () => {
    class MigratorMock implements IMigrator {
        migrate = jest.fn();

        migration(migration: Migration): Migrator {
            throw new Error("Method not implemented.");
        }
        lastMigration(): string {
            throw new Error("Method not implemented.");
        }
    }

    class RunnerMock extends MigrationRunner {
        constructor() {
            super({ query: (request: string) => Promise.resolve({ records: [] }) });
        }

        get migrationTable() { return "cdk_migration_test"; }

        getFirstToMigrate = jest.fn();

        cleanupFailedMigrationsReports(): Promise<void> {
            throw new Error("Method not implemented.");
        }
        run(inc: Migration): Promise<MigrationResult> {
            throw new Error("Method not implemented.");
        }
        migrationFailed(error: MigrationError): Promise<void> {
            throw new Error("Method not implemented.");
        }
        migrationSuccessful(error: Migration): Promise<void> {
            throw new Error("Method not implemented.");
        }
        initialiseMigrationTable = jest.fn();

    }

    const inboundPartialEvent = {
        StackId: "STACK_ID",
        RequestId: "REQUEST_ID",
        LogicalResourceId: "LOGICAL_RESOURCE_ID"
    };

    const inboundPhysicalId = "PHYSICAL_ID";

    const successResponse = (result: string, physicalId = inboundPhysicalId) => ({
        ...inboundPartialEvent,
        Status: "SUCCESS",
        Data: { Result: result },
        PhysicalResourceId: physicalId
    });

    const failedResponse = (result: string, physicalId = inboundPhysicalId) => ({
        ...inboundPartialEvent,
        Status: "FAILED",
        Data: { Result: result },
        PhysicalResourceId: physicalId
    });


    test("Delete handler should ignore processing and return success", async () =>
        expect(await new CdkMigratorHandler()
            .handle(new MigratorMock(), new RunnerMock(), {
                ...inboundPartialEvent,
                RequestType: "Delete",
                ServiceToken: "",
                ResponseURL: "",
                ResourceType: "",
                PhysicalResourceId: inboundPhysicalId,
                ResourceProperties: {
                    ServiceToken: ""
                }
            }))
            .toStrictEqual(successResponse("Resource deleted")));

    const testUpdate = async (
        migratorMock = new MigratorMock(),
        runnerMock = new RunnerMock(),
        requestType: ("Create" | "Update" | "Delete") = "Update",
        physicalId: string | null = inboundPhysicalId,
        resultMessage = "1 increments migrated") => {
        migratorMock.migrate.mockReturnValue(Promise.resolve({ successful: true, numberMigrated: 1 }));
        expect(await new CdkMigratorHandler()
            .handle(migratorMock, runnerMock, {
                ...inboundPartialEvent,
                RequestType: requestType,
                ServiceToken: "",
                ResponseURL: "",
                ResourceType: "",
                PhysicalResourceId: physicalId!,
                ResourceProperties: {
                    ServiceToken: ""
                },
                OldResourceProperties: {
                    ServiceToken: ""
                }
            }))
            .toStrictEqual(
                successResponse(resultMessage, physicalId ?? "")
            );
    }

    test("Update handler does the successful migration",
        async () => await testUpdate());

    test("Update handler reports the failed migration", async () => {
        const migratorMock = new MigratorMock();
        const runnerMock = new RunnerMock();
        migratorMock.migrate.mockReturnValue(Promise.resolve({ successful: false, errorMessage: "Mistaken" }));
        expect(await new CdkMigratorHandler()
            .handle(migratorMock, runnerMock, {
                ...inboundPartialEvent,
                RequestType: "Update",
                ServiceToken: "",
                ResponseURL: "",
                ResourceType: "",
                PhysicalResourceId: inboundPhysicalId,
                ResourceProperties: {
                    ServiceToken: ""
                },
                OldResourceProperties: {
                    ServiceToken: ""
                }
            }))
            .toStrictEqual(failedResponse("Mistaken"));
    });

    test("Create handler creates the schema and does a successful migration", async () => {
        const migratorMock = new MigratorMock();
        const runnerMock = new RunnerMock();
        await testUpdate(migratorMock, runnerMock, "Create", `custom-${inboundPartialEvent.RequestId}`);
        expect(runnerMock.initialiseMigrationTable).toBeCalled();
    });

    test("Update is possible with empty resource ID",
        async () => await testUpdate(new MigratorMock(), new RunnerMock(), "Update", null));

    test("Delete is possible with empty resource ID",
        async () => await testUpdate(new MigratorMock(), new RunnerMock(), "Delete", null, "Resource deleted"));

    test("Create handler forwards exception in service functions to the environment", async () => {
        const migratorMock = new MigratorMock();
        const runnerMock = new RunnerMock();
        runnerMock.initialiseMigrationTable.mockImplementation(() => { throw Error("Failure"); });
        try {
            await new CdkMigratorHandler()
                .handle(migratorMock, runnerMock, {
                    ...inboundPartialEvent,
                    RequestType: "Create",
                    ServiceToken: "",
                    ResponseURL: "",
                    ResourceType: "",
                    ResourceProperties: {
                        ServiceToken: ""
                    }
                });
        } catch (e: any) {
            expect(e.message).toBe("Failure");
        }
        expect(migratorMock.migrate).not.toBeCalled();
    });
});
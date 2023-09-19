import { CdkCustomResourceEvent, CdkCustomResourceResponse } from "aws-lambda";
import { ICdkMigratorHandler, IMigrator, MigrationRunner } from "./migration-interfaces";

export class CdkMigratorHandler implements ICdkMigratorHandler {
    async handle(
        migrator: IMigrator,
        runner: MigrationRunner,
        event: CdkCustomResourceEvent
    ): Promise<CdkCustomResourceResponse> {
        const response = (
            status: ("SUCCESS" | "FAILED"), result: string, resourceId: string
        ): CdkCustomResourceResponse => ({
            Status: status,
            PhysicalResourceId: resourceId,
            Data: { Result: result },
            StackId: event.StackId,
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId
        });

        const doUpdate = async (resourceId: string) => {
            const migrationResult = await migrator.migrate(runner);
            if (!migrationResult.successful) return response("FAILED", migrationResult.errorMessage!, resourceId)
            return response("SUCCESS", `${migrationResult.numberMigrated} increments migrated`, resourceId);
        }

        switch (event.RequestType) {
            case "Create": {
                await runner.initialiseMigrationTable();
                return await doUpdate(`custom-${event.RequestId}`);
            }
            case "Update":
                return doUpdate(event.PhysicalResourceId || "");
            case "Delete":
                return response("SUCCESS", "Resource deleted", event.PhysicalResourceId || "");
        };
    }
}
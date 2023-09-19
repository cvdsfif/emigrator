import { IMigrator, Migration, MigrationResult, MigrationRunner } from "./migration-interfaces";

export class Migrator implements IMigrator {
    private migrations = new Array<Migration>();

    async migrate(runner: MigrationRunner): Promise<MigrationResult> {
        let counter = 0;
        let allSuccessful = true;

        await runner.cleanupFailedMigrationsReports();
        const migrateAfter = await runner.getFirstToMigrate();
        const filteredMigrations = this.migrations.filter(inc => inc.order > migrateAfter);

        for (let migration of filteredMigrations) {
            let result;
            result = await runner.run(migration);
            counter++;
            const before = new Date();
            if (!result?.successful) {
                await runner.migrationFailed({
                    migration: migration,
                    errorMessage: result?.errorMessage ?? "No error message returned from runner"
                });
                allSuccessful = false;
                break;
            }
            const after = new Date();
            await runner.migrationSuccessful(migration, after.getTime() - before.getTime());
        }
        return {
            numberMigrated: counter,
            successful: allSuccessful
        };
    }

    migration(migration: Migration): Migrator {
        if (migration.order <= 0) throw new Error("The order number must be positive");
        if (this.migrations.find(found => found.order === migration.order))
            throw new Error("Trying to add two migrations with the same order number");
        this.migrations.push(migration);
        this.migrations.sort((migration1, migration2) => migration1.order - migration2.order);
        return this;
    }

    lastMigration(): number {
        return this.migrations[this.migrations.length - 1]?.order ?? 0;
    }
}

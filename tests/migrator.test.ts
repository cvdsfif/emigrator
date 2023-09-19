import { createEmigrator } from "../src";
import { IQueryInterface, Migration, MigrationError, MigrationResult, MigrationRunner } from "../src/migration-interfaces";

const migration1 = { order: 1, query: "SQL", description: "test" };
const migration3 = { order: 3, query: "SQL", description: "test2" }
const migration11 = { order: 11, query: "SQL", description: "test3" };

const dbMock: IQueryInterface = {
    query: jest.fn()
};

class MigrationRunnerStub extends MigrationRunner {
    private readonly lastMigration;
    private readonly runner: (inc: Migration) => MigrationResult;
    private readonly failureReporter: (error: MigrationError) => void;

    constructor(runner: (inc: Migration) => MigrationResult, failureReporter: (error: MigrationError) => void,
        lastMigration: Promise<number> = Promise.resolve(0)) {
        super(dbMock);
        this.runner = runner;
        this.failureReporter = failureReporter;
        this.lastMigration = lastMigration;
    }

    getFirstToMigrate(): Promise<number> {
        return this.lastMigration;
    }
    run(inc: Migration): Promise<MigrationResult> {
        return Promise.resolve(this.runner(inc));
    }
    migrationFailed(error: MigrationError): Promise<void> {
        return Promise.resolve(this.failureReporter(error));
    }

    initialiseMigrationTable(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    migrationSuccessful = jest.fn();
    cleanupFailedMigrationsReports = jest.fn();
}

describe("The abstract migrator should run against test stub", () => {
    test("The migrator() function should return a new migrator object", () =>
        expect(createEmigrator()).toBeDefined());

    test('Empty migration should have zero as last in order', () =>
        expect(createEmigrator().lastMigration()).toEqual(0));

    test('Migration should not accept non-positive orders', () =>
        expect(() => createEmigrator().migration({ order: 0, query: "", description: "" })).toThrowError());

    test('Migration should not accept duplicate orders', () =>
        expect(() =>
            createEmigrator()
                .migration({ order: 1, query: "", description: "" })
                .migration({ order: 1, query: "", description: "" })
        ).toThrowError());

    test('Migration counts deltas correctly', () => {
        const instance = createEmigrator()
            .migration(migration1)
            .migration(migration3)
            .migration(migration11);
        expect(instance.lastMigration()).toEqual(11);
    });

    test('All the expected migrations are called', async () => {
        const mock = jest.fn();
        const errorMock = jest.fn();
        mock.mockReturnValue({ successful: true });
        await createEmigrator()
            .migration(migration1)
            .migration(migration3)
            .migration(migration11)
            .migrate(new MigrationRunnerStub(mock, errorMock));
        expect(mock).toBeCalledWith(migration1);
        expect(mock).toBeCalledWith(migration3);
        expect(mock).toBeCalledWith(migration11);
    });

    test('Only new migrations are called', async () => {
        const mock = jest.fn();
        const errorMock = jest.fn();
        mock.mockReturnValue({ successful: true });
        await createEmigrator()
            .migration(migration1)
            .migration(migration3)
            .migration(migration11)
            .migrate(new MigrationRunnerStub(mock, errorMock, Promise.resolve(1)));
        expect(mock).not.toBeCalledWith(migration1);
        expect(mock).toBeCalledWith(migration3);
        expect(mock).toBeCalledWith(migration11);
    });

    test('Migration respects the calls order', async () => {
        const orders = new Array<number>();
        const orderRecorder = (inc: Migration): MigrationResult => {
            orders.push(inc.order);
            return { successful: true };
        }
        const errorMock = jest.fn();
        await createEmigrator()
            .migration(migration1)
            .migration(migration11)
            .migration(migration3)
            .migrate(new MigrationRunnerStub(orderRecorder, errorMock));
        expect(orders[0]).toBe(1);
        expect(orders[1]).toBe(3);
    });

    test('Migration stops on failure and reports error', async () => {
        const mock = jest.fn();
        const errorMock = jest.fn();
        mock
            .mockReturnValueOnce({ successful: true })
            .mockReturnValueOnce({ successul: false, errorMessage: "Mistaken" });
        const result: MigrationResult = await createEmigrator()
            .migration(migration1)
            .migration(migration3)
            .migration(migration11)
            .migrate(new MigrationRunnerStub(mock, errorMock));
        expect(mock).toBeCalledWith(migration1);
        expect(mock).toBeCalledWith(migration3);
        expect(mock).not.toBeCalledWith(migration11);
        expect(errorMock).toBeCalledWith({ migration: expect.objectContaining({ order: 3 }), errorMessage: "Mistaken" });
        expect(result).toEqual({ successful: false, numberMigrated: 2 });
    });

    test('Migrations are not breaking on empty error messages', async () => {
        const mock = jest.fn();
        const errorMock = jest.fn();
        mock.mockReturnValue({ successful: false });
        const error = await createEmigrator()
            .migration(migration1)
            .migrate(new MigrationRunnerStub(mock, errorMock));
        expect(error.successful).toBeFalsy();
    });

    test('Migrations are not breaking on undefined results', async () => {
        const mock = jest.fn();
        const errorMock = jest.fn();
        mock.mockReturnValue(undefined);
        const error = await createEmigrator()
            .migration(migration1)
            .migrate(new MigrationRunnerStub(mock, errorMock));
        expect(error.successful).toBeFalsy();
    });

    test('Migrator reports success to the runner', async () => {
        const mock = jest.fn();
        const errorMock = jest.fn();
        mock.mockReturnValue({ successful: true });
        const runner = new MigrationRunnerStub(mock, errorMock, Promise.resolve(0));
        await createEmigrator()
            .migration(migration1)
            .migrate(runner);
        expect(runner.migrationSuccessful).toBeCalledWith(migration1, expect.anything());
    });

    test('Migrator cleans up previous errors', async () => {
        const runner = jest.fn();
        const errorMock = jest.fn();
        const stub = new MigrationRunnerStub(runner, errorMock);
        runner.mockReturnValue({ successful: true });
        await createEmigrator()
            .migration(migration1)
            .migrate(stub);
        expect(stub.cleanupFailedMigrationsReports).toBeCalled();
        expect(runner).toBeCalledWith(migration1);
    });
})
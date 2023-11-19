import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { IQueryInterface } from "pepelaz-db";
import { Client } from "pg";

export interface IConnectedTestInterface extends IQueryInterface {
    disconnect(): void;
    expectTableExists(tableName: string, shouldExist?: boolean): void;
}

// This class has to be a singleton, we'll not initialize two instances of database for tests :)
class PostgresTester implements IConnectedTestInterface {
    private static connectedInstance: PostgresTester | null = null;

    private postgresContainer: StartedPostgreSqlContainer;
    private connectedClient: Client;

    private constructor(postgresContainer: StartedPostgreSqlContainer, connectedClient: Client) {
        this.postgresContainer = postgresContainer;
        this.connectedClient = connectedClient;
    }

    static async getConnectedInstance(): Promise<IConnectedTestInterface> {
        if (!this.connectedInstance) {
            const postgresContainer = await new PostgreSqlContainer().start();
            const connectedClient = new Client({ connectionString: postgresContainer.getConnectionUri() });
            await connectedClient.connect();
            this.connectedInstance = new PostgresTester(postgresContainer, connectedClient);
        }
        return this.connectedInstance!;
    }

    async disconnect() {
        await PostgresTester.connectedInstance?.connectedClient.end();
        await PostgresTester.connectedInstance?.postgresContainer.stop();
        PostgresTester.connectedInstance = null;
    }

    private convertNamedParamerersToNumbered = (query: string, paramsObject?: any): [string, any[]] => {
        let counter = 0;
        const paramsArray: any[] = [];
        const arrayQuery = query.replace(/(?<!:):[a-zA-Z0-9_]+/g,
            match => {
                paramsArray[counter++] = paramsObject[match.substring(1)];
                return `$${counter}`;
            });
        return [arrayQuery, paramsArray];
    }

    async query(request: string, queryObject?: any): Promise<{ records: any[]; }> {
        return { records: (await this.connectedClient.query(...this.convertNamedParamerersToNumbered(request, queryObject))).rows }
    }

    async expectTableExists(tableName: string, shouldExist = true) {
        if (shouldExist)
            expect((await this.query(`SELECT 'public.${tableName}'::regclass AS tab`)).records[0].tab).toBe(tableName);
        else
            await expect(this.query(`SELECT 'public.${tableName}'::regclass AS tab`)).rejects.toThrow();
    }
}

export const getConnectedPostgresInterface = async (): Promise<IConnectedTestInterface> => await PostgresTester.getConnectedInstance();
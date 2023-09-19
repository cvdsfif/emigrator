import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { IQueryInterface } from "./migration-interfaces";

// This class has to be a singleton, we'll not initialize two instances of database for tests :)
export default class PostgresTestInterface implements IQueryInterface {
    private static connectedInstance: PostgresTestInterface | null = null;

    private postgresContainer: StartedPostgreSqlContainer;
    private connectedClient: Client;

    private constructor(postgresContainer: StartedPostgreSqlContainer, connectedClient: Client) {
        this.postgresContainer = postgresContainer;
        this.connectedClient = connectedClient;
    }

    static async getConnectedInstance(): Promise<PostgresTestInterface> {
        if (!this.connectedInstance) {
            const postgresContainer = await new PostgreSqlContainer().start();
            const connectedClient = new Client({ connectionString: postgresContainer.getConnectionUri() });
            await connectedClient.connect();
            this.connectedInstance = new PostgresTestInterface(postgresContainer, connectedClient);
        }
        return this.connectedInstance!;
    }

    async disconnect() {
        await PostgresTestInterface.connectedInstance?.connectedClient.end();
        await PostgresTestInterface.connectedInstance?.postgresContainer.stop();
        PostgresTestInterface.connectedInstance = null;
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

    async expectTableExists(tableName: string) {
        expect((await this.query(`SELECT 'public.${tableName}'::regclass AS tab`)).records[0].tab).toBe(tableName);
    }
}
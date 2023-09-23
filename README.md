# Typescript library for CDK projects to migrate Postgresql database

## Purpose

When creating a CDK stack we often need to create a database schema when publishing the stack to AWS. This library offers a set of shortcuts for Typescript developers to make this process easier.

## Build status

This library is actually in testing phase.

## Frameworks used

This project is built for CDK v2. We recommend to attach it to your CDK project as a Lambda layer. 

## Features

The library supports forward-only database migrations via a custom CDK resource. It is written for the Postgresql database but the included interfaces can be extended to support other platforms. Helpers are provided to support integration testing.

It also contains few data conversion and and query helpers to make the database operations easier.

Plus few useful test helpers.

## Code example

Let's create a database with few migrations shared by few lambdas on the CDK stack. First install the required libraries to the separate directory:

```bash
npm i data-api-client --prefix migration-layer/data-api-client/nodejs
npm i aws-sdk --prefix migration-layer/aws-sdk/nodejs
npm i emigrator --prefix migration-layer/emigrator/nodejs
```

Update your CDK stack. First configure the shared libraries as layers. It will reduce the size of Lambdas code and accelerate deployments. Don't forget layers are immutable, every time we change anything inside, we have to update the versioned layer's name. Let's do it automatically:

```typescript
    // Hmm, useful stuff... I should extend it a little bit and include with the library
    const versionedLayerFromPackage = (packageName: string) => {
      const packageDefinition = require(`../migration-layer/${packageName}/nodejs/package.json`);
      const packageVersion = packageDefinition.dependencies[packageName];
      const layerName = `${packageName.replace(/(?:_|-| |\b)(\w)/g, (key, p1) => p1.toUpperCase())}Layer`;
      const versionedLayerName = `${layerName}_${packageVersion.replace(/\^*(.*)/, "$1").replace(/\./g, "_")}`;
      return new lambda.LayerVersion(this, layerName, {
        layerVersionName: versionedLayerName,
        compatibleRuntimes: [
          lambda.Runtime.NODEJS_18_X
        ],
        code: lambda.Code.fromAsset(`migration-layer/${packageName}`),
        compatibleArchitectures: [
          Architecture.ARM_64
        ]
      });
    }
```

...then define layers themselves:

```typescript
    const awsSdkLayer = versionedLayerFromPackage("aws-sdk");
    const dataApiLayer = versionedLayerFromPackage("data-api-client");
    const emigratorTsLayer = versionedLayerFromPackage("emigrator-ts");
```

Layers are shared between all projects' lambdas and they don't ofter change, for the rest, better to make all the names versioned to maintain separate dev, staging and prod codes. In your `lib/<project_name>_stack.ts, define:

```typescript
interface MultistackProps extends cdk.StackProps {
  environment?: string
}

export class ProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: MultistackProps) {
    super(scope, id, props);

//...
```

Then to make it available at deploy time, declare multiple stacks in `bin/<project_name>.ts`:

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProjectStack } from '../lib/project-stack';

const app = new cdk.App();

new ProjectStackDev(app, 'ProjectStackDev', {
  environment: "dev"
});

new StratadataStack(app, 'ProjectStackStaging', {
  environment: "stage"
});

app.synth();
```

We migrate things into a... uh... database, no? Let's define (still in the CDK stack) an instance in its own VPC:

```typescript
    // Create the VPC needed for the Aurora Serverless DB cluster
    // Note here and later we use the environment variable we defined above
    const vpc = new ec2.Vpc(this, `ProjectVPC-${props?.environment}`);
    // Create the Serverless Aurora DB cluster; set the engine to Postgres
    const cluster = new rds.ServerlessCluster(this, `ProjectCluster-${props?.environment}`, {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_13_10 }),
      defaultDatabaseName: 'ProjectDb',
      vpc,
      scaling: { autoPause: cdk.Duration.seconds(300) } // Optional. If not set, then instance will pause after 5 minutes 
    });
```

We define the deployment of our future lambda (it doesn't exist yet):

```typescript
    const migrationLambdaFn = new nodejs.NodejsFunction(this, `migration-lambda-${props?.environment}`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: './migration-lambda/index.ts',
      handler: 'handler',
      logRetention: logs.RetentionDays.FIVE_DAYS,
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      description: 'Lambda used for the Postgres database schema migration',
      architecture: Architecture.ARM_64,
      environment: {
        CLUSTER_ARN: cluster.clusterArn,
        SECRET_ARN: cluster.secret?.secretArn || '',
        DB_NAME: 'Reporting',
        ENVIRONMENT: `${props?.environment}`,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
      },
      bundling: {
        sourceMap: true,
        externalModules: [
          'aws-sdk',
          'migration-layer',
          'data-api-client',
          'aws-cdk-lib',
          'constructs',
          'emigrator-ts'
        ]
      },
      layers: [
        dataApiLayer, awsSdkLayer, emigratorTsLayer
      ]
    });
```

...and we define it as a custom resource that will be installed then immediately executed at deployment time

```typescript
    const customResourceProvider = new Provider(this, `migration-resource-provider-${props?.environment}`, {
      onEventHandler: migrationLambdaFn
    });
    const customResource = new cdk.CustomResource(this, `migration-resource-${props?.environment}`, {
      serviceToken: customResourceProvider.serviceToken,
      resourceType: "Custom::Migration",
      properties: {
        // This is magic from our Emigrator library. It makes the schema execute 
        // only when something changes in the migration schema
        // We'll define the migration variable a bit later in this doc
        lastMigration: migration.lastMigration()
      }
    });
```

Don't forget to give the lambda the database access:

```typescript
cluster.grantDataApiAccess(migrationLambdaFn);
```

Now, leave alone the stack definition for a moment, let's organize the migration itself. In the project's root, create the `migration-lambda` directory and initialize it:

```bash
mkdir collect-lambda
cd collect-lambda
npm init --y
npm install data-api-client
```

Remember we defined few database-related variables in our CDK lambda definition? We'll use them now to define our database connection in the `db.ts` file:

```typescript
const db = require('data-api-client')({
    secretArn: process.env.SECRET_ARN,
    resourceArn: process.env.CLUSTER_ARN,
    database: process.env.DB_NAME
});

export default db;
```

Then, preparing a migration becomes straightforward. Define in a new `migrator.ts` inside the same lambda directory:

```typescript
import { createEmigrator } from "emigrator-ts";

const migration = createEmigrator()
    .migration({
        order: 1,
        description: "First migrated table",
        query: `CREATE TABLE IF NOT EXISTS test_one(id BIGINT PRIMARY KEY, val VARCHAR(64))`
    })
    .migration({
        order: 2,
        description: "Second migrated table",
        query: `CREATE TABLE IF NOT EXISTS test_one(id BIGINT PRIMARY KEY, val VARCHAR(64))`
    })
    ;

export default migration;
```

...you're free to add as many migrations as you want, just be careful to make the order numbers growing and unique.

Now, put all that together in an `index.js` of the lambda:

```typescript
import {
    CdkCustomResourceEvent, CdkCustomResourceResponse, Context
} from 'aws-lambda';
import db from './db';
import migration from './migration';

import { createPostgresRunner } from "emigrator-ts";

export const handler = async (event: CdkCustomResourceEvent, context: Context):
    Promise<CdkCustomResourceResponse> => {
    const postgresRunner = createPostgresRunner(db);
    return migration.migrate(postgresRunner);
}
```

Et voilà. With that, all should be smoothly migrated.

## Installation

The project is built to support databases deployed through CDK supporting the AWS `data-api-client``. Install the supporting libraries including this one, organise them into lambda layers. Here we install the libraries for development purposes, to install them as lambda layers, refer to [this section](#code-example).

```bash
npm i -g aws-cdk
npm i --save-dev emigrator-ts

```

## API reference

This will be provided later

## Tests

The library is fully covered by unit and integration tests. It includes support for integration testing the migration in projects.

You have to install docker in your development environment to run a local instance of Postgresql for your tests. The installation details are explained [here](https://java.testcontainers.org/supported_docker_environment/).

You need to install the supporting libraries to run tests:

```bash
npm i pg --save-dev
npm i jest @testcontainers/postgresql --save-dev
npm i @types/pg --save-dev
npm i dockerode --save-dev
npm i --save-dev @types/dockerode
```

## License

The library is under the standard MIT license.
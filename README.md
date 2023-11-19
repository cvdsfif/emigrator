# Typescript library for CDK projects to migrate Postgresql database

## Purpose

When creating a CDK stack we often need to create a database schema when publishing the stack to AWS then incrementally update that schema. This library offers a set of shortcuts for Typescript developers to make this process easier.

## Build status

This library is actually in production phase but is rapidly evolving.

## Frameworks used

This project is built for CDK v2. You need to attach that library to your CDK project as a Lambda layer. 

## Features

The library supports forward-only database migrations via a custom CDK construct. It is written for the Postgresql database but the included interfaces can be extended to support other platforms. Helpers are provided to support integration testing.

## Code example

Let's create a database with few migrations shared by few lambdas on the CDK stack. And the API to access that database.

### Create migration lambda function

First install the required libraries to the separate directory. It must be in the root of your CDK project. By default, the directory name
has to be _migration-layer_, but this can be changed in the construct configuration as explained later:

```bash
npm i data-api-client --prefix migration-layer/aws-sdk/nodejs
npm i aws-sdk --prefix migration-layer/aws-sdk/nodejs
npm i aws-cdk-lib --prefix migration-layer/aws-cdk-lib/nodejs
npm i constructs --prefix migration-layer/aws-cdk-lib/nodejs
npm i @aws-cdk/aws-apigatewayv2-alpha --prefix migration-layer/aws-cdk-lib/nodejs
npm i @aws-cdk/aws-apigatewayv2-integrations-alpha --prefix migration-layer/aws-cdk-lib/nodejs
npm i pepelaz --prefix migration-layer/emigrator-ts/nodejs
npm i pepelaz-db --prefix migration-layer/emigrator-ts/nodejs
npm i emigrator-ts --prefix migration-layer/emigrator-ts/nodejs
```

Note that we put some libraries together in the same directories in order to reverence them from AWS lambda layers, knowing that a Lambda function can access at the same time a maximum of five layers.

To include the new database to your CDK stack, you first have to import the _emigrator-ts_ library (together with the supporting data types and database management libraries _pepelaz_ and _pepelaz-db_):

```bash
npm i --save-dev pepelaz
npm i --save-dev pepelaz-db
npm i --save-dev emigrator-ts
```

Now update the stack definition that is in `lib/<your project name>-stack.ts`:

```typescript
export class YourProjectStack extends Stack {
  constructor(scope: Construct, id: string, props?: MultistackProps) {
    super(scope, id, props);

    const DATABASE_NAME = 'DataCollect';
    const migratedDatabase = new MigratedDatabase(this, 'CollectDatabase', {
      ...props,
      ...migratedDatabaseDefaultProps,
      databaseName: DATABASE_NAME,
      migration: migration
    });

```

First notice the `MultistackProps` type that we are using as a second argument for our constructor. It's implementation in our library is very simple but it's role is important:

```typescript
interface MultistackProps extends StackProps {
    environment?: string;
}
```

It is used to make it possible to have multiple versions of deployed stack following our needs. We can define the prod, staging and dev environments for instance. Those versions are defined in `bin/<your project name>.ts`, for example:

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { YourProjectStack } from '../lib/your-project-stack';

const app = new cdk.App();

new YourProjectStack(app, 'YourProjectStackStaging', {
  env: {region:"eu-west-1"},
  environment: "stage"
});

new YourProjectStack(app, 'YourProjectStackProd', {
  env: {region:"eu-west-2"},
  environment: "production"
});

app.synth();
```

Let's get back to our `MigratedDatabase` construct. Its arguments are, after `this` referencing the stack created, the unique name to identify this construct in the CDK system and the collection of properties defining what we want to change from `props` that we receive from the outer world as a stack argument and `migratedDatabaseDefaultProps`, the name is self-explanatory.

We define then the database name (unique for the database server, but that is easy because we'll very probably have only one database on that server) and (now *be attentive*) the migration definition.

The migration definition is the heart of the system. It's a collection of SQL commands and some accompanying information that defines a forward-only model to update the structure of the database we're creating here. Every time you add a new information set to the migration, it executes the newly added (or simply not yet executed) commands used to create database object. As an example we can consider the following:

```typescript
import { createEmigrator } from "emigrator-ts";

export enum TestMigratedTables {
    TEST_TABLE = "test_table"
};

const migration = createEmigrator()
    .migration({
        order: 1,
        description: "Test table created",
        query: `
        CREATE TABLE ${TestMigratedTables.TEST_TABLE}
                    (id BIGINT, some_value VARCHAR, num_field Numeric(16,2), 
                    int_field Numeric(16,2), date_field TIMESTAMPTZ, is_cool BOOLEAN DEFAULT TRUE) 
        )`
    })
    ;

export default migration;
```

You are free to create new migrations but try to never delete existing ones, it can create a mess in the updates history management. Note that the values of `order` fields are the numbers that have to increase with the new migrations added. The only case when you can modify or delete a migration is when a migration execution fails on the server. But that should never happen, you will test every migration, do we agree?

Remember at the beginning of this section you created (with `npm i data-api-client --prefix`) the data for three default layers, `aws-sdk`, `aws-cdk-lib` and `emigrator-ts`? The `MigratedDatabase` construct will automatically create those layers (by default from the subdirectories of `migration-layer`) and attach them to the lambda function living by default in your `migration-lambda` directory.

Create and initialise this directory with `npm init --y`

Place to this directory an `index.ts` file that will look similar to this:

```typescript
import {
    CdkCustomResourceEvent, CdkCustomResourceResponse, Context
} from 'aws-lambda';
import migration from './migration';

import { createMigratorHandler, createPostgresRunner } from "emigrator-ts";
import { db, setConnectionTimeouts } from 'pepelaz-db';

export const handler = async (event: CdkCustomResourceEvent, context: Context):
    Promise<CdkCustomResourceResponse> => {
    setConnectionTimeouts();
    const postgresRunner = createPostgresRunner(db());
    return createMigratorHandler().handle(migration, postgresRunner, event);
}
```

Here, `setConnectionTimeouts` extends the default AWS HTTP timeouts, we need this if we let our database stop after a timeout period and then launch again. `createPostgresRunner` will connect us to the Postgres database created by the construct and let the `migration` from the previous string do its work. The migration (in our example) lives in the `migration.ts` file, it contains the migration described above.

Et voilà. With that, all should be smoothly migrated. But not very useful yet because we need to know how to connect to the effective database.

### Accessing data through Http proxies

Once the database created, you'll very probably need to use it, looks logical? Let's create an HTTP API to access its data. Of course, you can use _Restful API_ or _AppSync_, but it's heavier, and less easy to test. Our construct lets you create an API from a set of AWS Lambda functions and access it with some TypeScript magic that lets you transparently use them on the client side.

## Installation

The project is built to support databases deployed through CDK supporting the AWS `data-api-client``. Install the supporting libraries including this one, organise them into lambda layers. Here we install the libraries for development purposes, to install them as lambda layers, refer to [this section](#code-example).

```bash
npm i -g aws-cdk
npm i --save-dev emigrator-ts

```

## API reference

This will be provided later

## Tests

The library is covered by unit and integration tests. It includes support for integration testing the migration in projects.

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
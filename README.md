# Typescript library for CDK projects to migrate Postgresql database

## Purpose

When creating a CDK stack we often need to create a database schema when publishing the stack to AWS. This library offers a set of shortcuts for Typescript developers to make this process easier.

## Build status

This library is actually in testing phase.

## Frameworks used

This project is built for CDK v2. We recommend to attach it to your CDK project as a Lambda layer. 

## Features

The library supports forward-only database migrations via a custom CDK resource. It is written for the Postgresql database but the included interfaces can be extended to support other platforms. Helpers are provided to support integration testing.

## Code example

This will be provided later

## Installation

The project is built to support databases deployed through CDK supporting the AWS `data-api-client``. Install the supporting libraries including this one, organise them into lambda layers.

```
npm i -g aws-cdk
npm i aws-cdk-lib --prefix migration-layer/aws-cdk-lib/nodejs
npm i constructs --prefix migration-layer/constructs/nodejs
npm i data-api-client --prefix migration-layer/data-api-client/nodejs
npm i aws-sdk --prefix migration-layer/aws-sdk/nodejs
npm i emigrator --prefix migration-layer/emigrator/nodejs
```

## API reference

This will be provided later

## Tests

The library is fully covered by unit and integration tests. It includes support for integration testing the migration in projects.

You have to install docker in your development environment to run a local instance of Postgresql for your tests. The installation details are explained [here](https://java.testcontainers.org/supported_docker_environment/).

You need to install the supporting libraries to run tests:

```
npm i pg --save-dev
npm i jest @testcontainers/postgresql --save-dev
npm i @types/pg --save-dev
npm i dockerode --save-dev
npm i --save-dev @types/dockerode
```

## License

The library is under the standard MIT license.
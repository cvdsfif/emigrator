import { CfnOutput, CustomResource, Duration, StackProps } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { aws_rds as rds } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_lambda_nodejs as nodejs } from "aws-cdk-lib";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import { DataIdentifier, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { IMigrator } from "./migration-interfaces";
import { CorsHttpMethod, HttpApi, HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { ApiDefinition } from "pepelaz";

export interface MultistackProps extends StackProps {
    environment?: string
}

export type Environment = {
    [key: string]: string
}
export interface ILambdaProps {
    description?: string,
    extraModules: string[],
    extraLayers: lambda.LayerVersion[],
    extraEnv: Environment
}

export const defaultLambdaProps: Pick<ILambdaProps, ('extraLayers' | 'extraModules' | 'extraEnv')> = {
    extraLayers: [],
    extraModules: [],
    extraEnv: {}
}

export interface IMigratedDatabaseProps extends MultistackProps {
    databaseName: string,
    migration: IMigrator,
    databaseClusterTimeout: Duration,
    migrationLayerName: string,
    migrationLambdaName: string,
    defaultLayerProps: any
}

export const migratedDatabaseDefaultProps:
    Pick<
        IMigratedDatabaseProps,
        ("databaseClusterTimeout" | "migrationLayerName" | "defaultLayerProps" | "migrationLambdaName")
    > = {
    databaseClusterTimeout: Duration.seconds(300),
    migrationLayerName: 'migration-layer',
    migrationLambdaName: 'migration-lambda',
    defaultLayerProps: {
        compatibleRuntimes: [
            lambda.Runtime.NODEJS_18_X
        ],
        compatibleArchitectures: [
            Architecture.ARM_64
        ]
    }
}

export type LambdaMap<T extends ApiDefinition> = {
    [key in keyof T]?: NodejsFunction
};
export interface IApiInformation<T extends ApiDefinition> {
    name: string,
    url: string,
    lambdaConstructs: LambdaMap<T>;
}

export type ApiLambdaProps<T extends ApiDefinition> = {
    [K in keyof T]?: ILambdaProps;
}

export interface IApiProps<T extends ApiDefinition> {
    name: string,
    description: string,
    definition: T,
    props: ApiLambdaProps<T>
}

export class MigratedDatabase extends Construct {
    readonly versionedLayerFromPackage: (packageName: string) => lambda.LayerVersion;
    readonly createLambda: (functionName: string, extraProps: ILambdaProps) => nodejs.NodejsFunction;
    readonly defineApi: <T extends ApiDefinition>(props: IApiProps<T>) => IApiInformation<T>;

    readonly cluster: rds.ServerlessCluster;
    readonly awsSdkLayer: lambda.LayerVersion;
    readonly awsCdkLibLayer: lambda.LayerVersion;
    readonly emigratorTsLayer: lambda.LayerVersion;

    constructor(scope: Construct, id: string, props: IMigratedDatabaseProps) {
        super(scope, id);

        const vpc = new ec2.Vpc(this, `${props.databaseName}VPC-${props?.environment}`, {
            natGateways: 1,
        });
        this.cluster = new rds.ServerlessCluster(this, `${props.databaseName}PostgresCluster-${props?.environment}`, {
            engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_13_10 }),
            defaultDatabaseName: `${props.databaseName}`,
            vpc: vpc,
            scaling: { autoPause: props.databaseClusterTimeout } // Optional. If not set, then instance will pause after 5 minutes 
        });

        this.versionedLayerFromPackage = (packageName: string) => {
            const packageDefinition = require(`../../../${props.migrationLayerName}/${packageName}/nodejs/package.json`);
            const packageVersion = packageDefinition.dependencies[packageName];
            const layerName = `${packageName.replace(/(?:_|-| |\b)(\w)/g, (key, p1) => p1.toUpperCase())}Layer`;
            const versionedLayerName = `${layerName}_${packageVersion.replace(/\^*(.*)/, "$1").replace(/\./g, "_")}`;

            return new lambda.LayerVersion(this, layerName, {
                ...props.defaultLayerProps,
                layerVersionName: versionedLayerName,
                code: lambda.Code.fromAsset(`migration-layer/${packageName}`)
            });
        }

        this.awsSdkLayer = this.versionedLayerFromPackage("aws-sdk");
        this.awsCdkLibLayer = this.versionedLayerFromPackage("aws-cdk-lib");
        this.emigratorTsLayer = this.versionedLayerFromPackage("emigrator-ts");

        this.createLambda =
            (functionName: string, extraProps: ILambdaProps) =>
                new nodejs.NodejsFunction(this, `${functionName}-${props?.environment}`, {
                    runtime: lambda.Runtime.NODEJS_18_X,
                    entry: `./${functionName}/index.ts`,
                    handler: 'handler',
                    timeout: Duration.seconds(300),
                    logRetention: RetentionDays.FIVE_DAYS,
                    memorySize: 512,
                    architecture: Architecture.ARM_64,
                    environment: {
                        CLUSTER_ARN: this.cluster.clusterArn,
                        SECRET_ARN: this.cluster.secret?.secretArn || '',
                        DB_NAME: props.databaseName,
                        ENVIRONMENT: `${props?.environment}`,
                        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
                        ...extraProps.extraEnv
                    },
                    bundling: {
                        sourceMap: true,
                        externalModules: [
                            'aws-sdk',
                            'emigrator-ts',
                            'pepelaz',
                            'pepelaz-db',
                            'data-api-client',
                            ...extraProps.extraModules
                        ]
                    },
                    layers: [
                        this.awsSdkLayer, this.emigratorTsLayer, this.awsCdkLibLayer,
                        ...extraProps.extraLayers
                    ],
                    ...extraProps,
                    description: extraProps.description ?
                        `${extraProps.description} (${props?.environment})` :
                        `${functionName} (${props?.environment})`
                });

        this.defineApi = <T extends ApiDefinition>(apiProps: IApiProps<T>) => {
            const httpApi = new HttpApi(this, `ProxyCorsHttpApi-${apiProps.name}-${props?.environment}`, {
                corsPreflight: { allowMethods: [CorsHttpMethod.ANY], allowOrigins: ['*'], allowHeaders: ['*'] },
            });

            const lambdaConstructs: LambdaMap<T> = {};
            Object.keys(apiProps.definition).forEach(key => {
                const keyWithDashes = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
                const databaseLambda = this.createLambda(
                    `${keyWithDashes}-lambda`,
                    apiProps.props[key] ? {
                        ...apiProps.props[key] as ILambdaProps,
                        description: `${apiProps.description} : ${apiProps.props[key]?.description ?? key}`
                    } : {
                        ...defaultLambdaProps,
                        description: `${apiProps.description} : ${key}`,
                    });
                (lambdaConstructs as any)[key] = databaseLambda;
                this.cluster.grantDataApiAccess(databaseLambda);

                const lambdaIntegration = new HttpLambdaIntegration(
                    `Integration-${apiProps.name}-${key}-${props?.environment}`,
                    databaseLambda
                );

                httpApi.addRoutes({
                    integration: lambdaIntegration,
                    methods: [HttpMethod.POST],
                    path: `/${keyWithDashes}`
                });
            });
            return {
                name: apiProps.name,
                url: httpApi.apiEndpoint,
                lambdaConstructs: lambdaConstructs
            };
        }

        const migrationLambdaFn = this.createLambda(`${props.migrationLambdaName}`, {
            description: 'Lambda used for database schema migration',
            ...defaultLambdaProps
        });

        const customResourceProvider = new Provider(this, `migration-resource-provider-${props?.environment}`, {
            onEventHandler: migrationLambdaFn
        });
        const customResource = new CustomResource(this, `migration-resource-${props?.environment}`, {
            serviceToken: customResourceProvider.serviceToken,
            resourceType: "Custom::Migration",
            properties: {
                lastMigration: props.migration.lastMigration()
            }
        });

        this.cluster.grantDataApiAccess(migrationLambdaFn);
        customResource.node.addDependency(this.cluster);
    }
}
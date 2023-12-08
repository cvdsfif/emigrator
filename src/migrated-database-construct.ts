import { CustomResource, Duration, StackProps } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { aws_rds as rds } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_lambda_nodejs as nodejs } from "aws-cdk-lib";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { IMigrator } from "./migration-interfaces";
import { CorsHttpMethod, HttpApi, HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { ApiDefinition, DataField } from "pepelaz";
import { IQueryInterface, ITypedFacade } from "pepelaz-db";
import * as esbuild from 'esbuild';

export interface MultistackProps extends StackProps {
    environment?: string
}
export type Environment = {
    [key: string]: string
}

// Root migrated database construct props
export interface IMigratedDatabaseProps extends MultistackProps {
    databaseName: string,
    migration: IMigrator,
    databaseClusterTimeout: Duration,
    migrationLayerPath: string,
    migrationLambdaName: string,
    migrationLambdaPath?: string
}

export const migratedDatabaseDefaultProps:
    Pick<
        IMigratedDatabaseProps,
        ("databaseClusterTimeout" | "migrationLayerPath" | "migrationLambdaName")
    > = {
    databaseClusterTimeout: Duration.seconds(300),
    migrationLayerPath: 'migration-layer',
    migrationLambdaName: 'migration-lambda',
}

export type LayerProps = {
    layerPath?: string,
    outDir?: string
}

// Nodejs lambdas props
export interface ILambdaProps {
    description?: string,
    directoryPrefix?: string,
    extraModules: string[],
    extraLayers: lambda.LayerVersion[],
    extraEnv: Environment
}
export const defaultLambdaProps: Pick<ILambdaProps, ('extraLayers' | 'extraModules' | 'extraEnv')> = {
    extraLayers: [],
    extraModules: [],
    extraEnv: {}
}

export type LambdaMap<T extends ApiDefinition> = {
    [key in keyof T]?: NodejsFunction
};
export type IApiInformation<T extends ApiDefinition> = {
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
    defaultDirectoryPrefix?: string,
    props: ApiLambdaProps<T>
}

// Listing APIs implemented at the layer level
export type LayerApisList = {
    [K: string]: ApiDefinition
}

export type InputProps = {
    db: IQueryInterface
}
export type ImplementationProps = {
    db: ITypedFacade
}
export type ApiAsyncImplementation<T extends ApiDefinition> = {
    [P in keyof T]: T[P]["arg"] extends DataField<infer S> ?
    T[P]["ret"] extends DataField<infer R> ?
    (props: ImplementationProps, arg: S) => Promise<R>
    : never : never;
};
export type LayerApisImplementations<T extends LayerApisList> = {
    [K in keyof T]?: ApiAsyncImplementation<T[K]>
}

// Layer access lambda props
export type InlineLambdaProps = {
    description?: string,
    namePrefix?: string,
    extraLayers: lambda.LayerVersion[],
    extraEnv: Environment
}
export type LayerLambdaPropsList<T extends ApiDefinition> = {
    [K in keyof T]?: InlineLambdaProps;
}

export type LayerApiInput<T extends ApiDefinition> = {
    cfnAlias: string,
    description: string,
    props: LayerLambdaPropsList<T>
}
export type LayerApiInputsList<T extends LayerApisList> = {
    [K in keyof T]: LayerApiInput<T[K]>
}
export type LayerLambdasList<T extends ApiDefinition> = {
    [K in keyof T]: lambda.Function
}
export type LayerApiOutput<T extends ApiDefinition> = {
    cfnAlias: string,
    url: string,
    lambdas: LayerLambdasList<T>;
}
export type LayerApiOutputsList<T extends LayerApisList> = {
    [K in keyof T]: LayerApiOutput<T[K]>;
}

export class MigratedDatabase extends Construct {
    // Вefaults
    private readonly DEFAULT_RUNTIME = lambda.Runtime.NODEJS_18_X;
    private readonly DEFAULT_RUNTIME_ESBUILD = "node18.0";
    private readonly DEFAULT_LAMBDA_TIMEOUT = Duration.seconds(300);
    private readonly DEFAULT_LOG_RETENTION = RetentionDays.FIVE_DAYS;
    private readonly DEFAULT_MEMORY_SIZE = 512;
    private readonly DEFAULT_ARCHITECTURE = Architecture.ARM_64;

    readonly versionedLayerFromPackage: (packageName: string, layerProps?: LayerProps) => lambda.LayerVersion;
    readonly createLambda: (functionName: string, extraProps: ILambdaProps) => nodejs.NodejsFunction;
    readonly createInlineLambda: (functionName: string, functionBody: string, extraProps: InlineLambdaProps) => lambda.Function;
    readonly defineApi: <T extends ApiDefinition>(props: IApiProps<T>) => IApiInformation<T>;
    readonly connectLayerApis: <T extends LayerApisList>(
        list: T, listProps: LayerApiInputsList<T>, layerProps?: LayerProps
    ) => LayerApiOutputsList<T>;

    get defaultRuntime() { return this.DEFAULT_RUNTIME.toString(); }

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

        this.versionedLayerFromPackage = (packageName: string, layerProps: LayerProps = {}) => {
            //const packageDefinition = require(`../../../${props.migrationLayerName}/${packageName}/nodejs/package.json`);
            //const packageVersion = packageDefinition.dependencies[packageName];
            const layerName = `${packageName.replace(/(?:_|-| |\b)(\w)/g, (_, p1) => p1.toUpperCase())}Layer`;
            //const versionedLayerName = `${layerName}_${packageVersion.replace(/\^*(.*)/, "$1").replace(/\./g, "_")}`;

            return new lambda.LayerVersion(this, layerName, {
                // layerVersionName: layerName,//versionedLayerName,
                code: lambda.Code.fromAsset(`${layerProps.layerPath ?? props.migrationLayerPath}/${packageName}`),
                compatibleArchitectures: [this.DEFAULT_ARCHITECTURE],
                compatibleRuntimes: [this.DEFAULT_RUNTIME],
            });
        }

        this.awsSdkLayer = this.versionedLayerFromPackage("aws-sdk");
        this.awsCdkLibLayer = this.versionedLayerFromPackage("aws-cdk-lib");
        this.emigratorTsLayer = this.versionedLayerFromPackage("emigrator-ts");

        const dbLambdaEnvironment = (extraProps: InlineLambdaProps | ILambdaProps) => ({
            CLUSTER_ARN: this.cluster.clusterArn,
            SECRET_ARN: this.cluster.secret?.secretArn || '',
            DB_NAME: props.databaseName,
            ENVIRONMENT: `${props?.environment}`,
            AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
            ...extraProps.extraEnv
        });

        this.createInlineLambda =
            (functionName: string, functionBody: string, extraProps: InlineLambdaProps) =>
                new lambda.Function(this, `${extraProps.namePrefix ?? ""}${functionName}-${props?.environment}`, {
                    code: new lambda.InlineCode(functionBody),
                    handler: "index.handler",
                    runtime: this.DEFAULT_RUNTIME,
                    timeout: this.DEFAULT_LAMBDA_TIMEOUT,
                    logRetention: this.DEFAULT_LOG_RETENTION,
                    memorySize: this.DEFAULT_MEMORY_SIZE,
                    architecture: this.DEFAULT_ARCHITECTURE,
                    environment: dbLambdaEnvironment(extraProps),
                    layers: [
                        this.awsSdkLayer, this.emigratorTsLayer, this.awsCdkLibLayer,
                        ...extraProps.extraLayers
                    ],
                    ...extraProps,
                    description: extraProps.description ?
                        `${extraProps.description} (${props?.environment})` :
                        `${functionName} (${props?.environment})`
                })

        this.createLambda =
            (functionName: string, extraProps: ILambdaProps) =>
                new nodejs.NodejsFunction(this, `${extraProps.directoryPrefix?.replace("/", "-") ?? ""}${functionName}-${props?.environment}`, {
                    runtime: this.DEFAULT_RUNTIME,
                    entry: `./${extraProps.directoryPrefix ?? ""}${functionName}/index.ts`,
                    handler: 'handler',
                    timeout: this.DEFAULT_LAMBDA_TIMEOUT,
                    logRetention: this.DEFAULT_LOG_RETENTION,
                    memorySize: this.DEFAULT_MEMORY_SIZE,
                    architecture: this.DEFAULT_ARCHITECTURE,
                    environment: dbLambdaEnvironment(extraProps),
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
                        description: `${apiProps.description} : ${apiProps.props[key]?.description ?? key}`,
                        directoryPrefix: apiProps.props[key]?.directoryPrefix ?? apiProps.defaultDirectoryPrefix
                    } : {
                        ...defaultLambdaProps,
                        description: `${apiProps.description} : ${key}`,
                        directoryPrefix: apiProps.defaultDirectoryPrefix
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

        const connectApiLayer = <T extends ApiDefinition>(
            api: string,
            input: T,
            apiProps: LayerApiInput<T>,
            layerProps: LayerProps):
            LayerApiOutput<T> => {
            const nameWithDashes = api.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
            const inputPath = layerProps.layerPath ?? "layers";
            const outputDir = layerProps.outDir ?? "dist";
            const outputFile = `${outputDir}/${nameWithDashes}/nodejs/integration.js`;

            esbuild.buildSync({
                entryPoints: [`${inputPath}/${nameWithDashes}/integration.ts`],
                outfile: outputFile,
                bundle: true,
                minify: true,
                external: ["data-api-client", "aws-sdk", "aws-cdk-lib", "emigrator-ts", "pepelaz", "pepelaz-db"],
                platform: "node",
                target: this.DEFAULT_RUNTIME_ESBUILD
            });

            const connectedLayer = this.versionedLayerFromPackage(
                nameWithDashes,
                { layerPath: outputDir });

            const httpApi = new HttpApi(this, `ProxyCorsHttpApi-${apiProps.cfnAlias}-${props?.environment}`, {
                corsPreflight: { allowMethods: [CorsHttpMethod.ANY], allowOrigins: ['*'], allowHeaders: ['*'] },
            });

            const lambdaConstructs = {} as LayerLambdasList<T>;
            Object.keys(input).forEach(key => {
                const keyWithDashes = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
                const databaseLambda = this.createInlineLambda(
                    `${keyWithDashes}-inline-lambda`, `
                        const dbClient=require('data-api-client')({
                            secretArn: process.env.SECRET_ARN,
                            resourceArn: process.env.CLUSTER_ARN,
                            database: process.env.DB_NAME
                        });
                        const integration=require('/opt/nodejs/integration');

                        exports.handler = async(event) => {
                            try{
                                return await integration.handle({db:dbClient},'${api}','${key}', event);
                            } catch(e) {
                                return JSON.stringify({
                                    errorMessage:e.message,
                                    calledFunction:"${api}.${key}"
                                });
                            }
                        }
                    `,
                    apiProps.props[key] ? {
                        ...apiProps.props[key] as InlineLambdaProps,
                        description: `${apiProps.description} : ${apiProps.props[key]?.description ?? key}`,
                        extraLayers: [...(apiProps.props[key]!.extraLayers), connectedLayer]
                    } : {
                        ...defaultLambdaProps,
                        description: `${apiProps.description} : ${key}`,
                        extraLayers: [connectedLayer]
                    });
                (lambdaConstructs as any)[key] = databaseLambda;
                this.cluster.grantDataApiAccess(databaseLambda);

                const lambdaIntegration = new HttpLambdaIntegration(
                    `Integration-${apiProps.cfnAlias}-${key}-${props?.environment}`,
                    databaseLambda
                );

                httpApi.addRoutes({
                    integration: lambdaIntegration,
                    methods: [HttpMethod.POST],
                    path: `/${keyWithDashes}`
                });
            });
            return {
                cfnAlias: apiProps.cfnAlias,
                url: httpApi.apiEndpoint,
                lambdas: lambdaConstructs
            };
        };

        this.connectLayerApis = <T extends LayerApisList>(list: T, listProps: LayerApiInputsList<T>, layerProps: LayerProps = {}) =>
            Object.keys(list).reduce((accumulator: LayerApiOutputsList<T>, key: string) => {
                (accumulator as any)[key] = connectApiLayer(key, list[key], listProps[key], layerProps);
                return accumulator;
            }, {} as LayerApiOutputsList<T>);

        const migrationLambdaFn = this.createLambda(`${props.migrationLambdaName}`, {
            description: 'Lambda used for database schema migration',
            ...defaultLambdaProps,
            directoryPrefix: props.migrationLambdaPath ?? ""
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
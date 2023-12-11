import { CustomResource, Duration, StackProps } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { aws_rds as rds } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { IMigrator } from "./migration-interfaces";
import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { ApiDefinition, LayerApisList } from "pepelaz";
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
    commonLayerPath: string,
    migrationLambdaName: string,
    migrationLayerPath: string,
    layerOutputDir: string
}

export const migratedDatabaseDefaultProps:
    Pick<
        IMigratedDatabaseProps,
        ("databaseClusterTimeout" | "migrationLayerPath" | "commonLayerPath" | "layerOutputDir" | "migrationLambdaName")
    > = {
    databaseClusterTimeout: Duration.seconds(300),
    migrationLayerPath: 'migration',
    migrationLambdaName: 'migration-lambda',
    commonLayerPath: 'layers',
    layerOutputDir: 'dist'
}

export type LayerProps = {
    layerPath?: string,
    outDir?: string
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
export const defaultLambdaProps: Pick<InlineLambdaProps, ('extraLayers' | 'extraEnv')> = {
    extraLayers: [],
    extraEnv: {}
}

export type LayerApiInput<T extends ApiDefinition> = {
    cfnAlias: string,
    description?: string,
    props?: LayerLambdaPropsList<T>
}
export type LayerApiInputsList<T extends LayerApisList> = {
    [K in keyof T]: LayerApiInput<T[K]>
}
export type LayerLambdasList<T extends ApiDefinition> = {
    [K in keyof T]: lambda.Function
}
export type LayerApiOutput<T extends ApiDefinition> = {
    apiName: string,
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
    readonly createInlineLambda: (functionName: string, functionBody: string, extraProps: InlineLambdaProps) => lambda.Function;
    readonly connectLayerApis: <T extends LayerApisList>(
        list: T, listProps: LayerApiInputsList<T>, layerProps?: LayerProps
    ) => LayerApiOutputsList<T>;

    get defaultRuntime() { return this.DEFAULT_RUNTIME.toString(); }

    readonly cluster: rds.ServerlessCluster;
    readonly emigratorTsLayer: lambda.LayerVersion;
    readonly apiLibrariesLayer: lambda.LayerVersion;

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
            const layerName = `${packageName.replace(/(?:_|-| |\b)(\w)/g, (_, p1) => p1.toUpperCase())}Layer`;

            return new lambda.LayerVersion(this, layerName, {
                code: lambda.Code.fromAsset(`${layerProps.layerPath ?? props.commonLayerPath}/${packageName}`),
                compatibleArchitectures: [this.DEFAULT_ARCHITECTURE],
                compatibleRuntimes: [this.DEFAULT_RUNTIME],
            });
        }

        this.emigratorTsLayer = this.versionedLayerFromPackage("emigrator-ts");
        this.apiLibrariesLayer = this.versionedLayerFromPackage("api-libraries");

        const dbLambdaEnvironment = (extraProps: InlineLambdaProps) => ({
            CLUSTER_ARN: this.cluster.clusterArn,
            SECRET_ARN: this.cluster.secret?.secretArn!,
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
                        this.apiLibrariesLayer,
                        ...extraProps.extraLayers
                    ],
                    ...extraProps,
                    description: extraProps.description ?
                        `${extraProps.description} (${props?.environment})` :
                        `${functionName} (${props?.environment})`
                });

        const dbClientConnection = `
        const dbClient=require('data-api-client')({
            secretArn: process.env.SECRET_ARN,
            resourceArn: process.env.CLUSTER_ARN,
            database: process.env.DB_NAME,
            options: {
                maxRetries: 3,
                httpOptions: {
                    timeout: 120000,
                    connectTimeout: 30000
                }
            }
        });
        `;

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
                external: ["data-api-client", "aws-sdk", "aws-cdk-lib", "pepelaz", "pepelaz-db", "@aws-sdk/client-rds-data", "sqlstring"],
                platform: "node",
                target: this.DEFAULT_RUNTIME_ESBUILD
            });

            const connectedLayer = this.versionedLayerFromPackage(
                nameWithDashes,
                { layerPath: `${outputDir}` });

            const httpApi = new HttpApi(this, `ProxyCorsHttpApi-${apiProps.cfnAlias}-${props?.environment}`, {
                corsPreflight: { allowMethods: [CorsHttpMethod.ANY], allowOrigins: ['*'], allowHeaders: ['*'] },
            });

            const lambdaConstructs = {} as LayerLambdasList<T>;
            Object.keys(input).forEach(key => {
                const keyWithDashes = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
                const databaseLambda = this.createInlineLambda(
                    `${keyWithDashes}-inline-lambda-${props?.environment}`, `
                        ${dbClientConnection}
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
                    apiProps.props?.[key] ? {
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
                apiName: api,
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

        esbuild.buildSync({
            entryPoints: [`${props.commonLayerPath}/${props.migrationLayerPath}/migration.ts`],
            outfile: `${props.layerOutputDir}/${props.migrationLayerPath}/nodejs/migration.js`,
            bundle: true,
            minify: true,
            external: ["data-api-client", "aws-sdk", "aws-cdk-lib", "pepelaz", "pepelaz-db", "emigrator-ts", "@aws-sdk/client-rds-data", "sqlstring"],
            platform: "node",
            target: this.DEFAULT_RUNTIME_ESBUILD
        });

        const migrationLayer = this.versionedLayerFromPackage(
            props.migrationLayerPath!,
            { layerPath: props.layerOutputDir });

        const migrationLambdaFn = this.createInlineLambda(
            `${props.migrationLambdaName}-${props?.environment}`, `
                ${dbClientConnection}
                const pepelazDb=require('pepelaz-db');
                const emigrator=require('emigrator-ts');
                const migration=require('/opt/nodejs/migration').default;

                exports.handler = async(event,context) => {
                    const postgresRunner = emigrator.createPostgresRunner(dbClient);
                    return emigrator.createMigratorHandler().handle(migration,postgresRunner,event);                    
                }
            `,
            {
                ...defaultLambdaProps,
                description: `Lambda used for database schema migration`,
                extraLayers: [this.emigratorTsLayer, migrationLayer]
            });
        this.cluster.grantDataApiAccess(migrationLambdaFn);

        const customResourceProvider = new Provider(this, `migration-resource-provider-${props?.environment}`, {
            onEventHandler: migrationLambdaFn
        });
        const customResource = new CustomResource(this, `migration-resource-${props?.environment}`, {
            serviceToken: customResourceProvider.serviceToken,
            resourceType: "Custom::Migration",
            properties: {
                lastMigration: props.migration.lastMigration(),
                manualVersion: "20231210-2"
            }
        });
        customResource.node.addDependency(this.cluster);
    }
}
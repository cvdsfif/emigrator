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

export const db = () => require('data-api-client')({
    secretArn: process.env.SECRET_ARN,
    resourceArn: process.env.CLUSTER_ARN,
    database: process.env.DB_NAME
});


export interface MultistackProps extends StackProps {
    environment?: string
}

export interface ILambdaProps {
    description?: string,
    extraModules: string[],
    extraLayers: lambda.LayerVersion[]
}

export const defaultLambdaProps: Pick<ILambdaProps, ('extraLayers' | 'extraModules')> = {
    extraLayers: [],
    extraModules: []
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

export class MigratedDatabase extends Construct {
    readonly versionedLayerFromPackage: (packageName: string) => lambda.LayerVersion;
    readonly createLambda: (functionName: string, extraProps: ILambdaProps) => nodejs.NodejsFunction;

    readonly cluster: rds.ServerlessCluster;
    readonly awsSdkLayer: lambda.LayerVersion;
    readonly awsCdkLibLayer: lambda.LayerVersion;
    readonly dataApiLayer: lambda.LayerVersion;
    readonly emigratorTsLayer: lambda.LayerVersion;
    readonly constructsLayer: lambda.LayerVersion;

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
        this.dataApiLayer = this.versionedLayerFromPackage("data-api-client");
        this.emigratorTsLayer = this.versionedLayerFromPackage("emigrator-ts");
        this.constructsLayer = this.versionedLayerFromPackage("constructs");

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
                        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
                    },
                    bundling: {
                        sourceMap: true,
                        externalModules: [
                            'aws-sdk',
                            'data-api-client',
                            'emigrator-ts',
                            ...extraProps.extraModules
                        ]
                    },
                    layers: [
                        this.dataApiLayer, this.awsSdkLayer, this.emigratorTsLayer, this.awsCdkLibLayer,
                        ...extraProps.extraLayers
                    ],
                    ...extraProps
                });

        const migrationLambdaFn = this.createLambda(`${props.migrationLambdaName}`, {
            description: 'Lambda used for database schema migration',
            extraModules: ['constructs'],
            extraLayers: [this.constructsLayer]
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
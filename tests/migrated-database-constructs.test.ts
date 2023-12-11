import { App, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { integerField, stringField } from "pepelaz";
import { MigratedDatabase, MultistackProps, createEmigrator, defaultLambdaProps, migratedDatabaseDefaultProps } from "../src";
import { Match, Template } from "aws-cdk-lib/assertions";

describe("Test the correct migrated constructs building", () => {
    class TestedStack extends Stack {
        readonly migratedDatabase: MigratedDatabase;

        constructor(scope: Construct, id: string, props?: MultistackProps) {
            super(scope, id, props);

            this.migratedDatabase = new MigratedDatabase(this, "TestDatabase", {
                ...props,
                ...migratedDatabaseDefaultProps,
                databaseName: "TestName",
                migration: createEmigrator(),
                commonLayerPath: "tests/layers",
                migrationLayerPath: "migration"
            })
        }
    }

    let app: App;
    let stack: TestedStack;

    beforeEach(() => {
        app = new App();
        stack = new TestedStack(app, "TestedStack", { environment: "test" });
    });

    test("Should create an HTTP API connected to an inline layer interface and related AWS objects with extra lambda description", () => {
        const api = {
            callFunc: { arg: integerField(), ret: stringField() }
        }

        stack.migratedDatabase.connectLayerApis({ testApi: api }, {
            testApi: {
                cfnAlias: "TestApi",
                description: "Test API",
                props: {
                    callFunc: {
                        ...defaultLambdaProps,
                        description: "Extra description"
                    }
                }
            }
        }, {
            layerPath: "tests/layers",
            outDir: "tests/dist",
        });

        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
            "Name": "ProxyCorsHttpApi-TestApi-test",
            "CorsConfiguration": { "AllowMethods": ["*"], "AllowOrigins": ['*'], "AllowHeaders": ['*'] }
        });
        template.hasResourceProperties("AWS::Lambda::LayerVersion", {
            "CompatibleRuntimes": [stack.migratedDatabase.defaultRuntime]
        });
        template.hasResourceProperties("AWS::Lambda::Function",
            Match.objectLike({
                "Description": Match.stringLikeRegexp("Extra description"),
                "Layers": Match.arrayWith([{ "Ref": Match.stringLikeRegexp("TestApi") }])
            })
        );
    });

    test("Should create an HTTP API connected to an inline layer without extra lambda description and specific paths", () => {
        const api = {
            callFunc: { arg: integerField(), ret: stringField() }
        }

        stack.migratedDatabase.connectLayerApis({ testApi: api }, {
            testApi: {
                cfnAlias: "TestApi",
                description: "Test API",
            }
        });

        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
            "Name": "ProxyCorsHttpApi-TestApi-test",
            "CorsConfiguration": { "AllowMethods": ["*"], "AllowOrigins": ['*'], "AllowHeaders": ['*'] }
        });
        template.hasResourceProperties("AWS::Lambda::LayerVersion", {
            "CompatibleRuntimes": [stack.migratedDatabase.defaultRuntime]
        });
        template.hasResourceProperties("AWS::Lambda::Function",
            Match.objectLike({
                "Description": Match.stringLikeRegexp("callFunc"),
                "Layers": Match.arrayWith([{ "Ref": Match.stringLikeRegexp("TestApi") }])
            })
        );
    });

    test("Should create an HTTP API connected to an inline layer without any description and specific paths", () => {
        const api = {
            callFunc: { arg: integerField(), ret: stringField() }
        }

        stack.migratedDatabase.connectLayerApis({ testApi: api }, {
            testApi: {
                cfnAlias: "TestApi",
                props: {
                    callFunc: {
                        ...defaultLambdaProps
                    }
                }
            }
        });

        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
            "Name": "ProxyCorsHttpApi-TestApi-test",
            "CorsConfiguration": { "AllowMethods": ["*"], "AllowOrigins": ['*'], "AllowHeaders": ['*'] }
        });
        template.hasResourceProperties("AWS::Lambda::LayerVersion", {
            "CompatibleRuntimes": [stack.migratedDatabase.defaultRuntime]
        });
        template.hasResourceProperties("AWS::Lambda::Function",
            Match.objectLike({
                "Description": Match.stringLikeRegexp("callFunc"),
                "Layers": Match.arrayWith([{ "Ref": Match.stringLikeRegexp("TestApi") }])
            })
        );
    });

    test("Should connect an inline lambda function without any description", () => {
        stack.migratedDatabase.createInlineLambda("surs", "export.handler=async()=>{}", { ...defaultLambdaProps });

        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::Lambda::Function",
            Match.objectLike({
                "Description": Match.stringLikeRegexp("surs"),
                "Layers": Match.arrayWith([{ "Ref": Match.stringLikeRegexp("ApiLibraries") }])
            })
        );
    });
});
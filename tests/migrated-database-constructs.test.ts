import { App, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { integerField, stringField } from "pepelaz";
import { MigratedDatabase, MultistackProps, createEmigrator, migratedDatabaseDefaultProps } from "../src";
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
                migrationLayerPath: "tests/layers",
                migrationLambdaPath: "tests/"
            })
        }
    }

    let app: App;
    let stack: TestedStack;

    beforeEach(() => {
        app = new App();
        stack = new TestedStack(app, "TestedStack", { environment: "test" });
    });

    test("Should create an HTTP API connected to an interface", () => {
        const api = {
            callFunc: { arg: integerField(), ret: stringField() }
        }

        stack.migratedDatabase.defineApi({
            name: "TestApi",
            description: "Test API",
            definition: api,
            defaultDirectoryPrefix: "tests/",
            props: {}
        });

        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
            "Name": "ProxyCorsHttpApi-TestApi-test",
            "CorsConfiguration": { "AllowMethods": ["*"], "AllowOrigins": ['*'], "AllowHeaders": ['*'] }
        });
    });

    test("Should create an HTTP API connected to an inline layer interface and related AWS objects", () => {
        const api = {
            callFunc: { arg: integerField(), ret: stringField() }
        }

        stack.migratedDatabase.connectLayerApis({ testApi: api }, {
            testApi: {
                cfnAlias: "TestApi",
                description: "Test API",
                props: {}
            }
        }, { layerPath: "tests/layers", outDir: "tests/dist" });

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
                "Description": Match.stringLikeRegexp("Test API"),
                "Layers": Match.arrayWith([{ "Ref": Match.stringLikeRegexp("TestApi") }])
            })
        );
    });
});
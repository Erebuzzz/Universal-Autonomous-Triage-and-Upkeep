import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

const REPO_ROOT = path.join(__dirname, "../../..");
const API_ENTRY = path.join(REPO_ROOT, "apps/api/src/lambda-api.ts");
const WORKER_ENTRY = path.join(REPO_ROOT, "apps/api/src/lambda-worker.ts");
const FIXTURE_SEED = path.join(REPO_ROOT, "fixtures/demo-vulnerable");

/**
 * Least-privilege Ship It stack:
 * API Gateway HTTP API + Lambda API, SQS worker Lambda,
 * DynamoDB task/audit metadata, S3 artifacts, EventBridge bus,
 * CloudWatch log retention, CloudFront dashboard origin.
 * OpenSearch intentionally omitted until a vertical slice needs it.
 */
export class UatuShipItStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tasksTable = new dynamodb.Table(this, "TasksTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const artifactBucket = new s3.Bucket(this, "ArtifactBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const webBucket = new s3.Bucket(this, "WebBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const dlq = new sqs.Queue(this, "JobDlq", {
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const jobQueue = new sqs.Queue(this, "JobQueue", {
      visibilityTimeout: cdk.Duration.minutes(5),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    const bus = new events.EventBus(this, "UatuBus", {
      eventBusName: "uatu-shipit",
    });

    const sharedEnv = {
      TASKS_TABLE: tasksTable.tableName,
      ARTIFACT_BUCKET: artifactBucket.bucketName,
      JOB_QUEUE_URL: jobQueue.queueUrl,
      EVENT_BUS_NAME: bus.eventBusName,
      UATU_PASSIVE_MODE: "true",
      UATU_ASYNC_JOBS: "true",
      UATU_DATA_DIR: "/tmp/uatu-data",
    };

    const bundling = {
      minify: true,
      sourceMap: true,
      target: "node22",
      format: OutputFormat.CJS,
      mainFields: ["module", "main"],
      forceDockerBundling: false,
      // Bundle SDK; Node 22 Lambda runtime does not ship AWS SDK v3.
      externalModules: [] as string[],
      commandHooks: {
        beforeBundling(): string[] {
          return [];
        },
        beforeInstall(): string[] {
          return [];
        },
        afterBundling(_inputDir: string, outputDir: string): string[] {
          const seed = FIXTURE_SEED.replace(/\\/g, "/");
          const dest = path.join(outputDir, "fixture-seed").replace(/\\/g, "/");
          return [
            `node -e "require('fs').cpSync('${seed}','${dest}',{recursive:true})"`,
          ];
        },
      },
    };

    const apiFn = new NodejsFunction(this, "ApiFn", {
      entry: API_ENTRY,
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(29),
      memorySize: 512,
      environment: sharedEnv,
      bundling,
      projectRoot: REPO_ROOT,
      depsLockFilePath: path.join(REPO_ROOT, "package-lock.json"),
      logGroup: new logs.LogGroup(this, "ApiLogs", {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    const workerFn = new NodejsFunction(this, "WorkerFn", {
      entry: WORKER_ENTRY,
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: sharedEnv,
      bundling,
      projectRoot: REPO_ROOT,
      depsLockFilePath: path.join(REPO_ROOT, "package-lock.json"),
      logGroup: new logs.LogGroup(this, "WorkerLogs", {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    tasksTable.grantReadWriteData(apiFn);
    tasksTable.grantReadWriteData(workerFn);
    artifactBucket.grantReadWrite(apiFn);
    artifactBucket.grantReadWrite(workerFn);
    jobQueue.grantSendMessages(apiFn);
    jobQueue.grantConsumeMessages(workerFn);
    bus.grantPutEventsTo(apiFn);
    bus.grantPutEventsTo(workerFn);

    workerFn.addEventSource(new lambdaEventSources.SqsEventSource(jobQueue, { batchSize: 1 }));

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "uatu-api",
      description: "UATU Ship It HTTP API",
      corsPreflight: {
        allowHeaders: ["content-type"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: ["*"],
      },
    });

    const integration = new integrations.HttpLambdaIntegration("ApiIntegration", apiFn);
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration,
    });
    httpApi.addRoutes({
      path: "/health",
      methods: [apigwv2.HttpMethod.GET],
      integration,
    });

    const distribution = new cloudfront.Distribution(this, "WebDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "DashboardUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "TasksTableName", { value: tasksTable.tableName });
    new cdk.CfnOutput(this, "ArtifactBucketName", { value: artifactBucket.bucketName });
    new cdk.CfnOutput(this, "JobQueueUrl", { value: jobQueue.queueUrl });
    new cdk.CfnOutput(this, "WebBucketName", {
      value: webBucket.bucketName,
      description: "Upload apps/web/dist here after vite build (aws s3 sync)",
    });
  }
}

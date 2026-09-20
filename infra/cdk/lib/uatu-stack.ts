import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";

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

    const webOrigin = process.env.UATU_WEB_ORIGIN?.trim() || "https://uatu-beta.vercel.app";
    const sharedEnv: Record<string, string> = {
      TASKS_TABLE: tasksTable.tableName,
      ARTIFACT_BUCKET: artifactBucket.bucketName,
      JOB_QUEUE_URL: jobQueue.queueUrl,
      EVENT_BUS_NAME: bus.eventBusName,
      UATU_PASSIVE_MODE: "true",
      UATU_ASYNC_JOBS: "true",
      UATU_DATA_DIR: "/tmp/uatu-data",
      // Default fail-closed for deployed stacks; override explicitly for break-glass demos.
      UATU_AUTH_REQUIRED: process.env.UATU_AUTH_REQUIRED ?? "true",
      UATU_CORS_ORIGIN: webOrigin,
      UATU_CORS_CREDENTIALS: "true",
      UATU_WEB_ORIGIN: webOrigin,
      UATU_COOKIE_SECURE: "true",
      UATU_COOKIE_SAMESITE: "None",
      UATU_BEDROCK_ENABLED: process.env.UATU_BEDROCK_ENABLED ?? "true",
      UATU_BEDROCK_REGION: process.env.UATU_BEDROCK_REGION ?? "ap-south-1",
      UATU_BEDROCK_MODEL_ID: process.env.UATU_BEDROCK_MODEL_ID ?? "apac.amazon.nova-micro-v1:0",
      // git-lambda2 layer installs binaries under /opt/bin
      PATH: "/opt/bin:/usr/local/bin:/usr/bin:/bin",
      GIT_TEMPLATE_DIR: "/opt/share/git-core/templates",
      GIT_EXEC_PATH: "/opt/libexec/git-core",
    };

    if (process.env.UATU_GITHUB_APP_ID) {
      sharedEnv.UATU_GITHUB_APP_ID = process.env.UATU_GITHUB_APP_ID.trim();
    }
    if (process.env.UATU_GITHUB_APP_PRIVATE_KEY) {
      sharedEnv.UATU_GITHUB_APP_PRIVATE_KEY = process.env.UATU_GITHUB_APP_PRIVATE_KEY.trim();
    }
    if (process.env.UATU_GITHUB_OAUTH_CLIENT_ID) {
      sharedEnv.UATU_GITHUB_OAUTH_CLIENT_ID = process.env.UATU_GITHUB_OAUTH_CLIENT_ID.trim();
    }
    if (process.env.UATU_GITHUB_OAUTH_CLIENT_SECRET) {
      sharedEnv.UATU_GITHUB_OAUTH_CLIENT_SECRET = process.env.UATU_GITHUB_OAUTH_CLIENT_SECRET.trim();
    }
    if (process.env.UATU_GITHUB_OAUTH_CALLBACK_URL) {
      sharedEnv.UATU_GITHUB_OAUTH_CALLBACK_URL = process.env.UATU_GITHUB_OAUTH_CALLBACK_URL.trim();
    }
    if (process.env.UATU_GITHUB_WEBHOOK_SECRET) {
      sharedEnv.UATU_GITHUB_WEBHOOK_SECRET = process.env.UATU_GITHUB_WEBHOOK_SECRET.trim();
    }
    if (process.env.UATU_GITHUB_APP_INSTALLATION_ID) {
      sharedEnv.UATU_GITHUB_APP_INSTALLATION_ID = process.env.UATU_GITHUB_APP_INSTALLATION_ID.trim();
    }
    if (process.env.UATU_GITHUB_TOKEN) {
      sharedEnv.UATU_GITHUB_TOKEN = process.env.UATU_GITHUB_TOKEN.trim();
    }

    // Public lambci/git-lambda2 layer (Amazon Linux) so fixture + remediation git works in Lambda.
    const gitLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "GitLambdaLayer",
      `arn:aws:lambda:${this.region}:553035198032:layer:git-lambda2:8`,
    );

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
      layers: [gitLayer],
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
      layers: [gitLayer],
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

    const bedrockPolicy = new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: ["*"],
    });
    apiFn.addToRolePolicy(bedrockPolicy);
    workerFn.addToRolePolicy(bedrockPolicy);

    workerFn.addEventSource(new lambdaEventSources.SqsEventSource(jobQueue, { batchSize: 1 }));

    // Phase F: daily scheduled rescan -> SQS -> worker
    new events.Rule(this, "DailyRescanRule", {
      schedule: events.Schedule.rate(cdk.Duration.hours(24)),
      description: "UATU daily dependency/security rescan of authorized grants",
      targets: [
        new targets.SqsQueue(jobQueue, {
          message: events.RuleTargetInput.fromObject({ type: "scheduled_rescan" }),
        }),
      ],
    });

    const allowedOrigins = [
      webOrigin,
      "https://uatu-beta.vercel.app",
      "https://uatu-qrmdac7aa-unstable-kernel.vercel.app",
      "http://localhost:5173",
    ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "uatu-api",
      description: "UATU Ship It HTTP API (auth/status/enqueue; heavy work on SQS worker)",
      corsPreflight: {
        allowHeaders: ["content-type", "cookie", "authorization"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: allowedOrigins,
        allowCredentials: true,
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

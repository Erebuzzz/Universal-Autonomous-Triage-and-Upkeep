import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type {
  AuditEvent,
  AuthorizationGrant,
  BrainGraph,
  RemediationTask,
} from "@uatu/domain";
import type {
  ArtifactStore,
  AuditStore,
  BrainStore,
  GrantStore,
  TaskStore,
} from "@uatu/core";

export interface CloudStoreConfig {
  tableName: string;
  bucketName: string;
  region?: string;
}

function docClient(region?: string): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient(region ? { region } : {}),
    { marshallOptions: { removeUndefinedValues: true } },
  );
}

/**
 * DynamoDB + S3 persistence for Lambda / Ship It deploy.
 * Keys: pk/sk string pairs (TASK#id / META, GRANT#id / META, BRAIN#repo / META, AUDIT / ALL).
 */
export class CloudUatuStore
  implements TaskStore, GrantStore, BrainStore, AuditStore, ArtifactStore
{
  private readonly ddb: DynamoDBDocumentClient;
  private readonly s3: S3Client;
  private readonly tableName: string;
  private readonly bucketName: string;

  constructor(config: CloudStoreConfig) {
    this.tableName = config.tableName;
    this.bucketName = config.bucketName;
    this.ddb = docClient(config.region);
    this.s3 = new S3Client(config.region ? { region: config.region } : {});
  }

  async saveTask(task: RemediationTask): Promise<void> {
    await this.ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: `TASK#${task.id}`, sk: "META", entityType: "task", ...task },
      }),
    );
  }

  async getTask(id: string): Promise<RemediationTask | undefined> {
    const res = await this.ddb.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: `TASK#${id}`, sk: "META" } }),
    );
    return res.Item ? (stripKeys(res.Item) as unknown as RemediationTask) : undefined;
  }

  async listTasks(): Promise<RemediationTask[]> {
    const res = await this.ddb.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "entityType = :t",
        ExpressionAttributeValues: { ":t": "task" },
      }),
    );
    const tasks = (res.Items ?? []).map((i) => stripKeys(i) as unknown as RemediationTask);
    return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveGrant(grant: AuthorizationGrant): Promise<void> {
    await this.ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: `GRANT#${grant.id}`, sk: "META", entityType: "grant", ...grant },
      }),
    );
  }

  async getGrant(id: string): Promise<AuthorizationGrant | undefined> {
    const res = await this.ddb.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: `GRANT#${id}`, sk: "META" } }),
    );
    return res.Item ? (stripKeys(res.Item) as unknown as AuthorizationGrant) : undefined;
  }

  async listGrants(): Promise<AuthorizationGrant[]> {
    const res = await this.ddb.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "entityType = :t",
        ExpressionAttributeValues: { ":t": "grant" },
      }),
    );
    return (res.Items ?? []).map((i) => stripKeys(i) as unknown as AuthorizationGrant);
  }

  async saveBrain(graph: BrainGraph): Promise<void> {
    const tenant = graph.userId ? `TENANT#${graph.userId}` : "TENANT#shared";
    await this.ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: `${tenant}#BRAIN#${graph.repositoryId}`,
          sk: "META",
          entityType: "brain",
          ...graph,
        },
      }),
    );
  }

  async getBrain(repositoryId: string, userId?: string): Promise<BrainGraph | undefined> {
    const tenant = userId ? `TENANT#${userId}` : "TENANT#shared";
    const res = await this.ddb.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `${tenant}#BRAIN#${repositoryId}`, sk: "META" },
      }),
    );
    if (res.Item) return stripKeys(res.Item) as unknown as BrainGraph;
    // Legacy unscoped key (pre-tenant): only when no userId partition requested.
    if (!userId) {
      const legacy = await this.ddb.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { pk: `BRAIN#${repositoryId}`, sk: "META" },
        }),
      );
      return legacy.Item ? (stripKeys(legacy.Item) as unknown as BrainGraph) : undefined;
    }
    return undefined;
  }

  async saveEvents(events: AuditEvent[]): Promise<void> {
    await this.ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: "AUDIT", sk: "ALL", entityType: "audit", events },
      }),
    );
  }

  async loadEvents(): Promise<AuditEvent[]> {
    const res = await this.ddb.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: "AUDIT", sk: "ALL" } }),
    );
    const events = res.Item?.events;
    return Array.isArray(events) ? (events as AuditEvent[]) : [];
  }

  async put(key: string, body: string | Buffer, contentType = "text/plain"): Promise<string> {
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: safe,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `s3://${this.bucketName}/${safe}`;
  }

  async get(key: string): Promise<Buffer | undefined> {
    try {
      const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: safe }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : undefined;
    } catch {
      return undefined;
    }
  }
}

function stripKeys(item: Record<string, unknown>): Record<string, unknown> {
  const { pk: _pk, sk: _sk, entityType: _et, ...rest } = item;
  return rest;
}

package com.logscan.lambda;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.logscan.lambda.detector.BedrockThreatDetector;
import com.logscan.lambda.detector.MockThreatDetector;
import com.logscan.lambda.detector.ThreatDetector;
import com.logscan.lambda.model.ScanResult;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;

public class ThreatDetectionHandler implements RequestHandler<SQSEvent, Void> {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String TABLE_NAME = System.getenv("FILES_TABLE_NAME");
    private static final String DETECTOR_TYPE = System.getenv("DETECTOR_TYPE") != null ? System.getenv("DETECTOR_TYPE") : "MOCK";
    private static final String BEDROCK_MODEL_ID = System.getenv("BEDROCK_MODEL_ID") != null ? System.getenv("BEDROCK_MODEL_ID") : "anthropic.claude-3-haiku-20240307-v1:0";

    private final DynamoDbClient dynamoDb;
    private final S3Client s3Client;
    private final ThreatDetector detector;

    public ThreatDetectionHandler() {
        this.dynamoDb = DynamoDbClient.create();
        this.s3Client = S3Client.create();
        this.detector = createDetector();
    }

    // For testing
    ThreatDetectionHandler(DynamoDbClient dynamoDb, S3Client s3Client, ThreatDetector detector) {
        this.dynamoDb = dynamoDb;
        this.s3Client = s3Client;
        this.detector = detector;
    }

    private ThreatDetector createDetector() {
        if ("BEDROCK".equalsIgnoreCase(DETECTOR_TYPE)) {
            BedrockRuntimeClient bedrockClient = BedrockRuntimeClient.create();
            return new BedrockThreatDetector(bedrockClient, BEDROCK_MODEL_ID);
        }
        return new MockThreatDetector();
    }

    @Override
    public Void handleRequest(SQSEvent event, Context context) {
        for (SQSEvent.SQSMessage message : event.getRecords()) {
            processMessage(message, context);
        }
        return null;
    }

    private void processMessage(SQSEvent.SQSMessage message, Context context) {
        String bucketName;
        String objectKey;

        try {
            JsonNode s3Event = MAPPER.readTree(message.getBody());
            JsonNode records = s3Event.get("Records");
            if (records == null || records.isEmpty()) {
                context.getLogger().log("No S3 records in SQS message, skipping.");
                return;
            }

            JsonNode record = records.get(0);
            bucketName = record.at("/s3/bucket/name").asText();
            objectKey = URLDecoder.decode(record.at("/s3/object/key").asText(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            context.getLogger().log("Failed to parse S3 event: " + e.getMessage());
            throw new RuntimeException("Failed to parse S3 event", e);
        }

        if (!objectKey.startsWith("uploads/")) {
            context.getLogger().log("Ignoring key not under uploads/: " + objectKey);
            return;
        }

        // Parse key: uploads/{ownerUserId}/{fileId}/{fileName}
        String[] parts = objectKey.split("/", 4);
        if (parts.length < 4) {
            context.getLogger().log("Invalid key format: " + objectKey);
            return;
        }

        String ownerUserId = parts[1];
        String fileId = parts[2];

        Map<String, AttributeValue> key = Map.of(
                "ownerUserId", AttributeValue.fromS(ownerUserId),
                "fileId", AttributeValue.fromS(fileId)
        );

        // Lookup DynamoDB item
        GetItemResponse getResp = dynamoDb.getItem(GetItemRequest.builder()
                .tableName(TABLE_NAME)
                .key(key)
                .build());

        if (!getResp.hasItem() || getResp.item().isEmpty()) {
            context.getLogger().log("No DynamoDB metadata for " + ownerUserId + "/" + fileId + ", skipping.");
            return;
        }

        String status = getResp.item().get("status").s();
        if ("COMPLETED".equals(status)) {
            context.getLogger().log("Already COMPLETED for " + fileId + ", skipping (idempotent).");
            return;
        }

        try {
            // Download file
            InputStream inputStream = s3Client.getObject(GetObjectRequest.builder()
                    .bucket(bucketName)
                    .key(objectKey)
                    .build());

            String content = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);

            // Analyze
            ScanResult result = detector.analyze(content);

            // Update DynamoDB - COMPLETED
            String findingsJson = MAPPER.writeValueAsString(result.getFindings());
            String now = Instant.now().toString();

            dynamoDb.updateItem(UpdateItemRequest.builder()
                    .tableName(TABLE_NAME)
                    .key(key)
                    .updateExpression("SET #s = :s, threatLevel = :tl, summary = :sum, findingsJson = :fj, scannedAt = :sa, updatedAt = :ua")
                    .expressionAttributeNames(Map.of("#s", "status"))
                    .expressionAttributeValues(Map.of(
                            ":s", AttributeValue.fromS("COMPLETED"),
                            ":tl", AttributeValue.fromS(result.getThreatLevel()),
                            ":sum", AttributeValue.fromS(result.getSummary()),
                            ":fj", AttributeValue.fromS(findingsJson),
                            ":sa", AttributeValue.fromS(result.getScannedAt()),
                            ":ua", AttributeValue.fromS(now)
                    ))
                    .build());

            context.getLogger().log("Scan completed for " + fileId + ": " + result.getThreatLevel());

        } catch (Exception e) {
            context.getLogger().log("Scan failed for " + fileId + ": " + e.getMessage());

            // Update status to FAILED
            try {
                dynamoDb.updateItem(UpdateItemRequest.builder()
                        .tableName(TABLE_NAME)
                        .key(key)
                        .updateExpression("SET #s = :s, updatedAt = :ua")
                        .expressionAttributeNames(Map.of("#s", "status"))
                        .expressionAttributeValues(Map.of(
                                ":s", AttributeValue.fromS("FAILED"),
                                ":ua", AttributeValue.fromS(Instant.now().toString())
                        ))
                        .build());
            } catch (Exception updateErr) {
                context.getLogger().log("Failed to update status to FAILED: " + updateErr.getMessage());
            }

            throw new RuntimeException("Scan failed for " + fileId, e);
        }
    }
}

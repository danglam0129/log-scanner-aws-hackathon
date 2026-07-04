package com.logscan.lambda;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import com.logscan.lambda.detector.MockThreatDetector;
import com.logscan.lambda.detector.ThreatDetector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.*;

class ThreatDetectionHandlerTest {

    private StubDynamoDb stubDynamoDb;
    private StubS3 stubS3;
    private ThreatDetector detector;
    private ThreatDetectionHandler handler;
    private Context mockContext;

    @BeforeEach
    void setUp() {
        stubDynamoDb = new StubDynamoDb();
        stubS3 = new StubS3();
        detector = new MockThreatDetector();
        handler = new ThreatDetectionHandler(stubDynamoDb, stubS3, detector);
        mockContext = new TestContext();
    }

    private SQSEvent buildSqsEvent(String body) {
        SQSEvent event = new SQSEvent();
        SQSEvent.SQSMessage msg = new SQSEvent.SQSMessage();
        msg.setBody(body);
        event.setRecords(List.of(msg));
        return event;
    }

    private String buildS3EventJson(String bucket, String... keys) {
        StringBuilder records = new StringBuilder("[");
        for (int i = 0; i < keys.length; i++) {
            if (i > 0) records.append(",");
            records.append(String.format(
                    "{\"s3\":{\"bucket\":{\"name\":\"%s\"},\"object\":{\"key\":\"%s\"}}}",
                    bucket, keys[i]));
        }
        records.append("]");
        return "{\"Records\":" + records + "}";
    }

    @Test
    void processesS3ObjectSuccessfully() {
        stubDynamoDb.itemToReturn = makeItem("PENDING");
        stubS3.contentToReturn = "INFO normal log line\nERROR SQL injection attempt detected";

        String s3Event = buildS3EventJson("my-bucket", "uploads/anonymous/file-123/test.log");
        handler.handleRequest(buildSqsEvent(s3Event), mockContext);

        assertEquals(1, stubDynamoDb.updateCount);
        assertTrue(stubDynamoDb.lastUpdateExpression.contains("COMPLETED") ||
                   stubDynamoDb.lastUpdateValues.containsValue(AttributeValue.fromS("COMPLETED")));
    }

    @Test
    void skipsAlreadyCompletedItems() {
        stubDynamoDb.itemToReturn = makeItem("COMPLETED");

        String s3Event = buildS3EventJson("my-bucket", "uploads/anonymous/file-123/test.log");
        handler.handleRequest(buildSqsEvent(s3Event), mockContext);

        // Should not download from S3
        assertEquals(0, stubS3.getObjectCount);
    }

    @Test
    void skipsKeysNotUnderUploads() {
        String s3Event = buildS3EventJson("my-bucket", "other-prefix/file.log");
        handler.handleRequest(buildSqsEvent(s3Event), mockContext);

        // Should not touch DynamoDB
        assertEquals(0, stubDynamoDb.getItemCount);
    }

    @Test
    void processesMultipleS3RecordsInOneEvent() {
        stubDynamoDb.itemToReturn = makeItem("PENDING");
        stubS3.contentToReturn = "clean log content";

        // S3 event with TWO records
        String s3Event = buildS3EventJson("my-bucket",
                "uploads/anonymous/file-111/a.log",
                "uploads/anonymous/file-222/b.log");
        handler.handleRequest(buildSqsEvent(s3Event), mockContext);

        // Should process both records
        assertEquals(2, stubDynamoDb.getItemCount);
        assertEquals(2, stubDynamoDb.updateCount);
        assertEquals(2, stubS3.getObjectCount);
    }

    @Test
    void skipsRecordsWithNoMetadata() {
        stubDynamoDb.itemToReturn = Collections.emptyMap();

        String s3Event = buildS3EventJson("my-bucket", "uploads/anonymous/file-999/test.log");
        handler.handleRequest(buildSqsEvent(s3Event), mockContext);

        assertEquals(0, stubS3.getObjectCount);
    }

    private Map<String, AttributeValue> makeItem(String status) {
        Map<String, AttributeValue> item = new HashMap<>();
        item.put("ownerUserId", AttributeValue.fromS("anonymous"));
        item.put("fileId", AttributeValue.fromS("file-123"));
        item.put("status", AttributeValue.fromS(status));
        return item;
    }

    // ─── Stub implementations ──────────────────────────────────────────────

    static class StubDynamoDb implements DynamoDbClient {
        Map<String, AttributeValue> itemToReturn = new HashMap<>();
        int getItemCount = 0;
        int updateCount = 0;
        String lastUpdateExpression;
        Map<String, AttributeValue> lastUpdateValues;

        @Override
        public GetItemResponse getItem(GetItemRequest request) {
            getItemCount++;
            return GetItemResponse.builder().item(itemToReturn).build();
        }

        @Override
        public GetItemResponse getItem(Consumer<GetItemRequest.Builder> request) {
            GetItemRequest.Builder b = GetItemRequest.builder();
            request.accept(b);
            return getItem(b.build());
        }

        @Override
        public UpdateItemResponse updateItem(UpdateItemRequest request) {
            updateCount++;
            lastUpdateExpression = request.updateExpression();
            lastUpdateValues = request.expressionAttributeValues();
            return UpdateItemResponse.builder().build();
        }

        @Override
        public UpdateItemResponse updateItem(Consumer<UpdateItemRequest.Builder> request) {
            UpdateItemRequest.Builder b = UpdateItemRequest.builder();
            request.accept(b);
            return updateItem(b.build());
        }

        @Override public String serviceName() { return "dynamodb"; }
        @Override public void close() {}
    }

    static class StubS3 implements S3Client {
        String contentToReturn = "";
        int getObjectCount = 0;

        @Override
        @SuppressWarnings("unchecked")
        public ResponseInputStream<GetObjectResponse> getObject(GetObjectRequest request) {
            getObjectCount++;
            byte[] bytes = contentToReturn.getBytes(StandardCharsets.UTF_8);
            return new ResponseInputStream<>(
                    GetObjectResponse.builder().build(),
                    AbortableInputStream.create(new ByteArrayInputStream(bytes))
            );
        }

        @Override
        public ResponseInputStream<GetObjectResponse> getObject(Consumer<GetObjectRequest.Builder> request) {
            GetObjectRequest.Builder b = GetObjectRequest.builder();
            request.accept(b);
            return getObject(b.build());
        }

        @Override public String serviceName() { return "s3"; }
        @Override public void close() {}
    }

    static class TestContext implements Context {
        public String getAwsRequestId() { return "test-id"; }
        public String getLogGroupName() { return "test"; }
        public String getLogStreamName() { return "test"; }
        public String getFunctionName() { return "test"; }
        public String getFunctionVersion() { return "1"; }
        public String getInvokedFunctionArn() { return "arn"; }
        public com.amazonaws.services.lambda.runtime.CognitoIdentity getIdentity() { return null; }
        public com.amazonaws.services.lambda.runtime.ClientContext getClientContext() { return null; }
        public int getRemainingTimeInMillis() { return 10000; }
        public int getMemoryLimitInMB() { return 512; }
        public LambdaLogger getLogger() {
            return new LambdaLogger() {
                public void log(String message) { System.out.println(message); }
                public void log(byte[] message) { System.out.println(new String(message)); }
            };
        }
    }
}

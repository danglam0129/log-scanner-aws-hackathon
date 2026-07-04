package com.logscan.lambda;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

public class ApiHandler implements RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String TABLE_NAME = System.getenv("FILES_TABLE_NAME");
    private static final String BUCKET_NAME = System.getenv("S3_BUCKET_NAME");
    private static final String ALLOWED_ORIGINS = System.getenv("CORS_ALLOWED_ORIGINS");
    private static final long MAX_FILE_SIZE = 10L * 1024 * 1024;

    private final DynamoDbClient dynamoDb;
    private final S3Presigner s3Presigner;

    public ApiHandler() {
        this.dynamoDb = DynamoDbClient.create();
        this.s3Presigner = S3Presigner.create();
    }

    // For testing
    ApiHandler(DynamoDbClient dynamoDb, S3Presigner s3Presigner) {
        this.dynamoDb = dynamoDb;
        this.s3Presigner = s3Presigner;
    }

    @Override
    public APIGatewayV2HTTPResponse handleRequest(APIGatewayV2HTTPEvent event, Context context) {
        String method = event.getRequestContext().getHttp().getMethod();
        String path = event.getRawPath();
        Map<String, String> pathParams = event.getPathParameters();

        try {
            // Health check — versioned + legacy alias
            if ("GET".equals(method) && ("/api/v1/health".equals(path) || "/api/health".equals(path))) {
                return ok(Map.of("status", "UP"));
            }

            String ownerUserId = resolveOwner(event);

            if ("POST".equals(method) && "/api/v1/files".equals(path)) {
                return handleCreateFile(event, ownerUserId);
            }

            if ("POST".equals(method) && path.matches("/api/v1/files/[^/]+/confirm")) {
                String fileId = pathParams != null ? pathParams.get("fileId") : null;
                return handleConfirmUpload(fileId, ownerUserId);
            }

            if ("GET".equals(method) && "/api/v1/files".equals(path)) {
                return handleListFiles(ownerUserId);
            }

            if ("GET".equals(method) && path.matches("/api/v1/files/[^/]+/result")) {
                String fileId = pathParams != null ? pathParams.get("fileId") : null;
                return handleGetResult(fileId, ownerUserId);
            }

            return buildResponse(404, Map.of("error", "NOT_FOUND", "message", "Route not found."));
        } catch (Exception e) {
            context.getLogger().log("Error: " + e.getMessage());
            try {
                return buildResponse(500, Map.of("error", "INTERNAL_ERROR", "message", "An internal error occurred."));
            } catch (Exception ex) {
                return APIGatewayV2HTTPResponse.builder().withStatusCode(500).withBody("{\"error\":\"INTERNAL_ERROR\"}").build();
            }
        }
    }

    private APIGatewayV2HTTPResponse handleCreateFile(APIGatewayV2HTTPEvent event, String ownerUserId) throws Exception {
        Map<String, Object> body = MAPPER.readValue(event.getBody(), Map.class);
        String fileName = (String) body.get("fileName");
        Number fileSizeNum = (Number) body.get("fileSize");

        if (fileName == null || fileName.isBlank()) {
            return error(400, "FILE_NAME_REQUIRED", "fileName is required and must not be blank.");
        }
        if (fileSizeNum == null) {
            return error(400, "FILE_SIZE_REQUIRED", "fileSize is required.");
        }
        long fileSize = fileSizeNum.longValue();
        if (fileSize < 1 || fileSize > MAX_FILE_SIZE) {
            return error(400, "FILE_SIZE_INVALID", "File size must be between 1 byte and 10 MB.");
        }

        String fileId = UUID.randomUUID().toString();
        String safeFileName = fileName.replaceAll("[^a-zA-Z0-9._\\-]", "_");
        String s3Key = String.format("uploads/%s/%s/%s", ownerUserId, fileId, safeFileName);
        String now = Instant.now().toString();

        // Generate presigned URL
        PutObjectRequest putReq = PutObjectRequest.builder()
                .bucket(BUCKET_NAME)
                .key(s3Key)
                .contentType("application/octet-stream")
                .build();

        var presignReq = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(15))
                .putObjectRequest(putReq)
                .build();

        String uploadUrl = s3Presigner.presignPutObject(presignReq).url().toString();

        // Create DynamoDB item
        Map<String, AttributeValue> item = new HashMap<>();
        item.put("ownerUserId", AttributeValue.fromS(ownerUserId));
        item.put("fileId", AttributeValue.fromS(fileId));
        item.put("fileName", AttributeValue.fromS(fileName));
        item.put("fileSize", AttributeValue.fromN(String.valueOf(fileSize)));
        item.put("s3Bucket", AttributeValue.fromS(BUCKET_NAME));
        item.put("s3Key", AttributeValue.fromS(s3Key));
        item.put("status", AttributeValue.fromS("UPLOAD_PENDING"));
        item.put("uploadedAt", AttributeValue.fromS(now));
        item.put("updatedAt", AttributeValue.fromS(now));

        dynamoDb.putItem(PutItemRequest.builder()
                .tableName(TABLE_NAME)
                .item(item)
                .build());

        return ok(Map.of("fileId", fileId, "uploadUrl", uploadUrl, "expiresIn", 900));
    }

    private APIGatewayV2HTTPResponse handleConfirmUpload(String fileId, String ownerUserId) throws Exception {
        if (fileId == null || fileId.isBlank()) {
            return error(400, "FILE_ID_REQUIRED", "fileId is required.");
        }

        Map<String, AttributeValue> key = Map.of(
                "ownerUserId", AttributeValue.fromS(ownerUserId),
                "fileId", AttributeValue.fromS(fileId)
        );

        GetItemResponse getResp = dynamoDb.getItem(GetItemRequest.builder()
                .tableName(TABLE_NAME)
                .key(key)
                .build());

        if (!getResp.hasItem() || getResp.item().isEmpty()) {
            return error(404, "NOT_FOUND", "File not found.");
        }

        Map<String, AttributeValue> item = getResp.item();
        String status = item.get("status").s();

        if ("UPLOAD_PENDING".equals(status)) {
            dynamoDb.updateItem(UpdateItemRequest.builder()
                    .tableName(TABLE_NAME)
                    .key(key)
                    .updateExpression("SET #s = :s, updatedAt = :u")
                    .expressionAttributeNames(Map.of("#s", "status"))
                    .expressionAttributeValues(Map.of(
                            ":s", AttributeValue.fromS("PENDING"),
                            ":u", AttributeValue.fromS(Instant.now().toString())
                    ))
                    .build());
            status = "PENDING";
        }

        return ok(Map.of(
                "fileId", fileId,
                "fileName", item.get("fileName").s(),
                "fileSize", Long.parseLong(item.get("fileSize").n()),
                "status", status,
                "uploadedAt", item.get("uploadedAt").s()
        ));
    }

    private APIGatewayV2HTTPResponse handleListFiles(String ownerUserId) throws Exception {
        QueryResponse queryResp = dynamoDb.query(QueryRequest.builder()
                .tableName(TABLE_NAME)
                .keyConditionExpression("ownerUserId = :owner")
                .expressionAttributeValues(Map.of(":owner", AttributeValue.fromS(ownerUserId)))
                .build());

        List<Map<String, Object>> files = queryResp.items().stream()
                .map(item -> {
                    Map<String, Object> f = new HashMap<>();
                    f.put("fileId", item.get("fileId").s());
                    f.put("fileName", item.get("fileName").s());
                    f.put("fileSize", Long.parseLong(item.get("fileSize").n()));
                    f.put("status", item.get("status").s());
                    f.put("uploadedAt", item.get("uploadedAt").s());
                    return f;
                })
                .sorted((a, b) -> ((String) b.get("uploadedAt")).compareTo((String) a.get("uploadedAt")))
                .collect(Collectors.toList());

        return ok(Map.of("files", files));
    }

    private APIGatewayV2HTTPResponse handleGetResult(String fileId, String ownerUserId) throws Exception {
        if (fileId == null || fileId.isBlank()) {
            return error(400, "FILE_ID_REQUIRED", "fileId is required.");
        }

        Map<String, AttributeValue> key = Map.of(
                "ownerUserId", AttributeValue.fromS(ownerUserId),
                "fileId", AttributeValue.fromS(fileId)
        );

        GetItemResponse getResp = dynamoDb.getItem(GetItemRequest.builder()
                .tableName(TABLE_NAME)
                .key(key)
                .build());

        if (!getResp.hasItem() || getResp.item().isEmpty()) {
            return error(404, "NOT_FOUND", "File not found.");
        }

        Map<String, AttributeValue> item = getResp.item();
        String status = item.get("status").s();

        if (!"COMPLETED".equals(status)) {
            return error(409, "NOT_COMPLETED", "Scan is not yet completed. Current status: " + status);
        }

        Map<String, Object> scanResult = new HashMap<>();
        scanResult.put("threatLevel", getStringAttr(item, "threatLevel"));
        scanResult.put("summary", getStringAttr(item, "summary"));
        scanResult.put("scannedAt", getStringAttr(item, "scannedAt"));

        String findingsJson = getStringAttr(item, "findingsJson");
        if (findingsJson != null && !findingsJson.isEmpty()) {
            scanResult.put("findings", MAPPER.readValue(findingsJson, List.class));
        } else {
            scanResult.put("findings", List.of());
        }

        return ok(Map.of(
                "fileId", fileId,
                "fileName", item.get("fileName").s(),
                "scanResult", scanResult
        ));
    }

    private String resolveOwner(APIGatewayV2HTTPEvent event) {
        try {
            var authorizer = event.getRequestContext().getAuthorizer();
            if (authorizer != null && authorizer.getJwt() != null) {
                Map<String, String> claims = authorizer.getJwt().getClaims();
                if (claims != null && claims.containsKey("sub")) {
                    return claims.get("sub");
                }
            }
        } catch (Exception ignored) {}
        return "anonymous";
    }

    private String getStringAttr(Map<String, AttributeValue> item, String attr) {
        AttributeValue val = item.get(attr);
        return val != null ? val.s() : null;
    }

    private APIGatewayV2HTTPResponse ok(Object body) throws Exception {
        return buildResponse(200, body);
    }

    private APIGatewayV2HTTPResponse error(int statusCode, String code, String message) throws Exception {
        return buildResponse(statusCode, Map.of("error", code, "message", message));
    }

    private APIGatewayV2HTTPResponse buildResponse(int statusCode, Object body) throws Exception {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        headers.put("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if (ALLOWED_ORIGINS != null) {
            // For simplicity, return the first origin. In production, match against request Origin.
            String[] origins = ALLOWED_ORIGINS.split(",");
            if (origins.length > 0) {
                headers.put("Access-Control-Allow-Origin", origins[0].trim());
            }
        }

        return APIGatewayV2HTTPResponse.builder()
                .withStatusCode(statusCode)
                .withHeaders(headers)
                .withBody(MAPPER.writeValueAsString(body))
                .build();
    }
}

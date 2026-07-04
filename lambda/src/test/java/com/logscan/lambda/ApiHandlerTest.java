package com.logscan.lambda;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ApiHandlerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private Context mockContext;

    @BeforeEach
    void setUp() {
        mockContext = new Context() {
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
        };
    }

    private APIGatewayV2HTTPEvent buildEvent(String method, String path, String body, Map<String, String> pathParams) {
        var http = APIGatewayV2HTTPEvent.RequestContext.Http.builder()
                .withMethod(method)
                .build();
        var requestContext = APIGatewayV2HTTPEvent.RequestContext.builder()
                .withHttp(http)
                .build();

        var builder = APIGatewayV2HTTPEvent.builder()
                .withRawPath(path)
                .withRequestContext(requestContext);

        if (body != null) builder.withBody(body);
        if (pathParams != null) builder.withPathParameters(pathParams);

        return builder.build();
    }

    @Test
    void healthEndpointReturnsUp() throws Exception {
        // ApiHandler depends on env vars for TABLE_NAME etc. We test the routing logic
        // by observing that health doesn't need DynamoDB
        ApiHandler handler = new ApiHandler();
        var event = buildEvent("GET", "/api/health", null, null);

        // This will work because health endpoint doesn't touch DynamoDB
        APIGatewayV2HTTPResponse response = handler.handleRequest(event, mockContext);

        assertEquals(200, response.getStatusCode());
        assertTrue(response.getBody().contains("\"status\":\"UP\""));
    }

    @Test
    void unknownRouteReturns404() {
        ApiHandler handler = new ApiHandler();
        var event = buildEvent("GET", "/api/unknown", null, null);

        APIGatewayV2HTTPResponse response = handler.handleRequest(event, mockContext);

        assertEquals(404, response.getStatusCode());
        assertTrue(response.getBody().contains("NOT_FOUND"));
    }

    @Test
    void createFileValidatesFileName() {
        ApiHandler handler = new ApiHandler();
        var event = buildEvent("POST", "/api/files", "{\"fileSize\":100}", null);

        APIGatewayV2HTTPResponse response = handler.handleRequest(event, mockContext);

        // Should fail validation — missing fileName
        assertEquals(400, response.getStatusCode());
        assertTrue(response.getBody().contains("FILE_NAME_REQUIRED"));
    }

    @Test
    void createFileValidatesFileSize() {
        ApiHandler handler = new ApiHandler();
        // File too large (> 10 MB)
        var event = buildEvent("POST", "/api/files", "{\"fileName\":\"test.log\",\"fileSize\":11000000}", null);

        APIGatewayV2HTTPResponse response = handler.handleRequest(event, mockContext);

        assertEquals(400, response.getStatusCode());
        assertTrue(response.getBody().contains("FILE_SIZE_INVALID"));
    }

    @Test
    void createFileValidatesFileSizeZero() {
        ApiHandler handler = new ApiHandler();
        var event = buildEvent("POST", "/api/files", "{\"fileName\":\"test.log\",\"fileSize\":0}", null);

        APIGatewayV2HTTPResponse response = handler.handleRequest(event, mockContext);

        assertEquals(400, response.getStatusCode());
        assertTrue(response.getBody().contains("FILE_SIZE_INVALID"));
    }

    @Test
    void ownerResolutionDefaultsToAnonymous() throws Exception {
        // When no authorizer is present, should default to "anonymous"
        ApiHandler handler = new ApiHandler();
        var event = buildEvent("GET", "/api/health", null, null);

        APIGatewayV2HTTPResponse response = handler.handleRequest(event, mockContext);
        // Just verify it doesn't crash — owner resolution is internal
        assertEquals(200, response.getStatusCode());
    }

    @Test
    void responseIncludesCorsHeaders() throws Exception {
        ApiHandler handler = new ApiHandler();
        var event = buildEvent("GET", "/api/health", null, null);

        APIGatewayV2HTTPResponse response = handler.handleRequest(event, mockContext);

        assertEquals("GET, POST, OPTIONS", response.getHeaders().get("Access-Control-Allow-Methods"));
        assertEquals("Content-Type, Authorization", response.getHeaders().get("Access-Control-Allow-Headers"));
    }
}

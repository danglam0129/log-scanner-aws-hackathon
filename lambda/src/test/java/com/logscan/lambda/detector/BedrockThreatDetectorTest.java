package com.logscan.lambda.detector;

import com.logscan.lambda.model.ScanResult;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelRequest;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelResponse;
import software.amazon.awssdk.services.bedrockruntime.model.BedrockRuntimeException;

import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.*;

class BedrockThreatDetectorTest {

    /**
     * Simple stub implementation of BedrockRuntimeClient for testing.
     */
    private static BedrockRuntimeClient stubClient(String responseBody) {
        return new StubBedrockClient(responseBody, null);
    }

    private static BedrockRuntimeClient throwingClient(RuntimeException ex) {
        return new StubBedrockClient(null, ex);
    }

    // Minimal stub for BedrockRuntimeClient
    private static class StubBedrockClient implements BedrockRuntimeClient {
        private final String responseBody;
        private final RuntimeException exception;

        StubBedrockClient(String responseBody, RuntimeException exception) {
            this.responseBody = responseBody;
            this.exception = exception;
        }

        @Override
        public InvokeModelResponse invokeModel(InvokeModelRequest request) {
            if (exception != null) throw exception;
            return InvokeModelResponse.builder()
                    .body(SdkBytes.fromUtf8String(responseBody))
                    .build();
        }

        @Override
        public InvokeModelResponse invokeModel(Consumer<InvokeModelRequest.Builder> request) {
            InvokeModelRequest.Builder builder = InvokeModelRequest.builder();
            request.accept(builder);
            return invokeModel(builder.build());
        }

        @Override
        public String serviceName() { return "bedrockruntime"; }

        @Override
        public void close() {}
    }

    @Test
    void parsesValidModelResponse() {
        String modelOutput = """
                {
                  "content": [
                    {
                      "text": "{\\"threatLevel\\":\\"HIGH\\",\\"summary\\":\\"2 threats found\\",\\"findings\\":[{\\"keyword\\":\\"sql injection\\",\\"description\\":\\"SQL injection detected\\",\\"lineNumber\\":5,\\"lineContent\\":\\"SELECT * FROM users\\"}],\\"scannedAt\\":\\"2024-01-15T10:00:00Z\\"}"
                    }
                  ]
                }
                """;

        BedrockThreatDetector detector = new BedrockThreatDetector(stubClient(modelOutput), "test-model");
        ScanResult result = detector.analyze("some log content");

        assertEquals("HIGH", result.getThreatLevel());
        assertEquals("2 threats found", result.getSummary());
        assertEquals(1, result.getFindings().size());
        assertEquals("sql injection", result.getFindings().get(0).getKeyword());
    }

    @Test
    void handlesMalformedResponse() {
        String malformed = """
                {
                  "content": [
                    {
                      "text": "this is not valid json"
                    }
                  ]
                }
                """;

        BedrockThreatDetector detector = new BedrockThreatDetector(stubClient(malformed), "test-model");

        RuntimeException ex = assertThrows(RuntimeException.class, () -> detector.analyze("log"));
        assertTrue(ex.getMessage().contains("Bedrock analysis failed"));
    }

    @Test
    void handlesBedrockClientException() {
        RuntimeException cause = BedrockRuntimeException.builder().message("Service unavailable").build();
        BedrockThreatDetector detector = new BedrockThreatDetector(throwingClient(cause), "test-model");

        RuntimeException ex = assertThrows(RuntimeException.class, () -> detector.analyze("log"));
        assertTrue(ex.getMessage().contains("Bedrock analysis failed"));
    }
}

package com.logscan.lambda.detector;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.logscan.lambda.model.ScanResult;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelRequest;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelResponse;

import java.time.Instant;
import java.util.Map;

public class BedrockThreatDetector implements ThreatDetector {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final BedrockRuntimeClient bedrockClient;
    private final String modelId;

    public BedrockThreatDetector(BedrockRuntimeClient bedrockClient, String modelId) {
        this.bedrockClient = bedrockClient;
        this.modelId = modelId;
    }

    @Override
    public ScanResult analyze(String logContent) {
        String truncated = logContent.length() > 50000 ? logContent.substring(0, 50000) : logContent;

        String prompt = buildPrompt(truncated);

        try {
            String requestBody = MAPPER.writeValueAsString(Map.of(
                    "anthropic_version", "bedrock-2023-05-31",
                    "max_tokens", 4096,
                    "messages", new Object[]{
                            Map.of("role", "user", "content", prompt)
                    }
            ));

            InvokeModelResponse response = bedrockClient.invokeModel(InvokeModelRequest.builder()
                    .modelId(modelId)
                    .contentType("application/json")
                    .accept("application/json")
                    .body(SdkBytes.fromUtf8String(requestBody))
                    .build());

            String responseBody = response.body().asUtf8String();
            String content = extractContent(responseBody);
            ScanResult result = MAPPER.readValue(content, ScanResult.class);

            if (result.getScannedAt() == null) {
                result.setScannedAt(Instant.now().toString());
            }
            return result;
        } catch (Exception e) {
            throw new RuntimeException("Bedrock analysis failed: " + e.getMessage(), e);
        }
    }

    private String buildPrompt(String logContent) {
        return """
                Analyze the following log content for security threats. Return ONLY a valid JSON object with this exact schema (no markdown, no explanation):
                {
                  "threatLevel": "NONE|LOW|MEDIUM|HIGH|CRITICAL",
                  "summary": "brief summary string",
                  "findings": [
                    {
                      "keyword": "threat keyword",
                      "description": "description of the threat",
                      "lineNumber": 1,
                      "lineContent": "the actual log line"
                    }
                  ],
                  "scannedAt": "ISO-8601 timestamp"
                }
                
                Rules:
                - threatLevel must be one of: NONE, LOW, MEDIUM, HIGH, CRITICAL
                - findings array can be empty if no threats found
                - Maximum 50 findings
                - lineNumber is 1-based
                
                Log content:
                """ + logContent;
    }

    private String extractContent(String responseBody) {
        try {
            var tree = MAPPER.readTree(responseBody);
            var content = tree.at("/content/0/text");
            if (content.isMissingNode()) {
                throw new RuntimeException("Unexpected Bedrock response structure");
            }
            return content.asText();
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse Bedrock response: " + e.getMessage(), e);
        }
    }
}

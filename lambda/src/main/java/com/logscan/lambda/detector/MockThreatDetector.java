package com.logscan.lambda.detector;

import com.logscan.lambda.model.ScanResult;
import com.logscan.lambda.model.ScanResult.Finding;

import java.time.Instant;
import java.util.*;

public class MockThreatDetector implements ThreatDetector {

    private static final int MAX_FINDINGS = 50;

    private static final Map<String, String> KEYWORDS = new LinkedHashMap<>();

    static {
        KEYWORDS.put("unauthorized access", "Unauthorized access indicator detected.");
        KEYWORDS.put("sql injection", "SQL injection indicator detected.");
        KEYWORDS.put("brute force", "Brute force indicator detected.");
        KEYWORDS.put("malware detected", "Malware indicator detected.");
        KEYWORDS.put("privilege escalation", "Privilege escalation indicator detected.");
        KEYWORDS.put("failed login", "Failed login indicator detected.");
        KEYWORDS.put("suspicious command", "Suspicious command indicator detected.");
        KEYWORDS.put("rm -rf", "Dangerous rm -rf command detected.");
        KEYWORDS.put("chmod 777", "Insecure chmod 777 detected.");
        KEYWORDS.put("root login", "Root login indicator detected.");
    }

    @Override
    public ScanResult analyze(String logContent) {
        List<Finding> findings = new ArrayList<>();
        Set<String> distinctKeywords = new HashSet<>();
        String[] lines = logContent.split("\\r?\\n");

        for (int i = 0; i < lines.length && findings.size() < MAX_FINDINGS; i++) {
            String lineLower = lines[i].toLowerCase();
            for (Map.Entry<String, String> entry : KEYWORDS.entrySet()) {
                if (findings.size() >= MAX_FINDINGS) break;
                if (lineLower.contains(entry.getKey())) {
                    distinctKeywords.add(entry.getKey());
                    findings.add(new Finding(
                            entry.getKey(),
                            entry.getValue(),
                            i + 1,
                            lines[i]
                    ));
                }
            }
        }

        String threatLevel = determineThreatLevel(distinctKeywords.size());
        String summary;
        if (distinctKeywords.isEmpty()) {
            summary = "No threats detected.";
        } else {
            summary = distinctKeywords.size() + " distinct threat patterns detected.";
        }

        return new ScanResult(
                threatLevel,
                summary,
                findings,
                Instant.now().toString()
        );
    }

    private String determineThreatLevel(int distinctCount) {
        if (distinctCount == 0) return "NONE";
        if (distinctCount == 1) return "LOW";
        if (distinctCount == 2) return "MEDIUM";
        if (distinctCount <= 4) return "HIGH";
        return "CRITICAL";
    }
}

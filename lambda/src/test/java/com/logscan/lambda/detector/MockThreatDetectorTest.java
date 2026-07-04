package com.logscan.lambda.detector;

import com.logscan.lambda.model.ScanResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class MockThreatDetectorTest {

    private MockThreatDetector detector;

    @BeforeEach
    void setUp() {
        detector = new MockThreatDetector();
    }

    @Test
    void cleanLogReturnsNone() {
        String content = "2024-01-15 10:00:00 INFO Application started\n2024-01-15 10:01:00 INFO Health check OK";
        ScanResult result = detector.analyze(content);

        assertEquals("NONE", result.getThreatLevel());
        assertEquals("No threats detected.", result.getSummary());
        assertTrue(result.getFindings().isEmpty());
        assertNotNull(result.getScannedAt());
    }

    @Test
    void singleKeywordReturnsLow() {
        String content = "2024-01-15 10:00:00 ERROR SQL injection attempt detected";
        ScanResult result = detector.analyze(content);

        assertEquals("LOW", result.getThreatLevel());
        assertEquals("1 distinct threat patterns detected.", result.getSummary());
        assertEquals(1, result.getFindings().size());
        assertEquals("sql injection", result.getFindings().get(0).getKeyword());
        assertEquals(1, result.getFindings().get(0).getLineNumber());
    }

    @Test
    void twoDistinctKeywordsReturnMedium() {
        String content = "SQL injection attempt\nbrute force attack detected";
        ScanResult result = detector.analyze(content);

        assertEquals("MEDIUM", result.getThreatLevel());
        assertEquals("2 distinct threat patterns detected.", result.getSummary());
    }

    @Test
    void threeDistinctKeywordsReturnHigh() {
        String content = "SQL injection\nbrute force\nmalware detected";
        ScanResult result = detector.analyze(content);

        assertEquals("HIGH", result.getThreatLevel());
    }

    @Test
    void fiveDistinctKeywordsReturnCritical() {
        String content = "SQL injection found\nbrute force attack\nmalware detected here\nfailed login attempt\nunauthorized access";
        ScanResult result = detector.analyze(content);

        assertEquals("CRITICAL", result.getThreatLevel());
        assertEquals("5 distinct threat patterns detected.", result.getSummary());
    }

    @Test
    void maxFiftyFindings() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 100; i++) {
            sb.append("ERROR failed login attempt #").append(i).append("\n");
        }
        ScanResult result = detector.analyze(sb.toString());

        assertEquals(50, result.getFindings().size());
    }

    @Test
    void caseInsensitiveMatching() {
        String content = "WARNING: ROOT LOGIN detected from 10.0.0.1";
        ScanResult result = detector.analyze(content);

        assertEquals("LOW", result.getThreatLevel());
        assertEquals("root login", result.getFindings().get(0).getKeyword());
    }
}

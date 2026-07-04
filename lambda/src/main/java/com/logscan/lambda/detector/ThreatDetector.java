package com.logscan.lambda.detector;

import com.logscan.lambda.model.ScanResult;

public interface ThreatDetector {
    ScanResult analyze(String logContent);
}

package com.logscan.lambda.model;

import java.util.List;

public class ScanResult {
    private String threatLevel;
    private String summary;
    private List<Finding> findings;
    private String scannedAt;

    public ScanResult() {}

    public ScanResult(String threatLevel, String summary, List<Finding> findings, String scannedAt) {
        this.threatLevel = threatLevel;
        this.summary = summary;
        this.findings = findings;
        this.scannedAt = scannedAt;
    }

    public String getThreatLevel() { return threatLevel; }
    public void setThreatLevel(String threatLevel) { this.threatLevel = threatLevel; }

    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }

    public List<Finding> getFindings() { return findings; }
    public void setFindings(List<Finding> findings) { this.findings = findings; }

    public String getScannedAt() { return scannedAt; }
    public void setScannedAt(String scannedAt) { this.scannedAt = scannedAt; }

    public static class Finding {
        private String keyword;
        private String description;
        private int lineNumber;
        private String lineContent;

        public Finding() {}

        public Finding(String keyword, String description, int lineNumber, String lineContent) {
            this.keyword = keyword;
            this.description = description;
            this.lineNumber = lineNumber;
            this.lineContent = lineContent;
        }

        public String getKeyword() { return keyword; }
        public void setKeyword(String keyword) { this.keyword = keyword; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        public int getLineNumber() { return lineNumber; }
        public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }

        public String getLineContent() { return lineContent; }
        public void setLineContent(String lineContent) { this.lineContent = lineContent; }
    }
}

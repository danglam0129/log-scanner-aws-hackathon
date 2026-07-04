# LogScan Serverless — Implementation Tasks

## Phase 1: Project Scaffolding

- [x] 1. Create root `README.md` with project title placeholder and one-line description.
  - File: `README.md`
  - Expected: File exists with heading `# LogScan`.

- [x] 2. Create root `.gitignore` covering lambda/target/, frontend/dist/, frontend/node_modules/, .idea/, *.iml, .vscode/, .DS_Store, Thumbs.db, .env, *.env.local, *.tfvars, *.tfvars.json, *.pem, *.key, *.p12, *.crt, aws-credentials*, infra/terraform/.terraform/, infra/terraform/*.tfstate, infra/terraform/*.tfstate.backup, *.log, logs/.
  - File: `.gitignore`
  - Expected: All listed patterns present.

- [x] 3. Initialize `frontend/` with Vite 5 + React 18 (JavaScript/JSX template).
  - Files: `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.js`, `frontend/src/main.jsx`, `frontend/src/App.jsx`
  - Expected: `cd frontend && npm install && npm run dev` starts dev server on port 5173.

- [x] 4. Create `frontend/.env.example` with placeholder environment variables.
  - File: `frontend/.env.example`
  - Content: `VITE_API_BASE_URL=`, `VITE_COGNITO_DOMAIN=`, `VITE_COGNITO_CLIENT_ID=`, `VITE_COGNITO_REDIRECT_URI=`, `VITE_COGNITO_LOGOUT_URI=`

- [x] 5. Initialize `lambda/` Maven project with `pom.xml` targeting Java 21.
  - File: `lambda/pom.xml`
  - Dependencies: aws-lambda-java-core, aws-lambda-java-events, AWS SDK v2 (dynamodb, s3, sqs, bedrock-runtime), Jackson (databind), SLF4J, JUnit 5, Mockito.
  - Plugins: maven-compiler-plugin (Java 21), maven-shade-plugin (uber-JAR).
  - Expected: `cd lambda && mvn compile` succeeds.

- [x] 6. Create `infra/terraform/` directory with empty placeholder files.
  - Files: `infra/terraform/versions.tf`, `infra/terraform/variables.tf`, `infra/terraform/main.tf`, `infra/terraform/outputs.tf`, `infra/terraform/terraform.tfvars.example`
  - Expected: Directory structure exists.

- [x] 7. Create `infra/terraform/deploy.sh` as an empty executable shell script with shebang.
  - File: `infra/terraform/deploy.sh`
  - Expected: File is executable (`chmod +x`).

---

## Phase 2: Frontend App and Routing

- [x] 8. Install frontend dependencies: `react-router-dom@6`.
  - File: `frontend/package.json` (updated)
  - Validation: `cd frontend && npm ls react-router-dom`

- [x] 9. Create `frontend/src/App.jsx` with React Router 6 setup.
  - Routes: `/` → `FileList`, `/upload` → `FileUpload`, `/files/:fileId/result` → `ScanResultDetail`.
  - Layout: Sticky top nav (brand "LogScan", links "Files" and "Upload"), main content max-width ~1100px centered, footer text "Log Threat Detection System • Built with React, API Gateway, Lambda, S3, SQS, and DynamoDB".
  - Dark security-dashboard theme via plain CSS or inline styles.
  - Expected: All three routes render placeholder content without errors.

- [x] 10. Create `frontend/src/main.jsx` mounting `<App />` with `BrowserRouter`.
  - File: `frontend/src/main.jsx`
  - Expected: App renders in browser at `http://localhost:5173`.

---

## Phase 3: Frontend API Client and Optional Cognito Helper

- [x] 11. Create `frontend/src/api/fileApi.js` with API client functions.
  - File: `frontend/src/api/fileApi.js`
  - Exported functions:
    - `requestUpload(fileName, fileSize)` → POST `/api/files` → `{ fileId, uploadUrl, expiresIn }`
    - `confirmUpload(fileId)` → POST `/api/files/{fileId}/confirm` → `{ fileId, fileName, fileSize, status, uploadedAt }`
    - `getFiles()` → GET `/api/files` → `{ files: [...] }`
    - `getScanResult(fileId)` → GET `/api/files/{fileId}/result` → `{ fileId, fileName, scanResult }`
    - `uploadToS3(uploadUrl, file, onProgress)` → PUT file to S3 presigned URL via XMLHttpRequest, Content-Type: application/octet-stream, calls onProgress(percent) callback.
  - Base URL from `import.meta.env.VITE_API_BASE_URL` or default `/api`.
  - If auth token exists in localStorage, attach `Authorization: Bearer <token>` header.
  - Expected: Functions exported, no runtime errors on import.

- [x] 12. Create `frontend/src/auth.js` for optional Cognito Hosted UI PKCE flow.
  - File: `frontend/src/auth.js`
  - Exported functions:
    - `isAuthConfigured()` → boolean. Returns true only if `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REDIRECT_URI` are all non-empty.
    - `isAuthenticated()` → boolean. Returns true if a valid access token exists in localStorage.
    - `getAccessToken()` → return stored access token string or null.
    - `getCurrentUser()` → decode ID token, return object with email (and other claims) or null.
    - `handleAuthCallback()` → exchange authorization code for tokens (PKCE), store in localStorage. Returns true on success.
    - `login()` → redirect to Cognito Hosted UI authorize endpoint with PKCE code_challenge.
    - `logout()` → clear localStorage tokens, redirect to Cognito logout endpoint.
  - Expected: When env vars are empty, `isAuthConfigured()` returns false and app works without auth.

---

## Phase 4: File Upload / List / Result Components

- [x] 13. Create `frontend/src/components/FileUpload.jsx`.
  - File: `frontend/src/components/FileUpload.jsx`
  - Features:
    - Drag-and-drop zone + hidden file input + browse button.
    - Accept any file extension.
    - Validate: 1 byte ≤ size ≤ 10 MB (10,485,760 bytes).
    - Show selected file name and size before upload.
    - Call `requestUpload(fileName, fileSize)`.
    - Call `uploadToS3(uploadUrl, file, onProgress)` which PUTs file to S3 presigned URL via `XMLHttpRequest` with `Content-Type: application/octet-stream` and tracks progress.
    - Call `confirmUpload(fileId)` after successful S3 PUT.
    - Show success message with link to file list (`/`).
    - Show error message with retry button on failure.
  - Expected: Component renders without errors; drag-drop zone is visible.

- [x] 14. Create `frontend/src/components/FileList.jsx`.
  - File: `frontend/src/components/FileList.jsx`
  - Features:
    - Call `getFiles()` on mount.
    - Show loading spinner/state.
    - Show error state with retry button.
    - Show empty state ("No files uploaded yet") if array is empty.
    - Display each file: fileName, fileSize (human-readable), uploadedAt, status badge.
    - Sort: newest first (by `uploadedAt` desc).
    - Status colors: `UPLOAD_PENDING`/`PENDING` → yellow/scanning, `COMPLETED` → green, `FAILED` → red.
    - Show "View Results" link (→ `/files/:fileId/result`) only when status is `COMPLETED`.
  - Expected: Component renders loading state, then file list or empty state.

- [x] 15. Create `frontend/src/components/ScanResultDetail.jsx`.
  - File: `frontend/src/components/ScanResultDetail.jsx`
  - Features:
    - Extract `fileId` from route params.
    - Call `getScanResult(fileId)` on mount.
    - Show loading state.
    - Show error state if request fails (including 409 for non-completed).
    - Display: fileName, threatLevel (color-coded badge), summary text.
    - Display findings list; each finding shows: keyword, description, lineNumber, lineContent.
    - If findings array is empty, show "No threats detected" clean state.
  - Expected: Component renders correctly for both threat and clean scenarios.

---

## Phase 5: Lambda Maven Project

- [x] 16. Create `lambda/src/main/java/com/logscan/lambda/model/ScanResult.java`.
  - File: `lambda/src/main/java/com/logscan/lambda/model/ScanResult.java`
  - Fields: `String threatLevel`, `String summary`, `List<Finding> findings`, `String scannedAt`.
  - Inner class `Finding`: `String keyword`, `String description`, `int lineNumber`, `String lineContent`.
  - Include getters/setters or use public fields with Jackson annotations.
  - Expected: `mvn compile` succeeds.

- [x] 17. Create `lambda/src/main/java/com/logscan/lambda/detector/ThreatDetector.java` interface.
  - File: `lambda/src/main/java/com/logscan/lambda/detector/ThreatDetector.java`
  - Method: `ScanResult analyze(String logContent)`
  - Expected: Interface compiles.

---

## Phase 6: Mock and Bedrock Threat Detectors

- [x] 18. Create `lambda/src/main/java/com/logscan/lambda/detector/MockThreatDetector.java`.
  - File: `lambda/src/main/java/com/logscan/lambda/detector/MockThreatDetector.java`
  - Keywords (case-insensitive): `unauthorized access`, `sql injection`, `brute force`, `malware detected`, `privilege escalation`, `failed login`, `suspicious command`, `rm -rf`, `chmod 777`, `root login`.
  - Algorithm:
    - Split content into lines.
    - For each line, check all keywords (case-insensitive contains).
    - Record Finding with keyword, description ("{keyword} indicator detected."), lineNumber (1-based), lineContent.
    - Cap at 50 findings total.
    - Count distinct keywords matched.
    - Threat level: 0→NONE, 1→LOW, 2→MEDIUM, 3–4→HIGH, 5+→CRITICAL.
    - Summary: "No threats detected." or "{N} distinct threat patterns detected."
    - `scannedAt`: current UTC ISO 8601.
  - Expected: `mvn compile` succeeds.

- [x] 19. Create `lambda/src/main/java/com/logscan/lambda/detector/BedrockThreatDetector.java`.
  - File: `lambda/src/main/java/com/logscan/lambda/detector/BedrockThreatDetector.java`
  - Constructor accepts `BedrockRuntimeClient` and `String modelId`.
  - Sends prompt requesting strict JSON matching ScanResult schema.
  - Parses model response JSON into `ScanResult`.
  - On invalid JSON: throws `RuntimeException` with clear message.
  - Not enabled by default (`DETECTOR_TYPE=MOCK`).
  - Expected: `mvn compile` succeeds.

---

## Phase 7: API Lambda Handler

- [x] 20. Create `lambda/src/main/java/com/logscan/lambda/ApiHandler.java`.
  - File: `lambda/src/main/java/com/logscan/lambda/ApiHandler.java`
  - Implements `RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse>`.
  - Environment variables read: `FILES_TABLE_NAME`, `S3_BUCKET_NAME`, `CORS_ALLOWED_ORIGINS`.
  - Routing: parse `event.getRequestContext().getHttp().getMethod()`, `event.getRawPath()`, `event.getPathParameters()`.
  - Routes:
    - `GET /api/health` → `{"status":"UP"}`
    - `POST /api/files` → validate fileName (required, non-blank) and fileSize (1–10485760), generate UUID fileId, build S3 key `uploads/{ownerUserId}/{fileId}/{safeFileName}`, create presigned PUT URL (15 min, Content-Type: application/octet-stream), PutItem to DynamoDB (status=UPLOAD_PENDING), return `{fileId, uploadUrl, expiresIn}`.
    - `POST /api/files/{fileId}/confirm` → lookup by ownerUserId+fileId, 404 if not found, update UPLOAD_PENDING→PENDING, return file summary.
    - `GET /api/files` → query by ownerUserId PK, return files sorted by uploadedAt desc.
    - `GET /api/files/{fileId}/result` → lookup by ownerUserId+fileId, 404 if not found, 409 if not COMPLETED, return scanResult.
  - Owner resolution: extract `sub` from `event.getRequestContext().getAuthorizer().getJwt().getClaims().get("sub")` or default to `"anonymous"`.
  - CORS: all responses include `Access-Control-Allow-Origin` (match request Origin against `CORS_ALLOWED_ORIGINS`), `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`.
  - Error responses: `{"error": "CODE", "message": "..."}`
  - Expected: `mvn compile` succeeds.

---

## Phase 8: Scanner Lambda Handler

- [x] 21. Create `lambda/src/main/java/com/logscan/lambda/ThreatDetectionHandler.java`.
  - File: `lambda/src/main/java/com/logscan/lambda/ThreatDetectionHandler.java`
  - Implements `RequestHandler<SQSEvent, Void>`.
  - Environment variables read: `FILES_TABLE_NAME`, `DETECTOR_TYPE`, `BEDROCK_MODEL_ID`.
  - Does NOT require `S3_BUCKET_NAME` — bucket name is extracted from the S3 event payload.
  - Processing per SQS record:
    - Parse S3 event JSON from record body → extract bucket name and key.
    - URL-decode key.
    - Ignore keys not starting with `uploads/`.
    - Parse key: `uploads/{ownerUserId}/{fileId}/{fileName}`.
    - Lookup DynamoDB item by ownerUserId + fileId.
    - If not found: log warning, skip.
    - If status == COMPLETED: skip (idempotent).
    - Download S3 object as UTF-8 string.
    - Instantiate detector: if `DETECTOR_TYPE == "BEDROCK"` → `BedrockThreatDetector`, else → `MockThreatDetector`.
    - Call `detector.analyze(content)`.
    - Update DynamoDB: status=COMPLETED, threatLevel, summary, findingsJson (serialized), scannedAt, updatedAt.
    - On exception: update status=FAILED, log error, throw RuntimeException (SQS retries up to 3x → DLQ).
  - Expected: `mvn compile` succeeds.

---

## Phase 9: Terraform Infrastructure

- [x] 22. Write `infra/terraform/versions.tf`.
  - File: `infra/terraform/versions.tf`
  - Content: `terraform >= 1.5`, provider `aws ~> 5.0`.
  - Expected: `terraform validate` passes (with variables filled).

- [x] 23. Write `infra/terraform/variables.tf` with all required variables.
  - File: `infra/terraform/variables.tf`
  - Variables: `aws_region` (default "ap-southeast-1"), `environment` (default "dev"), `project_name` (default "log-threat-detection"), `upload_bucket_name`, `frontend_bucket_name` (default ""), `frontend_domain` (default "log-scanner.cloudival.com"), `route53_zone_id` (default ""), `enable_cloudfront` (default false), `enable_cognito` (default false), `cognito_domain_prefix` (default ""), `detector_type` (default "MOCK"), `bedrock_model_id` (default "anthropic.claude-3-haiku-20240307-v1:0"), `lambda_memory` (default 512), `api_lambda_timeout` (default 15), `scanner_lambda_timeout` (default 45), `lambda_reserved_concurrency` (default null), `frontend_certificate_arn` (default "").
  - Note: `route53_zone_id` defaults to empty string. The real value (e.g., "Z0047063JX9ZJQL6MINC") goes in `terraform.tfvars.example` as an example, not hardcoded as the default.

- [x] 24. Write `infra/terraform/main.tf` with all core resources.
  - File: `infra/terraform/main.tf`
  - Resources:
    - AWS provider with default tags (Project, Environment, ManagedBy).
    - S3 upload bucket: private, block all public access, AES256 encryption, CORS for PUT from frontend domain + localhost:5173.
    - S3 frontend bucket: name = `frontend_domain` when CloudFront disabled + `frontend_bucket_name` empty; website hosting (index.html / index.html as error); public bucket policy when CF disabled.
    - S3 bucket notification: ObjectCreated on prefix `uploads/` → SQS.
    - SQS scan queue: visibility timeout = `scanner_lambda_timeout + 15`, message retention 345600s.
    - SQS DLQ: max receive count 3 redrive.
    - SQS queue policy: allow S3 upload bucket to SendMessage.
    - DynamoDB table: `{project}-{env}-files`, PK=ownerUserId(S), SK=fileId(S), PAY_PER_REQUEST, SSE enabled.
    - IAM role + policy for API Lambda: logs write, DynamoDB (GetItem, PutItem, Query, UpdateItem), S3 PutObject on uploads/*.
    - IAM role + policy for Scanner Lambda: logs write, S3 GetObject on uploads/*, DynamoDB (GetItem, UpdateItem), SQS (ReceiveMessage, DeleteMessage, GetQueueAttributes), Bedrock InvokeModel on `arn:aws:bedrock:*::foundation-model/*`.
    - CloudWatch log groups: `/aws/lambda/{function-name}`, retention = 7 days.
    - Lambda API function: `{project}-{env}-api`, Java 21, 512MB, 15s timeout, handler `com.logscan.lambda.ApiHandler::handleRequest`, env vars: FILES_TABLE_NAME, S3_BUCKET_NAME, CORS_ALLOWED_ORIGINS.
    - Lambda Scanner function: `{project}-{env}-threat-detection`, Java 21, 512MB, 45s timeout, handler `com.logscan.lambda.ThreatDetectionHandler::handleRequest`, env vars: FILES_TABLE_NAME, DETECTOR_TYPE, BEDROCK_MODEL_ID.
    - SQS event source mapping: scanner Lambda ← scan queue, batch size 1.
    - API Gateway HTTP API: `{project}-{env}-api`, CORS config (origins, methods, headers).
    - API Gateway Lambda integration for API Lambda.
    - API Gateway routes: GET /api/health, POST /api/files, POST /api/files/{fileId}/confirm, GET /api/files, GET /api/files/{fileId}/result.
    - API Gateway $default stage (auto-deploy).
    - Lambda permission for API Gateway to invoke API Lambda.
    - Route 53 A alias: when `enable_cloudfront = false` + `frontend_domain` non-empty + `route53_zone_id` set → alias to S3 website endpoint (hosted zone ID Z3O0J2DXBE1FTB for ap-southeast-1).
    - Conditional Cognito: user pool, app client (PKCE, no secret), domain, JWT authorizer on API Gateway (protect all routes except /api/health).
    - AWS provider alias `aws.us_east_1` for `us-east-1` region (required because ACM certificates for CloudFront must be in us-east-1).
    - Conditional CloudFront: distribution with OAC (not OAI), ACM cert in us-east-1 (using aliased provider), Route 53 A alias to CF domain, private frontend bucket policy with CF service principal.
    - S3 frontend bucket: set `force_destroy = true` to avoid BucketNotEmpty errors during replacement or destroy.
  - Expected: `terraform fmt -check` and `terraform validate` pass.

- [x] 25. Write `infra/terraform/outputs.tf`.
  - File: `infra/terraform/outputs.tf`
  - Outputs: `api_url` (API Gateway endpoint + "/api"), `frontend_url` ("http://{frontend_domain}"), `s3_frontend_bucket_name`, `s3_upload_bucket_name`, `aws_region`, `cloudfront_distribution_id` (empty if disabled), `cognito_domain` (empty if disabled), `cognito_user_pool_client_id` (empty if disabled).

- [x] 26. Write `infra/terraform/terraform.tfvars.example`.
  - File: `infra/terraform/terraform.tfvars.example`
  - Content: all variables with example values and comments.

- [x] 27. Validate Terraform.
  - Commands: `cd infra/terraform && terraform fmt -check && terraform validate`
  - Expected: "Success! The configuration is valid."

---

## Phase 10: Deploy Script

- [x] 28. Implement `infra/terraform/deploy.sh`.
  - File: `infra/terraform/deploy.sh`
  - Steps:
    1. Check prerequisites: `terraform`, `aws`, `npm`, `mvn`.
    2. Verify `terraform.tfvars` exists in script directory.
    3. Build Lambda: `cd ../../lambda && mvn clean package -DskipTests`.
    4. Run: `terraform init && terraform apply`.
    5. Read outputs: `aws_region`, `api_url`, `frontend_url`, `s3_frontend_bucket_name`, `cloudfront_distribution_id`, `cognito_domain`, `cognito_user_pool_client_id`.
    6. Build frontend: set `VITE_API_BASE_URL`, `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REDIRECT_URI`, `VITE_COGNITO_LOGOUT_URI`, then `cd ../../frontend && npm ci && npm run build`.
    7. Upload: `aws s3 sync dist/ s3://$FRONTEND_BUCKET/ --delete`.
    8. If CloudFront enabled: `aws cloudfront create-invalidation --distribution-id "$CF_DIST_ID" --paths "/*"`.
    9. Print: "Deployment complete.\nFrontend: $FRONTEND_URL\nAPI: $API_URL".
  - Expected: Script is executable. Run `shellcheck deploy.sh` if available to verify no obvious errors, but shellcheck is not a required dependency.

---

## Phase 11: Tests

- [x] 29. Create `frontend/src/test/setup.js` with Vitest/RTL setup.
  - File: `frontend/src/test/setup.js`
  - Configure jsdom environment, import @testing-library/jest-dom matchers.
  - Update `frontend/vite.config.js` or `frontend/vitest.config.js` to include test setup.

- [x] 30. Install test dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
  - File: `frontend/package.json` (devDependencies updated)
  - Add script: `"test": "vitest"`

- [x] 31. Create `frontend/src/test/FileUpload.test.jsx`.
  - File: `frontend/src/test/FileUpload.test.jsx`
  - Tests: file validation (too large, too small, valid), upload success flow (mock API + XHR), upload failure flow, drag-and-drop interaction.
  - Expected: All tests pass with `cd frontend && npm test -- --run`.

- [x] 32. Create `frontend/src/test/FileList.test.jsx`.
  - File: `frontend/src/test/FileList.test.jsx`
  - Tests: loading state, successful file list render, empty state, error state with retry, status badge colors, "View Results" link only for COMPLETED.
  - Expected: All tests pass.

- [x] 33. Create `frontend/src/test/fileApi.test.js`.
  - File: `frontend/src/test/fileApi.test.js`
  - Tests: requestUpload success/error, confirmUpload success, getFiles success/error, getScanResult success/404/409, uploadToS3 progress callback, auth header attached when token present, no auth header when token absent.
  - Expected: All tests pass.

- [x] 34. Create `lambda/src/test/java/com/logscan/lambda/detector/MockThreatDetectorTest.java`.
  - File: `lambda/src/test/java/com/logscan/lambda/detector/MockThreatDetectorTest.java`
  - Tests:
    - Clean log (no keywords) → threatLevel=NONE, empty findings.
    - Single keyword match → threatLevel=LOW.
    - Two distinct keywords → MEDIUM.
    - Three distinct keywords → HIGH.
    - Five+ distinct keywords → CRITICAL.
    - Max 50 findings cap.
    - Case-insensitive matching.
  - Expected: `cd lambda && mvn test` → BUILD SUCCESS.

- [x] 35. Create `lambda/src/test/java/com/logscan/lambda/detector/BedrockThreatDetectorTest.java`.
  - File: `lambda/src/test/java/com/logscan/lambda/detector/BedrockThreatDetectorTest.java`
  - Tests:
    - Valid model JSON response → correct ScanResult.
    - Malformed JSON response → RuntimeException.
    - Bedrock client exception → RuntimeException.
  - Requires: `lambda/src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker` with `mock-maker-inline`.
  - Expected: `mvn test` → BUILD SUCCESS.

- [x] 36. Run all tests and verify green.
  - Commands:
    - `cd frontend && npm test -- --run` → all pass, 0 failures.
    - `cd lambda && mvn test` → BUILD SUCCESS.
  - Expected: No test failures.

---

## Phase 12: Documentation

- [x] 37. Write complete root `README.md`.
  - File: `README.md`
  - Sections: project overview, architecture mermaid diagram, why DynamoDB (not RDS), authentication + file ownership, AWS account limitations (CloudFront unverified, Bedrock unapproved), default feature flags, tech stack table, project structure, deploy commands, API table, test commands, secret safety notes, frontend URL format (`http://log-scanner.cloudival.com`).

- [x] 38. Write `infra/terraform/README.md`.
  - File: `infra/terraform/README.md`
  - Sections: Terraform architecture, resource table, cost notes (serverless = near-zero at rest), prerequisites, configure (terraform.tfvars), deploy, manual deploy steps, verify (health, CORS, upload), CloudFront limitation, Cognito note, Bedrock limitation, outputs table, destroy.

---

## Phase 13: Deployment and Verification

- [ ] 39. Build Lambda JAR locally.
  - Command: `cd lambda && mvn clean package -DskipTests`
  - Expected: `lambda/target/*.jar` exists, BUILD SUCCESS.

- [ ] 40. Build frontend locally.
  - Command: `cd frontend && npm ci && npm run build`
  - Expected: `frontend/dist/` contains index.html and assets.

- [ ] 41. Run `terraform fmt -check` and `terraform validate`.
  - Commands: `cd infra/terraform && terraform fmt -check && terraform validate`
  - Expected: No formatting issues, "Success! The configuration is valid."

- [ ] 42. Deploy with `deploy.sh` (requires AWS credentials and terraform.tfvars).
  - Command: `cd infra/terraform && ./deploy.sh`
  - Expected: Terraform applies without errors; frontend synced to S3.

- [ ] 43. Verify Terraform outputs.
  - Commands:
    - `terraform output -raw frontend_url` → `http://log-scanner.cloudival.com`
    - `terraform output -raw api_url` → ends with `/api`

- [ ] 44. Verify API health endpoint.
  - Command: `curl "$(terraform output -raw api_url)/health"`
  - Expected: `{"status":"UP"}`

- [ ] 45. Verify frontend is served from S3.
  - Command: `curl -I http://log-scanner.cloudival.com`
  - Expected: `HTTP/1.1 200 OK`, `Server: AmazonS3`

- [ ] 46. Verify CORS preflight.
  - Command:
    ```bash
    curl -i -X OPTIONS "$(terraform output -raw api_url)/files" \
      -H "Origin: http://log-scanner.cloudival.com" \
      -H "Access-Control-Request-Method: POST" \
      -H "Access-Control-Request-Headers: content-type"
    ```
  - Expected: `access-control-allow-origin: http://log-scanner.cloudival.com`

- [ ] 47. Verify end-to-end flow.
  - Steps:
    1. `POST /api/files` with `{"fileName":"test.log","fileSize":100}` → get `fileId` + `uploadUrl`.
    2. PUT a test file to the `uploadUrl` with `Content-Type: application/octet-stream`.
    3. `POST /api/files/{fileId}/confirm` → status becomes PENDING.
    4. Wait ~10 seconds for SQS → Scanner Lambda processing.
    5. `GET /api/files/{fileId}/result` → returns `scanResult` JSON object.
  - Expected: DynamoDB item status = COMPLETED, scanResult contains threatLevel and findings.

- [ ] 48. Verify `terraform plan` shows no changes (idempotent).
  - Command: `cd infra/terraform && terraform plan`
  - Expected: "No changes. Your infrastructure matches the configuration."

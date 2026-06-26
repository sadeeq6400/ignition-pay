# Requirements Document

## Introduction

This feature adds a `POST /auth/refresh` endpoint to the NestJS API that allows clients to obtain a new JWT access token using a valid refresh token, without requiring re-authentication. The endpoint integrates with the existing Redis-based refresh token store (keyed by `refresh:{walletAddress}`), the existing `REFRESH_TOKEN_SECRET`-signed refresh tokens issued at login, and the existing `JWT_SECRET`-signed 15-minute access tokens. Token rotation is applied on every successful refresh: the old refresh token is invalidated and a new one is issued, reducing the exposure window of any individual refresh token.

## Glossary

- **Refresh_Endpoint**: The `POST /auth/refresh` HTTP handler introduced by this feature.
- **Access_Token**: A short-lived JWT signed with `JWT_SECRET`, valid for 15 minutes, used to authenticate API calls.
- **Refresh_Token**: A longer-lived JWT signed with `REFRESH_TOKEN_SECRET`, valid for 7 days, used solely to obtain new Access_Tokens.
- **Token_Store**: The Redis cache managed via `@nestjs/cache-manager` (Keyv), where the current valid Refresh_Token for each user is stored under the key `refresh:{walletAddress}`.
- **Token_Rotation**: The strategy of invalidating the presented Refresh_Token and issuing a new Refresh_Token on each successful refresh call.
- **Refresh_Token_Service**: The service-layer class responsible for validating Refresh_Tokens and issuing new token pairs.
- **JWT_Payload**: The decoded claims object extracted from a verified JWT; for Access_Tokens it contains `sub` (user ID), `walletAddress`, and `role`; for Refresh_Tokens it contains `sub` (user ID).
- **walletAddress**: The Stellar Ed25519 public key that uniquely identifies a user in the system.
- **Throttler**: The NestJS rate-limiter guard applied to authentication endpoints, configured at 10 requests per 60-second fixed window per client IP.

---

## Requirements

### Requirement 1: Accept and Validate the Refresh Token

**User Story:** As an authenticated client, I want to submit my refresh token to `POST /auth/refresh`, so that the system can verify it before issuing new tokens.

#### Acceptance Criteria

1. WHEN a `POST /auth/refresh` request is received with a JSON body containing a non-empty `refreshToken` string field, THE Refresh_Endpoint SHALL forward the token to the Refresh_Token_Service for signature verification.
2. IF the request body is not valid JSON, or the `refreshToken` field is missing, null, or an empty string, THEN THE Refresh_Endpoint SHALL return HTTP 400 with an error message of `"refreshToken is required"`.
3. WHEN the Refresh_Endpoint receives a `refreshToken` value, THE Refresh_Token_Service SHALL verify the token's signature using `REFRESH_TOKEN_SECRET`.
4. IF the `refreshToken` signature verification fails, THEN THE Refresh_Endpoint SHALL return HTTP 401 with an error message of `"Invalid refresh token"`.
5. IF the `refreshToken` is expired, THEN THE Refresh_Endpoint SHALL return HTTP 401 with an error message of `"Refresh token expired"`.
6. WHEN the Refresh_Token_Service successfully verifies the token signature, THE Refresh_Token_Service SHALL extract the `sub` (user ID) claim from the JWT_Payload.
7. IF the `refreshToken` passes signature verification but the decoded JWT_Payload does not contain a non-empty `sub` claim, THEN THE Refresh_Endpoint SHALL return HTTP 401 with an error message of `"Invalid refresh token"`.

---

### Requirement 2: Validate Token Against the Token Store

**User Story:** As a system operator, I want the refresh endpoint to cross-check the presented token against the Token_Store, so that revoked or rotated-out tokens cannot be reused.

#### Acceptance Criteria

1. WHEN the Refresh_Token_Service has extracted the `sub` claim from a valid Refresh_Token, THE Refresh_Token_Service SHALL look up the corresponding user record in the database using `sub` to obtain the user's `walletAddress` and account status.
2. IF no user record is found for the `sub` claim, THEN THE Refresh_Endpoint SHALL return HTTP 401 with an error message of `"Invalid refresh token"`.
3. IF the user's `isActive` field is `false`, THEN THE Refresh_Endpoint SHALL return HTTP 401 with an error message of `"Account is inactive"`.
4. IF the user record is found and `isActive` is `true`, THEN THE Refresh_Token_Service SHALL retrieve the stored token value from the Token_Store at key `refresh:{walletAddress}`.
5. IF no entry exists in the Token_Store at `refresh:{walletAddress}`, THEN THE Refresh_Endpoint SHALL return HTTP 401 with an error message of `"Refresh token has been revoked"`.
6. IF the stored token value does not exactly match the presented `refreshToken` using case-sensitive string equality, THEN THE Refresh_Endpoint SHALL return HTTP 401 with an error message of `"Refresh token has been revoked"`.
7. IF the database is unavailable during user record lookup, THEN THE Refresh_Endpoint SHALL return HTTP 503 with an error message of `"Service temporarily unavailable"`.
8. IF the Token_Store is unavailable during token retrieval, THEN THE Refresh_Endpoint SHALL return HTTP 503 with an error message of `"Service temporarily unavailable"`.

---

### Requirement 3: Issue a New Token Pair with Token Rotation

**User Story:** As an authenticated client, I want to receive a fresh access token and a rotated refresh token on a successful refresh, so that my session remains active without re-authenticating.

#### Acceptance Criteria

1. WHEN the presented Refresh_Token passes all validation checks, THE Refresh_Token_Service SHALL sign a new Access_Token JWT with `JWT_SECRET`, embedding the claims `sub`, `walletAddress`, and `role` (fetched from the user record), with an expiry of 15 minutes.
2. WHEN the presented Refresh_Token passes all validation checks, THE Refresh_Token_Service SHALL sign a new Refresh_Token JWT with `REFRESH_TOKEN_SECRET`, embedding the `sub` claim, with an expiry of 7 days.
3. WHEN a new Refresh_Token is signed, THE Refresh_Token_Service SHALL atomically delete the old `refresh:{walletAddress}` entry from the Token_Store and store the new Refresh_Token value under the same key with a TTL of 7 days.
4. WHEN the Token_Store update completes successfully, THE Refresh_Endpoint SHALL return HTTP 200 with a JSON body containing `accessToken`, `refreshToken`, and `tokenType: "Bearer"`.
5. IF the Token_Store rotation write fails, THEN THE Refresh_Endpoint SHALL return HTTP 503 with an error message of `"Service temporarily unavailable"` and SHALL NOT return the new token pair.
6. IF the Token_Store rotation write fails, THEN THE Refresh_Endpoint SHALL NOT return the new token pair.

---

### Requirement 4: Rate Limiting

**User Story:** As a system operator, I want the refresh endpoint to be rate-limited, so that brute-force attempts to guess valid refresh tokens are mitigated.

#### Acceptance Criteria

1. THE Refresh_Endpoint SHALL apply the Throttler guard configured at a maximum of 10 requests per 60-second fixed window per client IP.
2. WHEN a client exceeds 10 `POST /auth/refresh` requests within a 60-second fixed window, THE Refresh_Endpoint SHALL return HTTP 429 with a `Retry-After` header indicating the number of seconds until the window resets.

---

### Requirement 5: Compatibility with Logout

**User Story:** As an authenticated client, I want my refresh token to be permanently invalidated after logout, so that a logged-out refresh token cannot be used to obtain new access tokens.

#### Acceptance Criteria

1. WHEN a user logs out via `POST /auth/logout`, THE logout handler SHALL delete the `refresh:{walletAddress}` key from the Token_Store, so that any subsequent `POST /auth/refresh` request presenting the pre-logout Refresh_Token returns HTTP 401 with the message `"Refresh token has been revoked"`.
2. IF the `refresh:{walletAddress}` key is absent from the Token_Store, THEN THE Refresh_Endpoint SHALL return HTTP 401 with the message `"Refresh token has been revoked"`, with no fallback path to token issuance.

---

### Requirement 6: Security Hardening

**User Story:** As a security engineer, I want the refresh endpoint to follow secure token-handling practices, so that token theft and reuse attacks are minimised.

#### Acceptance Criteria

1. THE Refresh_Endpoint SHALL accept the refresh token exclusively in the JSON request body. IF the refresh token is submitted as a URL query parameter or in any HTTP header other than `Content-Type`, THEN THE Refresh_Endpoint SHALL return HTTP 400 with an error message of `"refreshToken is required"`.
2. THE Refresh_Endpoint SHALL NOT include any Refresh_Token value in response bodies, response headers, or server-side logs.
3. WHEN any error condition causes the Refresh_Endpoint to return HTTP 400, 401, or 503, THE Refresh_Endpoint SHALL return the error response within 500 milliseconds.
4. THE Refresh_Endpoint SHALL return HTTP 401 with the message `"Refresh token has been revoked"` for both the absent-key and token-mismatch scenarios, without distinguishing which condition triggered the response.

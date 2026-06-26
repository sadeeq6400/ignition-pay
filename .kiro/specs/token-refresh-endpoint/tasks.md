# Implementation Plan: Token Refresh Endpoint

## Overview

Implement `POST /auth/refresh` by introducing `RefreshTokenDto`, `AuthTokenService`, and `AuthRefreshController`, wiring them into `auth.module.ts`, patching `users.service.ts` login() to persist the refresh token in Redis, and covering everything with unit and property-based tests.

---

## Tasks

- [ ] 1. Create `RefreshTokenDto` request body DTO
  - [ ] 1.1 Create `ignition-api/src/auth/dto/refresh-token.dto.ts`
    - Export `RefreshTokenDto` with a single `refreshToken: string` field
    - Decorate with `@IsString()` and `@IsNotEmpty({ message: 'refreshToken is required' })`
    - Add `@ApiProperty` decorator with description matching the design doc
    - _Requirements: 1.1, 1.2_

  - [ ]* 1.2 Write unit tests for `RefreshTokenDto` validation
    - Verify that empty string, whitespace-only string, and missing field each produce a validation error with message `"refreshToken is required"`
    - Verify that a non-empty string passes validation
    - _Requirements: 1.2_

- [ ] 2. Implement `AuthTokenService`
  - [ ] 2.1 Create `ignition-api/src/auth/auth-token.service.ts` with constructor and skeleton
    - Declare `@Injectable() AuthTokenService` class
    - Inject `JwtService`, `ConfigService`, `PrismaService`, and `@Inject(CACHE_MANAGER) cache: Keyv` in the constructor
    - Declare `async validateAndRotate(refreshToken: string): Promise<LoginResponseDto>` stub
    - _Requirements: 1.3, 2.1, 3.1_

  - [ ] 2.2 Implement JWT verification step in `validateAndRotate`
    - Call `this.jwt.verify(refreshToken, { secret: REFRESH_TOKEN_SECRET })`
    - Catch `TokenExpiredError` and throw `UnauthorizedException('Refresh token expired')`
    - Catch all other JWT errors and throw `UnauthorizedException('Invalid refresh token')`
    - Extract `sub` from payload; throw `UnauthorizedException('Invalid refresh token')` if `sub` is falsy or empty
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 2.3 Write property test for `validateAndRotate` — Property 2 (invalid `sub` claim)
    - **Property 2: Payloads without a valid `sub` claim are always rejected**
    - **Validates: Requirements 1.7**
    - Use `fast-check` to generate JWT payloads where `sub` is `null`, `undefined`, `""`, or whitespace; assert HTTP 401 with `"Invalid refresh token"` for each
    - Tag: `// Feature: token-refresh-endpoint, Property 2`
    - _Requirements: 1.7_

  - [ ] 2.4 Implement Prisma user lookup and `isActive` check in `validateAndRotate`
    - Call `this.prisma.user.findUnique({ where: { id: sub } })`
    - Wrap in try/catch; rethrow any Prisma error as `ServiceUnavailableException('Service temporarily unavailable')`
    - If no user found, throw `UnauthorizedException('Invalid refresh token')`
    - If `user.isActive === false`, throw `UnauthorizedException('Account is inactive')`
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

  - [ ] 2.5 Implement Redis token retrieval and comparison in `validateAndRotate`
    - Call `this.cache.get(`refresh:${user.walletAddress}`)` inside a try/catch
    - Rethrow any Keyv error as `ServiceUnavailableException('Service temporarily unavailable')`
    - If result is falsy, throw `UnauthorizedException('Refresh token has been revoked')`
    - If stored value does not strictly equal the presented token (case-sensitive), throw `UnauthorizedException('Refresh token has been revoked')`
    - _Requirements: 2.4, 2.5, 2.6, 2.8_

  - [ ]* 2.6 Write property test for `validateAndRotate` — Property 3 / Property 11 (token mismatch and absent key indistinguishable)
    - **Property 3: Token mismatch always produces a revoked response**
    - **Property 11: Revocation response is identical for absent-key and mismatch**
    - **Validates: Requirements 2.6, 6.4**
    - Use `fast-check` to generate arbitrary `(stored, presented)` pairs where `presented !== stored`; assert 401 with `"Refresh token has been revoked"` for both absent-key and value-mismatch scenarios
    - Tag: `// Feature: token-refresh-endpoint, Property 3` and `// Feature: token-refresh-endpoint, Property 11`
    - _Requirements: 2.5, 2.6, 6.4_

  - [ ] 2.7 Implement new token signing and Redis rotation in `validateAndRotate`
    - Sign a new access token using `JWT_SECRET` with claims `sub`, `walletAddress`, `role` (from user record), expiry `15m`
    - Sign a new refresh token using `REFRESH_TOKEN_SECRET` with claim `sub`, expiry `7d`
    - Delete the old Redis key with `this.cache.delete(`refresh:${user.walletAddress}`)`
    - Set the new token with `this.cache.set(`refresh:${user.walletAddress}`, newRefreshToken, 604800000)`
    - Wrap both Redis operations in try/catch; rethrow as `ServiceUnavailableException('Service temporarily unavailable')` on failure
    - Return `{ accessToken, refreshToken: newRefreshToken, tokenType: 'Bearer' }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 2.8 Write property test for `validateAndRotate` — Property 4 (access token claims)
    - **Property 4: New access token always contains the correct claims**
    - **Validates: Requirements 3.1**
    - Use `fast-check` to generate arbitrary user objects with `id`, `walletAddress`, `role`; assert decoded access token has matching `sub`, `walletAddress`, `role`
    - Tag: `// Feature: token-refresh-endpoint, Property 4`
    - _Requirements: 3.1_

  - [ ]* 2.9 Write property test for `validateAndRotate` — Property 5 (refresh token `sub` claim)
    - **Property 5: New refresh token always embeds the correct `sub`**
    - **Validates: Requirements 3.2**
    - Use `fast-check` to generate arbitrary user IDs; assert decoded refresh token `sub` equals `user.id`
    - Tag: `// Feature: token-refresh-endpoint, Property 5`
    - _Requirements: 3.2_

  - [ ]* 2.10 Write property test for `validateAndRotate` — Property 6 (rotation replaces stored token)
    - **Property 6: Token rotation replaces the stored token**
    - **Validates: Requirements 3.3**
    - Use `fast-check` to generate an initial valid token; after a successful `validateAndRotate`, assert the cache holds the new token and the old token is rejected on a second call
    - Tag: `// Feature: token-refresh-endpoint, Property 6`
    - _Requirements: 3.3_

  - [ ]* 2.11 Write property test for `validateAndRotate` — Property 7 (successful response shape)
    - **Property 7: Successful refresh response always contains all required fields**
    - **Validates: Requirements 3.4**
    - Use `fast-check` to generate arbitrary valid inputs; assert response has non-empty `accessToken`, non-empty `refreshToken`, and `tokenType === 'Bearer'`
    - Tag: `// Feature: token-refresh-endpoint, Property 7`
    - _Requirements: 3.4_

  - [ ]* 2.12 Write property test for `validateAndRotate` — Property 10 (error responses never leak token)
    - **Property 10: Error responses never leak the refresh token**
    - **Validates: Requirements 6.2**
    - Use `fast-check` to generate arbitrary tokens and trigger every error path (400, 401, 503); assert response body and headers do not contain the submitted `refreshToken` string
    - Tag: `// Feature: token-refresh-endpoint, Property 10`
    - _Requirements: 6.2_

- [ ] 3. Checkpoint — Ensure `AuthTokenService` unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Create `AuthRefreshController`
  - [ ] 4.1 Create `ignition-api/src/auth/auth-refresh.controller.ts`
    - Declare `@ApiTags('auth') @Controller('auth') @Throttle({ default: { limit: 10, ttl: 60_000 } }) AuthRefreshController` class
    - Inject `AuthTokenService` via constructor
    - Implement `@Post('refresh') @HttpCode(HttpStatus.OK)` method that accepts `@Body() dto: RefreshTokenDto` and returns `this.tokenService.validateAndRotate(dto.refreshToken)`
    - Add `@ApiOperation`, `@ApiBody`, and all `@ApiResponse` decorators (200, 400, 401, 429, 503)
    - _Requirements: 1.1, 1.2, 3.4, 4.1, 4.2_

  - [ ]* 4.2 Write unit tests for `AuthRefreshController` — `auth-refresh.controller.spec.ts`
    - Mock `AuthTokenService`; assert `POST /auth/refresh` returns HTTP 200 and the value from `validateAndRotate`
    - Assert that a missing or empty `refreshToken` body field returns HTTP 400 via `ValidationPipe`
    - _Requirements: 1.1, 1.2, 3.4_

  - [ ]* 4.3 Write property test for `AuthRefreshController` — Property 1 (empty/whitespace tokens rejected)
    - **Property 1: Empty and whitespace refresh tokens are always rejected**
    - **Validates: Requirements 1.2**
    - Use `fast-check` to generate empty strings and whitespace-only strings; submit via body and assert HTTP 400 with `"refreshToken is required"`
    - Tag: `// Feature: token-refresh-endpoint, Property 1`
    - _Requirements: 1.2_

  - [ ]* 4.4 Write property test for `AuthRefreshController` — Property 9 (body-only acceptance)
    - **Property 9: Body-only acceptance — non-body token delivery is always rejected**
    - **Validates: Requirements 6.1**
    - Use `fast-check` to generate arbitrary token strings and submit them as URL query parameters or custom headers; assert HTTP 400 with `"refreshToken is required"`
    - Tag: `// Feature: token-refresh-endpoint, Property 9`
    - _Requirements: 6.1_

- [ ] 5. Patch `users.service.ts` login() to persist refresh token in Redis
  - [ ] 5.1 Inject `CACHE_MANAGER` into `UsersService` and store refresh token after login
    - Add `@Inject(CACHE_MANAGER) private readonly cache: Keyv` to `UsersService` constructor
    - After `refreshToken = this.jwt.sign(...)` in `login()`, add: `await this.cache.set(`refresh:${user.walletAddress}`, refreshToken, 604800000)`
    - _Requirements: 2.4, 3.3_

  - [ ]* 5.2 Update `users.service.spec.ts` to cover the new Redis `cache.set` call
    - Mock `CACHE_MANAGER`; assert `login()` calls `cache.set('refresh:{walletAddress}', refreshToken, 604800000)` with the exact correct arguments
    - _Requirements: 2.4_

- [ ] 6. Wire everything into `auth.module.ts`
  - [ ] 6.1 Update `ignition-api/src/auth/auth.module.ts`
    - Import `CacheModule.registerAsync(...)` in the `imports` array (use the same config pattern as the app module or shared cache config)
    - Add `AuthLogoutController` and `AuthRefreshController` to the `controllers` array
    - Add `AuthTokenService` to the `providers` array
    - Export `AuthTokenService` alongside `JwtModule` in the `exports` array
    - _Requirements: 1.1, 4.1_

- [ ] 7. Checkpoint — Ensure all tests pass and module compiles cleanly
  - Ensure all tests pass, ask the user if questions arise.

  - [ ]* 7.1 Write property test for logout → refresh flow — Property 8
    - **Property 8: Logout always prevents subsequent token reuse**
    - **Validates: Requirements 5.1**
    - Use `fast-check` to generate arbitrary wallet addresses and refresh tokens; after simulating logout (delete from cache mock), assert that a subsequent `validateAndRotate` call returns 401 with `"Refresh token has been revoked"`
    - Tag: `// Feature: token-refresh-endpoint, Property 8`
    - _Requirements: 5.1_

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property-based tests use `fast-check` with `{ numRuns: 100 }` — tag each test with `// Feature: token-refresh-endpoint, Property N`
- `Keyv` is imported from `keyv`; `CACHE_MANAGER` from `@nestjs/cache-manager`
- `TokenExpiredError` is imported from `jsonwebtoken` (available via `@nestjs/jwt`)
- The `LoginResponseDto` from `users/dto/login.dto.ts` is reused as the response type for `AuthRefreshController`
- Redis TTL is always provided in milliseconds to Keyv (`604800000` = 7 days)
- `auth.module.ts` currently has no `AuthLogoutController` registered — it must be added in task 6.1 alongside `AuthRefreshController`

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.4"] },
    { "id": 3, "tasks": ["2.3", "2.5"] },
    { "id": 4, "tasks": ["2.6", "2.7"] },
    { "id": 5, "tasks": ["2.8", "2.9", "2.10", "2.11", "2.12", "4.1", "5.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "4.4", "5.2", "6.1"] },
    { "id": 7, "tasks": ["7.1"] }
  ]
}
```

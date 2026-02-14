# x402-escrow Implementation Plan

> coinbase/x402 Issue #834 분석 기반, 부족한 기능 구현 계획

## Overview

현재 x402-escrow는 **풀 에스크로 보호**(분쟁, 중재, 환불)에 강하지만,
x402 표준 호환성과 고빈도 마이크로페이먼트 효율성이 부족하다.

4개 Phase로 점진적으로 개선한다.

---

## Phase 1: x402 Standard Compatibility (표준 호환)

**목적**: coinbase/x402 생태계와 호환되는 프로토콜 레이어 구축

### 1-1. Header 표준화

현재 커스텀 헤더를 x402 표준으로 마이그레이션:

| 현재 (비표준) | x402 표준 | 방향 |
|---|---|---|
| `X-PAYMENT-REQUIRED` | `PAYMENT-REQUIRED` | base64 JSON, 배열 포맷 지원 |
| `X-PAYMENT` | `PAYMENT-SIGNATURE` | scheme별 payload |
| `X-PAYMENT-RESPONSE` | `PAYMENT-RESPONSE` | 정산 확인 |

**변경 파일:**
- `src/server/middleware/escrowPayment.ts` — 헤더 이름 변경, 양쪽 모두 읽기(하위호환)
- `src/client/escrowFetch.ts` — 새 헤더명 우선, 폴백으로 기존 헤더
- `src/shared/types.ts` — `PaymentRequirements` 배열 타입 추가
- `demo-web/lib/api/payment-flow.ts` — 헤더명 동기화

### 1-2. PaymentRequirements 배열 포맷

x402 표준은 서버가 여러 (scheme, network) 조합을 제시할 수 있다:

```typescript
// 현재: 단일 객체
X-PAYMENT-REQUIRED: base64({ scheme: "escrow", ... })

// 표준: 배열
PAYMENT-REQUIRED: base64([
  { scheme: "escrow", network: "base-sepolia", ... },
  { scheme: "exact", network: "base-sepolia", ... }  // 미래 확장
])
```

**변경 파일:**
- `src/shared/types.ts` — `PaymentRequirements` (배열) 타입 추가, `PaymentRequirement` (단수) 유지
- `src/server/middleware/escrowPayment.ts` — 배열로 응답 생성
- `src/client/escrowFetch.ts` — 배열에서 `scheme: "escrow"` 필터링

### 1-3. scheme 등록 시스템

현재 `"escrow"` 하드코딩 → 플러그인 가능한 scheme registry:

```typescript
// src/shared/schemes.ts (새 파일)
interface PaymentScheme {
  name: string;
  sign(walletClient, requirement): Promise<PaymentPayload>;
  verify(payload): Promise<{ valid: boolean; error?: string }>;
  settle(payload): Promise<{ txHash: Hash; receipt: any }>;
}

const schemeRegistry = new Map<string, PaymentScheme>();
export function registerScheme(scheme: PaymentScheme): void;
export function getScheme(name: string): PaymentScheme | undefined;
```

**변경 파일:**
- `src/shared/schemes.ts` — 새 파일: scheme registry 인터페이스
- `src/server/facilitator/verifier.ts` — `EscrowScheme.verify()` 구현체로 리팩토링
- `src/server/facilitator/settler.ts` — `EscrowScheme.settle()` 구현체로 리팩토링
- `src/client/escrowScheme.ts` — `EscrowScheme.sign()` 구현체로 리팩토링

---

## Phase 2: Facilitator 분리 (Trust-Minimization)

**목적**: verify/settle을 독립 엔드포인트로 분리, 외부 facilitator 호환

### 2-1. Facilitator API 엔드포인트

```
POST /facilitator/verify    — 서명 검증 (off-chain)
POST /facilitator/settle    — on-chain 정산
```

x402 표준 facilitator 인터페이스와 동일한 요청/응답 형식:

```typescript
// POST /facilitator/verify
Request:  { payload: PaymentPayload, paymentRequirements: PaymentRequirement }
Response: { isValid: boolean, invalidReason?: string }

// POST /facilitator/settle
Request:  { payload: PaymentPayload, paymentRequirements: PaymentRequirement }
Response: { success: boolean, txHash?: string, network?: string }
```

**변경 파일:**
- `src/server/routes/facilitator.ts` — 새 파일: `/facilitator/verify`, `/facilitator/settle`
- `src/server/middleware/escrowPayment.ts` — 내부 호출을 facilitator 라우트와 동일 로직 공유
- `src/server/index.ts` — facilitator 라우트 등록
- `demo-web/app/api/facilitator/verify/route.ts` — Next.js 대응
- `demo-web/app/api/facilitator/settle/route.ts` — Next.js 대응

### 2-2. 외부 Facilitator 사용 옵션

리소스 서버가 자체 facilitator 대신 외부 서비스를 사용할 수 있도록:

```typescript
// config에 facilitatorUrl 추가
interface ServerConfig {
  facilitatorUrl?: string;  // 외부 facilitator URL (없으면 내장 사용)
}
```

**변경 파일:**
- `src/server/config.ts` — `facilitatorUrl` 옵션 추가
- `src/server/middleware/escrowPayment.ts` — 외부 facilitator URL 있으면 HTTP 호출, 없으면 내장 호출

---

## Phase 3: Session-Based Micropayments (세션 기반 마이크로페이먼트)

**목적**: Issue #834의 핵심 — authorize-once, use-many 패턴으로 고빈도 결제 최적화

### 3-1. SessionEscrow 컨트랙트

기존 `EscrowVault` 확장 또는 별도 컨트랙트:

```solidity
// contracts/src/SessionEscrow.sol (새 파일)

struct Session {
    bytes32 sessionId;       // keccak256(buyer, seller, nonce)
    address buyer;
    address seller;
    uint256 depositAmount;   // 총 예치금
    uint256 usedAmount;      // 사용된 금액 (facilitator가 업데이트)
    uint256 createdAt;
    uint256 expiresAt;       // 세션 만료 시각
    SessionState state;      // Active, Settled, Voided, Expired
}

function createSessionWithAuth(
    address seller,
    uint256 amount,
    uint256 duration,        // 세션 유효 기간 (초)
    // ERC-3009 params
    address from, uint256 validAfter, uint256 validBefore,
    bytes32 nonce, uint8 v, bytes32 r, bytes32 s
) external returns (bytes32 sessionId);

function captureSession(
    bytes32 sessionId,
    uint256 captureAmount    // 실제 사용량
) external onlyFacilitator;  // facilitator만 정산 가능

function voidSession(
    bytes32 sessionId        // 미사용 잔액 환불
) external;                  // buyer 또는 만료 후 누구나

function reclaimExpired(
    bytes32 sessionId        // 만료된 세션 자금 회수
) external;                  // buyer만
```

**파일:**
- `contracts/src/SessionEscrow.sol` — 새 컨트랙트
- `contracts/test/SessionEscrow.t.sol` — 테스트
- `contracts/src/interfaces/ISessionEscrow.sol` — 인터페이스

### 3-2. 세션 관리 서버 로직

```typescript
// src/server/services/sessionService.ts (새 파일)

interface Session {
  sessionId: string;         // on-chain hash
  buyer: Address;
  seller: Address;
  depositAmount: bigint;
  usedAmount: bigint;        // 서버에서 추적
  remainingAmount: bigint;   // depositAmount - usedAmount
  expiresAt: number;
  status: "active" | "settled" | "voided" | "expired";
}

// 세션 생성 (on-chain deposit 후)
function createSession(sessionId, buyer, seller, amount, expiresAt): Session;

// 사용량 기록 (off-chain, 매 API 호출마다)
function recordUsage(sessionId, amount): { remaining: bigint };

// 배치 정산 (주기적으로 on-chain capture)
function settleSession(sessionId): { txHash: Hash; capturedAmount: bigint };

// 만료 처리
function expireSession(sessionId): void;
```

**DB 스키마 추가:**
```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  buyer_address TEXT NOT NULL,
  seller_address TEXT NOT NULL,
  deposit_amount TEXT NOT NULL,
  used_amount TEXT NOT NULL DEFAULT '0',
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  tx_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE session_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  amount TEXT NOT NULL,
  endpoint TEXT,
  created_at INTEGER NOT NULL
);
```

### 3-3. 세션 헤더 및 인증

```
# 세션 시작 (기존 x402 flow와 동일, scheme만 다름)
PAYMENT-REQUIRED: base64([{ scheme: "session-escrow", ... }])
PAYMENT-SIGNATURE: base64({ scheme: "session-escrow", ..., duration: 3600 })
PAYMENT-RESPONSE: base64({ sessionId: "0x...", expiresAt: ... })

# 세션 사용 (이후 요청들 — 서명 불필요!)
X-SESSION-ID: <sessionId>
X-SESSION-SIG: HMAC-SHA256(sessionId + timestamp, sharedSecret)
X-SESSION-TS: <unix timestamp>
```

**변경 파일:**
- `src/shared/types.ts` — `SessionPaymentRequired`, `SessionPaymentPayload` 타입 추가
- `src/server/middleware/sessionPayment.ts` — 새 파일: 세션 미들웨어
- `src/server/routes/sessions.ts` — 새 파일: 세션 CRUD API
- `src/client/sessionScheme.ts` — 새 파일: 세션 클라이언트 SDK

### 3-4. agent-service 통합

기존 `agent-service` service type에 세션 모드 추가:

```typescript
// src/server/service-types/agent-service.ts 수정
export const agentServiceType: ServiceType = {
  name: "agent-service",
  releaseWindow: 3600,
  autoVerify: true,
  sessionEnabled: true,        // 새 필드
  defaultSessionDuration: 3600, // 1시간 세션
  maxSessionDeposit: 10_000000, // 최대 10 USDC
};
```

**기대 효과:**
- 현재: 1,000 API 호출 = 1,000 서명 + 1,000 on-chain tx
- 개선: 1,000 API 호출 = **1 서명 + 2 on-chain tx** (deposit + capture)
- 가스비 ~99.8% 절감

---

## Phase 4: Permit2 지원 (토큰 확장)

**목적**: ERC-3009 미지원 토큰도 사용 가능하게

### 4-1. Permit2 통합

```solidity
// contracts/src/EscrowVault.sol 에 추가

function createEscrowWithPermit2(
    bytes32 orderId,
    address seller,
    uint256 amount,
    string calldata serviceType,
    uint256 releaseWindow,
    // Permit2 params
    ISignatureTransfer.PermitTransferFrom calldata permit,
    ISignatureTransfer.SignatureTransferDetails calldata transferDetails,
    bytes calldata signature
) external whenNotPaused returns (uint256 escrowId);
```

**변경 파일:**
- `contracts/src/EscrowVault.sol` — `createEscrowWithPermit2()` 함수 추가
- `contracts/src/interfaces/IPermit2.sol` — Permit2 인터페이스 (Uniswap)
- `contracts/test/EscrowVault.t.sol` — Permit2 테스트 추가
- `src/shared/abi.ts` — ABI sync
- `src/client/escrowScheme.ts` — Permit2 서명 옵션 추가
- `src/server/facilitator/settler.ts` — Permit2 settle 경로 추가

### 4-2. 토큰 레지스트리

```typescript
// src/shared/tokens.ts (새 파일)
interface TokenConfig {
  address: Address;
  symbol: string;
  decimals: number;
  authMethod: "erc3009" | "permit2" | "both";
  eip712Domain?: EIP712Domain;  // ERC-3009용
  permit2Address?: Address;      // Permit2용
}

const SUPPORTED_TOKENS: TokenConfig[] = [
  {
    address: USDC_ADDRESS,
    symbol: "USDC",
    decimals: 6,
    authMethod: "both",
    eip712Domain: { name: "USD Coin", version: "2", ... },
  },
  // 추가 토큰들...
];
```

---

## Implementation Priority

```
Phase 1 (표준 호환)     ←── 가장 중요: 생태계 참여 기반
  ├── 1-1: Header 표준화         [2-3일]
  ├── 1-2: 배열 포맷             [1일]
  └── 1-3: scheme 등록           [2-3일]

Phase 2 (Facilitator 분리)  ←── 신뢰 최소화
  ├── 2-1: API 엔드포인트        [2일]
  └── 2-2: 외부 facilitator      [1일]

Phase 3 (세션 마이크로페이먼트)  ←── 핵심 신규 기능
  ├── 3-1: SessionEscrow 컨트랙트 [3-5일]
  ├── 3-2: 서버 세션 관리         [2-3일]
  ├── 3-3: 세션 헤더/인증         [2일]
  └── 3-4: agent-service 통합     [1일]

Phase 4 (Permit2)  ←── 토큰 확장
  ├── 4-1: 컨트랙트 통합          [2-3일]
  └── 4-2: 토큰 레지스트리         [1일]
```

## Non-Goals (하지 않을 것)

- **CREATE3 프록시**: #864 제안이지만 우리 아키텍처와 맞지 않음 (전용 SDK 유지)
- **DeFi yield**: 에스크로 자금으로 수익 창출은 복잡성 대비 가치 낮음
- **Multi-chain**: 현재 Base Sepolia에 집중, 추후 별도 계획
- **Fiat fallback**: 온체인 우선, fiat은 별도 프로젝트

---

## Success Metrics

1. **Phase 1 완료 후**: `@x402/fetch` 클라이언트가 우리 서버와 통신 가능
2. **Phase 2 완료 후**: 외부 facilitator 교체 가능 (coinbase facilitator 등)
3. **Phase 3 완료 후**: 1,000 API 호출에 2 on-chain tx만 발생
4. **Phase 4 완료 후**: USDC 외 토큰으로 에스크로 생성 가능

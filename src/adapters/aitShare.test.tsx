// AIT 네이티브 공유 시트 어댑터(#320) 단위 테스트(vitest). 실제 SDK 대신 주입 가능한
// mock share로 성공/미지원(throw) 분기와 message 전달을 고정한다.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

import { shareViaAitSheet } from "./aitShare";

// shareViaAitSheet 의 두 번째 인자(SDK 호출부) 타입.
type ShareImpl = Parameters<typeof shareViaAitSheet>[1];

describe("shareViaAitSheet (#320)", () => {
  it("AC-1: src/adapters/aitShare 어댑터가 @apps-in-toss/web-framework의 share({ message })를 try/catch로 감싸 성공 시 shared, 미지원 환경 throw 시 unsupported를 반환한다 (mock SDK 단위 테스트) (#320)", async () => {
    // 구조 근거: 어댑터가 @apps-in-toss/web-framework의 share를 기본 SDK로 import해
    // share({ message })를 try/catch로 감싸고, catch에서 unsupported를 반환한다.
    const source = readFileSync("src/adapters/aitShare.ts", "utf8");
    expect(source).toMatch(
      /import\s*\{\s*share\s*\}\s*from\s*["']@apps-in-toss\/web-framework["']/,
    );
    // 기본 SDK 인자가 실제 share다(주입 미지정 시 실제 SDK 사용).
    expect(source).toMatch(/shareImpl:\s*typeof share\s*=\s*share/);
    // share({ message }) 호출을 try/catch로 감싼다.
    expect(source).toMatch(/try\s*\{[\s\S]*shareImpl\(\{\s*message\s*\}\)/);
    expect(source).toMatch(/\}\s*catch\s*\{[\s\S]*return\s*"unsupported"/);
    expect(source).toMatch(/return\s*"shared"/);

    // 행위 근거(mock SDK): 성공하면 shared를 반환하고 { message }를 그대로 넘긴다.
    let received: { message: string } | undefined;
    const ok = (async (options: { message: string }) => {
      received = options;
    }) as ShareImpl;
    expect(await shareViaAitSheet("본문", ok)).toBe("shared");
    expect(received).toEqual({ message: "본문" });

    // 미지원(비동기 reject): try/catch가 잡아 unsupported로 폴백한다.
    const rejects = (async () => {
      throw new Error("bridge not connected");
    }) as ShareImpl;
    expect(await shareViaAitSheet("본문", rejects)).toBe("unsupported");

    // 미지원(동기 throw): 동기 throw도 unsupported로 폴백한다.
    const syncThrow = (() => {
      throw new Error("no bridge");
    }) as unknown as ShareImpl;
    expect(await shareViaAitSheet("본문", syncThrow)).toBe("unsupported");
  });

  it("AC-4: getTossShareLink(토스 진입 링크) 연동을 본 이슈 범위에서 제외하고 후속 이슈로 분리 명시한다 (#320)", () => {
    // 범위 제외는 어댑터 소스에 명시로 남긴다(코드 근거). vitest는 repo 루트에서
    // 실행되므로 cwd 기준 경로로 읽는다.
    const source = readFileSync("src/adapters/aitShare.ts", "utf8");
    expect(source).toMatch(/getTossShareLink/);
    expect(source).toMatch(/본 이슈 범위/);
    expect(source).toMatch(/제외/);
    expect(source).toMatch(/후속 이슈/);
  });

  it("SDK share가 정상 resolve하면 shared를 반환한다", async () => {
    const fake = (async () => {}) as ShareImpl;
    expect(await shareViaAitSheet("본문", fake)).toBe("shared");
  });

  it("SDK share가 비동기 reject(미지원)하면 unsupported로 폴백한다", async () => {
    const fake = (async () => {
      throw new Error("bridge not connected");
    }) as ShareImpl;
    expect(await shareViaAitSheet("본문", fake)).toBe("unsupported");
  });

  it("전달한 텍스트를 { message } 형태로 SDK에 넘긴다", async () => {
    let received: { message: string } | undefined;
    const fake = (async (options: { message: string }) => {
      received = options;
    }) as ShareImpl;
    await shareViaAitSheet("공유할 결과", fake);
    expect(received).toEqual({ message: "공유할 결과" });
  });
});

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { importJWK, jwtVerify } from "jose";
const address = "0x1111111111111111111111111111111111111111";
const merchant = "0x2222222222222222222222222222222222222222";
test("identity → sandbox → delegation, contract validation, and responsive layout", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "신원을 확인해 주세요" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "데모 샌드박스 생성" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "위임 진행 단계" })
      .getByRole("button", { name: "03 위임 설정" }),
  ).toBeDisabled();
  await expect(page.locator('[data-slot="card"]')).toHaveCount(1);
  const businessTab = page.getByRole("tab", { name: "사업자 Business" });
  await businessTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "자연인 Individual" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("사업자등록번호")).toHaveCount(0);
  await page.keyboard.press("ArrowLeft");
  await expect(businessTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("progressbar", { name: "누적 지출" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/kya-desktop-initial.png",
    fullPage: true,
  });
  const early = await request.post("/api/agents/register", {
    data: { sandboxId: "unknown", address },
  });
  expect(early.status()).toBe(404);
  await page.getByLabel("사업자명").fill("Acme Labs");
  await page.getByLabel("사업자등록번호").fill("123-45-67890");
  await page.getByRole("button", { name: "신원 확인하기" }).click();
  await expect(
    page.getByText("Acme Labs · 신원 확인 완료", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "데모 샌드박스 생성" }).click();
  await expect(page.getByLabel("데모 Agent 주소")).toBeVisible();
  await page.getByLabel("데모 Agent 주소").fill(address);
  await page.getByRole("button", { name: "주소 연결" }).click();
  await expect(page.getByLabel("허용 Merchant 주소")).toBeVisible();
  await expect(page.getByLabel("데모 Agent 주소")).toHaveCount(0);
  await page.getByRole("button", { name: "이전 단계" }).click();
  await expect(
    page.getByRole("heading", { name: "Agent를 연결해 주세요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "다음 단계" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "얼마까지 쓸 수 있는지 정해 주세요" }),
  ).toBeVisible();
  await expect(page.getByLabel("허용 Merchant 주소")).toBeVisible();
  const state = await (await request.get("/api/state")).json();
  const scope = {
    network: "eip155:84532",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    perTxLimit: "5000000",
    cumulativeLimit: "10000000",
    merchants: [merchant],
  };
  const before = await request.get(`/agents/${address}/delegation`);
  expect(before.status()).toBe(404);
  const invalid = await request.post("/api/delegations", {
    data: {
      principalId: state.principal.principalId,
      address,
      scope: { ...scope, perTxLimit: "20000000" },
    },
  });
  expect(invalid.status()).toBe(400);
  await page.getByLabel("허용 Merchant 주소").fill(merchant);
  await page.getByRole("button", { name: "위임 발급하기" }).click();
  await expect(page.getByText("서명된 위임 발급 완료")).toBeVisible();
  await expect(
    page.getByText("데모 · 실제 충전 없음", { exact: true }),
  ).toBeVisible();
  const { delegation } = await (
    await request.get(`/agents/${address}/delegation`)
  ).json();
  const doc = await (await request.get("/.well-known/did.json")).json();
  expect(doc.verificationMethod[0].publicKeyJwk.d).toBeUndefined();
  const key = await importJWK(doc.verificationMethod[0].publicKeyJwk, "EdDSA");
  const { payload } = await jwtVerify(delegation, key, {
    algorithms: ["EdDSA"],
    issuer: state.principal.did,
    subject: `did:pkh:eip155:84532:${address.toLowerCase()}`,
  });
  expect(payload.exp! - payload.iat!).toBe(3600);
  expect(payload.vc).toMatchObject({
    credentialSubject: { sandboxId: state.sandbox.sandboxId, scope },
  });
  const duplicate = await (
    await request.post("/api/delegations", {
      data: { principalId: state.principal.principalId, address, scope },
    })
  ).json();
  expect(duplicate.delegation).toBe(delegation);
  const otherAgent = await request.post("/agents/register", {
    data: { sandboxId: state.sandbox.sandboxId, address: merchant },
  });
  expect(otherAgent.status()).toBe(409);
  const origin = await request.post("/api/sandboxes", {
    headers: { origin: "https://other.example" },
    data: {},
  });
  expect(origin.status()).toBe(403);
  expect(
    (
      await request.get(`/principals/${state.principal.principalId}/did.json`)
    ).status(),
  ).toBe(200);
  await page.screenshot({
    path: "/tmp/kya-desktop-issued.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "지출 원장" }).click();
  await expect(
    page.getByRole("progressbar", { name: "누적 지출" }),
  ).toHaveAttribute("data-state", "indeterminate");
  await expect(
    page.getByRole("heading", { name: "Verifier decisions" }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "위임 정보" }).click();
  await expect(
    page.getByRole("button", { name: "Delegation JWT 복사" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "결제 판정" }).click();
  await page.screenshot({ path: "/tmp/kya-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const scriptOutput = execFileSync("bash", ["scripts/fake-agent.sh"], {
    env: {
      ...process.env,
      KYA_URL: "http://localhost:3100",
      ISSUE_DELEGATION: "1",
      MERCHANT_PAYTO: merchant,
    },
    encoding: "utf8",
  });
  expect(scriptOutput).toContain("JWT 서명·issuer·subject·만료 검증 통과");
  expect(errors).toEqual([]);
});

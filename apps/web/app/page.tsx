"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Copy,
  Fingerprint,
  Globe2,
  Hexagon,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Wallet,
  X,
} from "lucide-react";
import { parseUnits, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { NETWORK, USDC, type Decision, type PublicState } from "@/lib/types";
const short = (value: string) =>
  value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
const money = (value?: string) => {
  try {
    return Number(formatUnits(BigInt(value || "0"), 6)).toLocaleString(
      "en-US",
      { maximumFractionDigits: 6 },
    );
  } catch {
    return "—";
  }
};
const reasonText: Record<string, string> = {
  "kya:per_tx_limit_exceeded": "1회 한도를 초과했습니다.",
  "kya:cumulative_limit_exceeded": "누적 한도를 초과했습니다.",
  "kya:merchant_not_allowed": "허용 가맹점 목록에 없습니다.",
  "kya:subject_mismatch": "Agent와 결제 서명이 일치하지 않습니다.",
  "kya:invalid_delegation": "유효하지 않거나 만료된 위임입니다.",
  "kya:missing_delegation": "위임이 없습니다.",
};
async function api(path: string, body?: unknown) {
  const response = await fetch(`/api/${path}`, {
    ...(body !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "요청에 실패했습니다.");
  return result;
}
function StatusBadge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <Badge variant="outline" className={`status-badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </Badge>
  );
}
export default function Home() {
  const [state, setState] = useState<PublicState | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [verifier, setVerifier] = useState(false);
  const [spent, setSpent] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const [entityType, setEntityType] = useState<"business" | "person">(
    "business",
  );
  const [name, setName] = useState("");
  const [registration, setRegistration] = useState("");
  const [perTx, setPerTx] = useState("5");
  const [cumulative, setCumulative] = useState("10");
  const [merchant, setMerchant] = useState("");
  const [agentAddress, setAgentAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [help, setHelp] = useState(false);
  const merchantInitialized = useRef(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const current: PublicState = await api("state");
        if (stopped) return;
        setState(current);
        setConnectionError(false);
        if (!merchantInitialized.current && current.merchantPayTo) {
          setMerchant(current.merchantPayTo);
          merchantInitialized.current = true;
        }
        const results = await Promise.allSettled([
          api("verifier/decisions"),
          current.delegation
            ? api(`verifier/ledger/${current.delegation.jti}`)
            : Promise.resolve(null),
        ]);
        if (stopped) return;
        const d = results[0];
        setVerifier(d.status === "fulfilled" && Array.isArray(d.value));
        if (d.status === "fulfilled" && Array.isArray(d.value))
          setDecisions(d.value);
        const l = results[1];
        // The ledger read response is not specified in the shared contract; support common field names.
        const value = l.status === "fulfilled" ? l.value : null;
        const amount =
          typeof value === "string"
            ? value
            : (value?.spent ??
              value?.totalSpent ??
              value?.total ??
              value?.amount);
        setSpent(
          typeof amount === "string" && /^\d+$/.test(amount) ? amount : null,
        );
      } catch {
        if (!stopped) setConnectionError(true);
      } finally {
        if (!stopped) timer = setTimeout(poll, 1000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  async function action(key: string, task: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await task();
      setState(await api("state"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }
  const principal = state?.principal;
  const sandbox = state?.sandbox;
  const agent = state?.agent;
  const delegation = state?.delegation;
  const issued = delegation && delegation.fundingStatus !== "pending";
  const expired = !!delegation && delegation.exp <= Date.now() / 1000;
  const step = issued ? 4 : agent ? 3 : principal ? 2 : 1;
  const relevant = decisions.filter(
    (d) => delegation && d.jti === delegation.jti,
  );
  const approved = relevant.filter((d) => d.decision === "approved").length;
  const denied = relevant.filter((d) => d.decision === "denied").length;
  const progress =
    spent && delegation
      ? Math.max(
          0,
          Math.min(
            100,
            Number(
              (BigInt(spent) * 10000n) /
                BigInt(delegation.scope.cumulativeLimit),
            ) / 100,
          ),
        )
      : 0;
  const loading = (key: string) =>
    busy === key ? (
      <LoaderCircle className="spin" size={16} />
    ) : (
      <ArrowRight size={16} />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="KYA 홈">
          <span className="brand-mark">
            <Layers3 size={23} strokeWidth={2.5} />
          </span>
          kya<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">K</span>
          <div>
            KYA Workspace<small>Hackathon workspace</small>
          </div>
          <span className="workspace-label">DEV</span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          <a className="nav-item active" href="#overview">
            <Layers3 size={17} /> Overview <span>01</span>
          </a>
          <a className="nav-item" href="#identity">
            <Fingerprint size={17} /> Identity verification
          </a>
          <a className="nav-item" href="#agent">
            <Hexagon size={17} /> Agent & sandbox
          </a>
          <a className="nav-item" href="#decisions">
            <ShieldCheck size={17} /> Verifier decisions
          </a>
          <a className="nav-item" href="#ledger">
            <Wallet size={17} /> Spend ledger
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="network-card">
            <span className="base-mark" />
            <div>
              Base Sepolia<small>Testnet environment</small>
            </div>
            <span className="green-dot" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="help-button"
            onClick={() => setHelp(!help)}
          >
            <CircleHelp size={17} /> KYA는 어떻게 동작하나요?{" "}
            <ArrowUpRight size={14} />
          </Button>
          <div className="profile">
            <div className="avatar">{principal?.name.slice(0, 1) || "P"}</div>
            <div>
              {principal?.name || "Principal"}
              <small>
                {principal ? "Identity verified · Demo" : "신원 확인 대기 중"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <main id="overview">
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={14} />
            <strong>Overview</strong>
          </div>
          <div className="topbar-right">
            <span className="network-pill">
              <span className="base-mark" /> Base Sepolia
            </span>
            <span className="testnet">TESTNET</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> TRUST STARTS WITH IDENTITY
              </div>
              <h1>Know your agent.</h1>
              <p>
                누가, 누구를 대신해, 얼마까지.
                <br className="mobile-break" /> 검증 가능한 Agent 결제의 시작.
              </p>
            </div>
            <div className="live-state">
              <span className={connectionError ? "amber-dot" : "green-dot"} />
              {connectionError ? "연결 재시도 중" : "Workspace live"}
              <small>매 1초 자동 업데이트</small>
            </div>
          </div>
          {help && (
            <div className="help-panel">
              <ShieldCheck size={22} />
              <p>
                <strong>신원에서 결제까지 이어지는 신뢰</strong>
                <br />
                Principal이 신원 확인을 마치면 Agent에 지출 범위를 담은 위임을
                발급합니다. Verifier는 결제 직전 위임과 범위를 확인하고, 정산된
                금액을 지출 원장에 기록합니다. 이 해커톤의 신원 확인은 실제
                심사를 수행하지 않는 데모 스텁입니다.
              </p>
              <Button
                variant="ghost"
                size="sm"
                aria-label="안내 닫기"
                onClick={() => setHelp(false)}
              >
                <X size={18} />
              </Button>
            </div>
          )}
          <section className="journey" aria-label="위임 진행 단계">
            {[
              {
                title: "Verify identity",
                sub: "Principal 신원 확인",
                icon: Fingerprint,
              },
              {
                title: "Connect agent",
                sub: "격리된 샌드박스 연결",
                icon: Hexagon,
              },
              {
                title: "Set delegation",
                sub: "지출 범위와 위임 발급",
                icon: SlidersHorizontal,
              },
              {
                title: "Trust every payment",
                sub: "결제 직전 검증",
                icon: ShieldCheck,
              },
            ].map((s, i) => (
              <div
                className={`journey-step ${step > i + 1 ? "complete" : ""} ${step === i + 1 ? "current" : ""}`}
                key={s.title}
              >
                <span className="step-icon">
                  {step > i + 1 ? <Check size={20} /> : <s.icon size={20} />}
                </span>
                <div>
                  <span className="step-kicker">STEP 0{i + 1}</span>
                  <strong>{s.title}</strong>
                  <small>{s.sub}</small>
                </div>
                {i < 3 && <ChevronRight className="journey-arrow" size={18} />}
              </div>
            ))}
          </section>
          {error && (
            <Alert variant="destructive" className="error-banner" role="alert">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError("")}
                aria-label="오류 닫기"
              >
                <X size={16} />
              </Button>
            </Alert>
          )}
          <div className="dashboard">
            <Card role="region" className="card identity-card" id="identity">
              <CardHeader className="card-heading">
                <div className="heading-icon orange">
                  <Fingerprint size={20} />
                </div>
                <div>
                  <CardTitle role="heading" aria-level={2}>
                    Identity & delegation
                  </CardTitle>
                  <CardDescription>
                    신원을 확인하고 Agent의 지출 범위를 정하세요.
                  </CardDescription>
                </div>
                <StatusBadge tone={principal ? "green" : ""}>
                  {principal ? "확인됨" : "확인 대기"}
                </StatusBadge>
              </CardHeader>
              <CardContent className="card-body">
                <div className="section-title">
                  <span>01</span>
                  <h3>Principal 신원 확인</h3>
                  <span className="subtle-tag">DEMO VERIFICATION</span>
                </div>
                {principal ? (
                  <div className="verified-panel">
                    <span className="verified-icon">
                      <CheckCheck size={24} />
                    </span>
                    <div>
                      <strong>{principal.name}</strong>
                      <p>
                        {principal.entityType === "business"
                          ? "사업자"
                          : "자연인"}{" "}
                        · 신원 확인 완료
                      </p>
                      <code title={principal.did}>{short(principal.did)}</code>
                    </div>
                    <StatusBadge tone="green">Verified</StatusBadge>
                  </div>
                ) : (
                  <form
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      void action("identity", () =>
                        api("principals", {
                          entityType,
                          name,
                          registrationNumber: registration,
                        }),
                      );
                    }}
                  >
                    <Tabs
                      value={entityType}
                      onValueChange={(value) =>
                        setEntityType(value as "business" | "person")
                      }
                      className="mb-5"
                    >
                      <TabsList
                        aria-label="Principal 실체 유형"
                        className="w-full"
                      >
                        <TabsTrigger value="business" className="text-xs">
                          <Globe2 size={15} />
                          사업자{" "}
                          <span className="text-muted-foreground">
                            Business
                          </span>
                        </TabsTrigger>
                        <TabsTrigger value="person" className="text-xs">
                          <Fingerprint size={15} />
                          자연인{" "}
                          <span className="text-muted-foreground">
                            Individual
                          </span>
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value={entityType}>
                        <label>
                          {entityType === "business" ? "사업자명" : "이름"}{" "}
                          <span>*</span>
                          <Input
                            className="mt-2 h-10 text-xs"
                            required
                            minLength={2}
                            maxLength={100}
                            placeholder={
                              entityType === "business"
                                ? "예: Acme Labs"
                                : "실명을 입력해 주세요"
                            }
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="organization"
                          />
                        </label>
                        {entityType === "business" && (
                          <label>
                            사업자등록번호 <span>*</span>
                            <Input
                              className="mt-2 h-10 text-xs"
                              required
                              pattern="[0-9]{3}-?[0-9]{2}-?[0-9]{5}"
                              placeholder="000-00-00000"
                              value={registration}
                              onChange={(e) => setRegistration(e.target.value)}
                              inputMode="numeric"
                            />
                            <small>
                              10자리 사업자등록번호를 입력해 주세요.
                            </small>
                          </label>
                        )}
                      </TabsContent>
                    </Tabs>
                    <div className="info-note">
                      <LockKeyhole size={14} />
                      <span>
                        해커톤 데모에서는 실제 신원 심사 없이 확인됩니다.
                      </span>
                    </div>
                    <Button
                      variant="default"
                      className="h-10 text-xs w-full justify-between"
                      disabled={!!busy || !state}
                      type="submit"
                    >
                      신원 확인하기 {loading("identity")}
                    </Button>
                  </form>
                )}
                <div className={`scope-section ${!agent ? "inactive" : ""}`}>
                  <div className="section-title">
                    <span>02</span>
                    <h3>Delegation 범위 설정</h3>
                    {!agent && <LockKeyhole size={14} />}
                  </div>
                  {!agent ? (
                    <div className="locked-scope">
                      <div>
                        <span>
                          1회 한도
                          <strong>
                            5 <small>USDC</small>
                          </strong>
                        </span>
                        <span>
                          누적 한도
                          <strong>
                            10 <small>USDC</small>
                          </strong>
                        </span>
                        <span>
                          유효 기간
                          <strong>
                            1 <small>시간</small>
                          </strong>
                        </span>
                      </div>
                      <p>
                        신원 확인 후 Agent를 연결하면 위임을 발급할 수 있어요.
                      </p>
                    </div>
                  ) : issued ? (
                    <div className="issued">
                      <div className="issued-title">
                        <ShieldCheck size={20} />
                        <strong>
                          {expired
                            ? "위임이 만료되었습니다"
                            : "서명된 위임 발급 완료"}
                        </strong>
                        <StatusBadge tone={expired ? "" : "green"}>
                          {expired ? "Expired" : "Active"}
                        </StatusBadge>
                      </div>
                      <dl>
                        <div>
                          <dt>1회 / 누적 한도</dt>
                          <dd>
                            {money(delegation.scope.perTxLimit)} /{" "}
                            {money(delegation.scope.cumulativeLimit)} USDC
                          </dd>
                        </div>
                        <div>
                          <dt>만료 시각</dt>
                          <dd>
                            {new Date(delegation.exp * 1000).toLocaleTimeString(
                              "ko-KR",
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Credential ID</dt>
                          <dd title={delegation.jti}>
                            {short(delegation.jti)}
                          </dd>
                        </div>
                        <div>
                          <dt>Treasury</dt>
                          <dd>
                            {delegation.fundingStatus === "simulated"
                              ? "데모 · 실제 충전 없음"
                              : "20 USDC 충전 완료"}
                          </dd>
                        </div>
                      </dl>
                      {delegation.fundingTx && (
                        <a
                          className="text-link"
                          href={`https://sepolia.basescan.org/tx/${delegation.fundingTx}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          충전 트랜잭션 확인 <ArrowUpRight size={14} />
                        </a>
                      )}
                      <Button
                        variant="outline"
                        className="h-10 text-xs w-full "
                        onClick={() =>
                          void action("copy", async () => {
                            const result = await api(
                              `agents/${agent.address}/delegation`,
                            );
                            await navigator.clipboard.writeText(
                              result.delegation,
                            );
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          })
                        }
                        disabled={!!busy || expired}
                      >
                        {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
                        {copied ? "복사했습니다" : "Delegation JWT 복사"}
                      </Button>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action("delegation", async () =>
                          api("delegations", {
                            principalId: principal?.principalId,
                            address: agent.address,
                            scope: {
                              network: NETWORK,
                              asset: USDC,
                              perTxLimit: parseUnits(perTx, 6).toString(),
                              cumulativeLimit: parseUnits(
                                cumulative,
                                6,
                              ).toString(),
                              merchants: merchant
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            },
                          }),
                        );
                      }}
                    >
                      <div className="two-inputs">
                        <label>
                          1회 한도{" "}
                          <div className="unit-input">
                            <Input
                              className="mt-2 h-10 text-xs"
                              type="number"
                              min="0.000001"
                              step="0.000001"
                              required
                              value={perTx}
                              onChange={(e) => setPerTx(e.target.value)}
                              disabled={!!delegation}
                            />
                            <span>USDC</span>
                          </div>
                        </label>
                        <label>
                          누적 한도
                          <div className="unit-input">
                            <Input
                              className="mt-2 h-10 text-xs"
                              type="number"
                              min={perTx}
                              step="0.000001"
                              required
                              value={cumulative}
                              onChange={(e) => setCumulative(e.target.value)}
                              disabled={!!delegation}
                            />
                            <span>USDC</span>
                          </div>
                        </label>
                      </div>
                      <label>
                        허용 Merchant 주소
                        <Input
                          className="mt-2 h-10 text-xs"
                          required
                          placeholder="0x… (여러 주소는 쉼표로 구분)"
                          value={merchant}
                          onChange={(e) => setMerchant(e.target.value)}
                          disabled={!!delegation}
                        />
                      </label>
                      <div className="duration">
                        <span>위임 유효 기간</span>
                        <strong>1시간</strong>
                      </div>
                      <Button
                        variant="default"
                        className="h-10 text-xs w-full justify-between"
                        disabled={!!busy}
                      >
                        {delegation
                          ? "충전 확인 및 발급 재시도"
                          : "위임 발급하기"}{" "}
                        {loading("delegation")}
                      </Button>
                    </form>
                  )}
                </div>
              </CardContent>
              <CardFooter className="card-footer">
                <ShieldCheck size={14} /> Principal이 확인된 후에만 위임을
                발급할 수 있습니다.
              </CardFooter>
            </Card>
            <div className="right-column">
              <Card role="region" className="card" id="agent">
                <CardHeader className="card-heading">
                  <div className="heading-icon">
                    <Terminal size={19} />
                  </div>
                  <div>
                    <CardTitle role="heading" aria-level={2}>
                      Agent & sandbox
                    </CardTitle>
                    <CardDescription>
                      격리된 환경, 독립된 Agent.
                    </CardDescription>
                  </div>
                  <StatusBadge tone={agent ? "green" : ""}>
                    {agent ? "연결됨" : sandbox ? "주소 대기" : "미연결"}
                  </StatusBadge>
                </CardHeader>
                <div className="agent-body">
                  <div className="sandbox-visual">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <div className="sandbox-cube">
                      <Hexagon size={35} strokeWidth={1.4} />
                      <span className={sandbox ? "green-dot" : "neutral-dot"} />
                    </div>
                  </div>
                  <div className="agent-description">
                    <strong>
                      {sandbox
                        ? "Agent를 위한 공간이 준비됐어요"
                        : "Agent의 안전한 실행 공간"}
                    </strong>
                    <p>
                      {sandbox
                        ? agent
                          ? "지갑 주소가 등록되어 위임을 받을 수 있습니다."
                          : "러너가 지갑을 만들고 주소를 보고하기를 기다립니다."
                        : "Daytona 샌드박스 안에서 실행되고,\n지갑 개인키는 그 안에 머무릅니다."}
                    </p>
                    <span className="daytona-label">
                      <Layers3 size={12} /> Powered by Daytona
                    </span>
                  </div>
                </div>
                {!sandbox ? (
                  <div className="agent-action">
                    <Button
                      variant="outline"
                      className="h-10 text-xs w-full "
                      disabled={!principal || !!busy}
                      onClick={() =>
                        void action("sandbox", () => api("sandboxes", {}))
                      }
                    >
                      {!principal ? (
                        <LockKeyhole size={14} />
                      ) : (
                        <Hexagon size={14} />
                      )}{" "}
                      {state?.demo ? "데모 샌드박스 생성" : "샌드박스 생성하기"}{" "}
                      {busy === "sandbox" && (
                        <LoaderCircle size={14} className="spin" />
                      )}
                    </Button>
                    {!principal && (
                      <p>먼저 Principal 신원 확인을 완료해 주세요.</p>
                    )}
                  </div>
                ) : (
                  <div className="sandbox-details">
                    <div>
                      <span>Sandbox ID</span>
                      <code>{sandbox.sandboxId}</code>
                    </div>
                    <div>
                      <span>Agent wallet</span>
                      <code title={agent?.address}>
                        {agent ? short(agent.address) : "등록 대기 중…"}
                      </code>
                    </div>
                    {sandbox.simulated && !agent && (
                      <form
                        className="register-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action("register", () =>
                            api("agents/register", {
                              sandboxId: sandbox.sandboxId,
                              address: agentAddress,
                            }),
                          );
                        }}
                      >
                        <label>
                          데모 Agent 주소
                          <Input
                            className="mt-2 h-10 text-xs"
                            required
                            placeholder="0x…"
                            value={agentAddress}
                            onChange={(e) => setAgentAddress(e.target.value)}
                          />
                        </label>
                        <Button
                          variant="outline"
                          className="h-10 text-xs  "
                          disabled={!!busy}
                        >
                          주소 연결 {loading("register")}
                        </Button>
                      </form>
                    )}
                  </div>
                )}
                <div className="event-console">
                  <div className="console-title">
                    <span>
                      <span className="neutral-dot" /> AGENT EVENTS
                    </span>
                    <span>
                      {String(state?.events.length || 0).padStart(2, "0")}{" "}
                      events
                    </span>
                  </div>
                  <div className="events" aria-live="polite">
                    {!state?.events.length ? (
                      <p className="empty-event">
                        <span>›</span> Agent가 연결되면 활동이 여기에
                        표시됩니다.
                        <span className="cursor" />
                      </p>
                    ) : (
                      state.events
                        .slice(-6)
                        .reverse()
                        .map((e, i) => (
                          <div className="event" key={`${e.at}-${i}`}>
                            <time>
                              {new Date(e.at).toLocaleTimeString("en-GB")}
                            </time>
                            <span>{e.message}</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </Card>
              <Card role="region" className="card" id="ledger">
                <CardHeader className="card-heading">
                  <div className="heading-icon">
                    <Wallet size={19} />
                  </div>
                  <div>
                    <CardTitle role="heading" aria-level={2}>
                      Spend ledger
                    </CardTitle>
                    <CardDescription>
                      위임 범위 안에서, 투명하게.
                    </CardDescription>
                  </div>
                  <span className="subtle-tag">USDC</span>
                </CardHeader>
                <CardContent className="ledger-body">
                  <div className="ledger-value">
                    <strong>
                      {spent !== null ? money(spent) : "—"}
                      <span>
                        {" "}
                        /{" "}
                        {delegation
                          ? money(delegation.scope.cumulativeLimit)
                          : "10"}{" "}
                        <small>USDC</small>
                      </span>
                    </strong>
                    <span>
                      {spent === null
                        ? "정산 데이터 대기"
                        : `${progress.toFixed(0)}% 사용`}
                    </span>
                  </div>
                  <Progress
                    className="h-2 bg-muted"
                    value={spent === null ? null : progress}
                    aria-label="누적 지출"
                  />
                  <div className="ledger-legend">
                    <span>
                      <i /> 누적 정산 금액
                    </span>
                    <span>누적 한도</span>
                  </div>
                  <div className="ledger-stats">
                    <div>
                      <span>1회 한도</span>
                      <strong>
                        {delegation ? money(delegation.scope.perTxLimit) : "5"}{" "}
                        <small>USDC</small>
                      </strong>
                    </div>
                    <div>
                      <span>승인 판정</span>
                      <strong>
                        {approved}
                        <small>건</small>
                      </strong>
                    </div>
                    <div>
                      <span>거절 판정</span>
                      <strong>
                        {denied}
                        <small>건</small>
                      </strong>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <Card role="region" className="card decisions-card" id="decisions">
              <CardHeader className="card-heading">
                <div className="heading-icon">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <CardTitle role="heading" aria-level={2}>
                    Verifier decisions
                  </CardTitle>
                  <CardDescription>
                    돈이 움직이기 직전, 모든 결제의 위임을 확인합니다.
                  </CardDescription>
                </div>
                <StatusBadge tone={verifier ? "green" : ""}>
                  {verifier ? "Live" : "연결 대기"}
                </StatusBadge>
              </CardHeader>
              {relevant.length ? (
                <div className="decision-list">
                  {[...relevant].reverse().map((d, i) => (
                    <div className="decision-row" key={`${d.at}-${i}`}>
                      <span className={`decision-icon ${d.decision}`}>
                        {d.decision === "approved" ? (
                          <Check size={18} />
                        ) : (
                          <X size={18} />
                        )}
                      </span>
                      <div className="decision-who">
                        <strong>
                          {principal?.name || "Principal"}{" "}
                          <ArrowRight size={12} />{" "}
                          <code title={d.payer}>{short(d.payer)}</code>
                        </strong>
                        <p>
                          {d.reason
                            ? reasonText[d.reason] || d.reason
                            : "위임과 지출 범위 검사를 통과했습니다."}
                        </p>
                      </div>
                      <strong className="decision-amount">
                        {money(d.amount)} <small>USDC</small>
                      </strong>
                      <StatusBadge
                        tone={d.decision === "approved" ? "green" : "red"}
                      >
                        {d.decision === "approved" ? "승인" : "거절"}
                      </StatusBadge>
                      <time>{new Date(d.at).toLocaleTimeString("ko-KR")}</time>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="decisions-empty">
                  <div className="empty-shield">
                    <ShieldCheck size={26} strokeWidth={1.4} />
                  </div>
                  <strong>첫 번째 결제를 기다리고 있어요</strong>
                  <p>
                    Agent에 위임을 발급하면 결제별 승인·거절 판정을 확인할 수
                    있습니다.
                  </p>
                  <div className="trust-flow">
                    <span>
                      <Fingerprint size={13} /> Principal
                    </span>
                    <ArrowRight size={12} />
                    <span>
                      <Hexagon size={13} /> Agent
                    </span>
                    <ArrowRight size={12} />
                    <span>
                      <ShieldCheck size={13} /> Verifier
                    </span>
                    <ArrowRight size={12} />
                    <span>
                      <Check size={13} /> Payment
                    </span>
                  </div>
                </div>
              )}
            </Card>
          </div>
          <footer className="page-footer">
            <span>
              <LockKeyhole size={12} /> Built on identity. Bounded by trust.
            </span>
            <span>
              KYA Protocol <span className="footer-dot">·</span>{" "}
              {state?.demo
                ? "Local demo · 실제 충전 없음"
                : "Base Sepolia testnet"}{" "}
              <span className="footer-dot">·</span> v0.1
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

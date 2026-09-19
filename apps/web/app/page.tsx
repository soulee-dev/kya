"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  CircleAlert,
  Copy,
  Fingerprint,
  Globe2,
  Hexagon,
  Layers3,
  LoaderCircle,
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
  CardAction,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
      <LoaderCircle className="animate-spin" size={16} />
    ) : (
      <ArrowRight size={16} />
    );
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <a href="/" aria-label="KYA 홈">
                  <Layers3 className="text-primary" />
                  <span className="text-xl font-semibold">kya.</span>
                  <Badge variant="secondary" className="ml-auto">
                    DEV
                  </Badge>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { label: "Overview", href: "#overview", icon: Layers3 },
                  {
                    label: "Identity verification",
                    href: "#identity",
                    icon: Fingerprint,
                  },
                  { label: "Agent & sandbox", href: "#agent", icon: Hexagon },
                  {
                    label: "Verifier decisions",
                    href: "#decisions",
                    icon: ShieldCheck,
                  },
                  { label: "Spend ledger", href: "#ledger", icon: Wallet },
                ].map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild>
                      <a href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setHelp(true)}>
                <CircleHelp />
                <span>KYA는 어떻게 동작하나요?</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarSeparator />
          <div className="space-y-1 px-2 py-3 text-sm">
            <p className="font-medium">{principal?.name || "Principal"}</p>
            <p className="text-xs text-muted-foreground">
              {principal ? "Identity verified · Demo" : "신원 확인 대기 중"}
            </p>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">Workspace</span>
            <ChevronRight className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Overview</span>
          </div>
          <Badge variant="outline">Base Sepolia</Badge>
        </header>
        <main
          id="overview"
          className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-4 md:p-8"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">
                Know Your Agent
              </p>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Know your agent.
              </h1>
              <p className="text-sm text-muted-foreground">
                누가, 누구를 대신해, 얼마까지. 검증 가능한 Agent 결제의 시작.
              </p>
            </div>
            <Badge variant={connectionError ? "destructive" : "secondary"}>
              {connectionError ? "연결 재시도 중" : "Workspace live"}
            </Badge>
          </div>
          <ol
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="위임 진행 단계"
          >
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
              <li
                key={s.title}
                aria-current={step === i + 1 ? "step" : undefined}
                className="flex items-center gap-3"
              >
                <Badge variant={step === i + 1 ? "default" : "outline"}>
                  {step > i + 1 ? <Check /> : i + 1}
                </Badge>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.sub}</p>
                </div>
              </li>
            ))}
          </ol>
          <Dialog open={help} onOpenChange={setHelp}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>신원에서 결제까지 이어지는 신뢰</DialogTitle>
                <DialogDescription>
                  Principal이 신원 확인을 마치면 Agent에 지출 범위를 담은 위임을
                  발급합니다. Verifier는 결제 직전 위임과 범위를 확인하고,
                  정산된 금액을 지출 원장에 기록합니다.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                이 해커톤의 신원 확인은 실제 심사를 수행하지 않는 데모
                스텁입니다.
              </p>
            </DialogContent>
          </Dialog>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>요청을 완료하지 못했습니다</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
                <Button variant="ghost" size="sm" onClick={() => setError("")}>
                  닫기
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <Card id="identity" className="min-w-0">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Identity & delegation
                </CardTitle>
                <CardDescription>
                  신원을 확인하고 Agent의 지출 범위를 정하세요.
                </CardDescription>
                <CardAction>
                  <Badge variant={principal ? "default" : "secondary"}>
                    {principal ? "확인됨" : "확인 대기"}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    01 · Principal 신원 확인
                  </h3>
                  <Badge variant="outline">Demo verification</Badge>
                </div>
                {principal ? (
                  <Alert>
                    <ShieldCheck />
                    <AlertTitle>{principal.name}</AlertTitle>
                    <AlertDescription>
                      <p>
                        {principal.entityType === "business"
                          ? "사업자"
                          : "자연인"}{" "}
                        · 신원 확인 완료
                      </p>
                      <code className="break-all text-xs">{principal.did}</code>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <form
                    className="space-y-4"
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
                    >
                      <TabsList
                        className="w-full"
                        aria-label="Principal 실체 유형"
                      >
                        <TabsTrigger value="business">
                          <Globe2 />
                          사업자 Business
                        </TabsTrigger>
                        <TabsTrigger value="person">
                          <Fingerprint />
                          자연인 Individual
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent
                        value={entityType}
                        className="space-y-4 pt-2"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="principal-name">
                            {entityType === "business" ? "사업자명" : "이름"}
                          </Label>
                          <Input
                            id="principal-name"
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
                            autoComplete={
                              entityType === "business"
                                ? "organization"
                                : "name"
                            }
                          />
                        </div>
                        {entityType === "business" && (
                          <div className="space-y-2">
                            <Label htmlFor="registration">사업자등록번호</Label>
                            <Input
                              id="registration"
                              required
                              pattern="[0-9]{3}-?[0-9]{2}-?[0-9]{5}"
                              placeholder="000-00-00000"
                              value={registration}
                              onChange={(e) => setRegistration(e.target.value)}
                              inputMode="numeric"
                              aria-describedby="registration-hint"
                            />
                            <p
                              id="registration-hint"
                              className="text-xs text-muted-foreground"
                            >
                              10자리 사업자등록번호를 입력해 주세요.
                            </p>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                    <p className="text-xs text-muted-foreground">
                      해커톤 데모에서는 실제 신원 심사 없이 확인됩니다.
                    </p>
                    <Button
                      className="w-full"
                      disabled={!!busy || !state}
                      type="submit"
                    >
                      신원 확인하기 {loading("identity")}
                    </Button>
                  </form>
                )}
                <Separator />
                <h3 className="text-sm font-medium">
                  02 · Delegation 범위 설정
                </h3>
                {!agent ? (
                  <div className="space-y-4">
                    <dl className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <dt className="text-muted-foreground">1회 한도</dt>
                        <dd className="mt-1 font-medium">5 USDC</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">누적 한도</dt>
                        <dd className="mt-1 font-medium">10 USDC</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">유효 기간</dt>
                        <dd className="mt-1 font-medium">1시간</dd>
                      </div>
                    </dl>
                    <p className="text-sm text-muted-foreground">
                      신원 확인 후 Agent를 연결하면 위임을 발급할 수 있어요.
                    </p>
                  </div>
                ) : issued ? (
                  <div className="space-y-4">
                    <Alert>
                      <ShieldCheck />
                      <AlertTitle>
                        {expired
                          ? "위임이 만료되었습니다"
                          : "서명된 위임 발급 완료"}
                      </AlertTitle>
                      <AlertDescription>
                        {expired ? "Expired" : "Active · EdDSA"}
                      </AlertDescription>
                    </Alert>
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">
                          1회 / 누적 한도
                        </dt>
                        <dd>
                          {money(delegation.scope.perTxLimit)} /{" "}
                          {money(delegation.scope.cumulativeLimit)} USDC
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">만료 시각</dt>
                        <dd>
                          {new Date(delegation.exp * 1000).toLocaleTimeString(
                            "ko-KR",
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Credential ID</dt>
                        <dd
                          title={delegation.jti}
                          className="font-mono text-xs"
                        >
                          {short(delegation.jti)}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-muted-foreground">Treasury</dt>
                        <dd>
                          {delegation.fundingStatus === "simulated"
                            ? "데모 · 실제 충전 없음"
                            : "20 USDC 충전 완료"}
                        </dd>
                      </div>
                    </dl>
                    {delegation.fundingTx && (
                      <Button variant="link" asChild>
                        <a
                          href={`https://sepolia.basescan.org/tx/${delegation.fundingTx}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          충전 트랜잭션 확인
                          <ArrowUpRight />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!!busy || expired}
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
                    >
                      {copied ? <Check /> : <Copy />}
                      {copied ? "복사했습니다" : "Delegation JWT 복사"}
                    </Button>
                  </div>
                ) : (
                  <form
                    className="space-y-4"
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="per-tx">1회 한도 (USDC)</Label>
                        <Input
                          id="per-tx"
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          required
                          value={perTx}
                          onChange={(e) => setPerTx(e.target.value)}
                          disabled={!!delegation}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cumulative">누적 한도 (USDC)</Label>
                        <Input
                          id="cumulative"
                          type="number"
                          min={perTx}
                          step="0.000001"
                          required
                          value={cumulative}
                          onChange={(e) => setCumulative(e.target.value)}
                          disabled={!!delegation}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="merchant">허용 Merchant 주소</Label>
                      <Input
                        id="merchant"
                        required
                        placeholder="0x… (여러 주소는 쉼표로 구분)"
                        value={merchant}
                        onChange={(e) => setMerchant(e.target.value)}
                        disabled={!!delegation}
                      />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        위임 유효 기간
                      </span>
                      <span>1시간</span>
                    </div>
                    <Button className="w-full" disabled={!!busy}>
                      {delegation
                        ? "충전 확인 및 발급 재시도"
                        : "위임 발급하기"}
                      {loading("delegation")}
                    </Button>
                  </form>
                )}
              </CardContent>
              <CardFooter>
                <p className="text-xs text-muted-foreground">
                  Principal이 확인된 후에만 위임을 발급할 수 있습니다.
                </p>
              </CardFooter>
            </Card>
            <div className="grid min-w-0 gap-6">
              <Card id="agent" className="min-w-0">
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Agent & sandbox
                  </CardTitle>
                  <CardDescription>격리된 환경, 독립된 Agent.</CardDescription>
                  <CardAction>
                    <Badge variant={agent ? "default" : "secondary"}>
                      {agent ? "연결됨" : sandbox ? "주소 대기" : "미연결"}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-start gap-3">
                    <Hexagon className="size-6 shrink-0 text-muted-foreground" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {sandbox
                          ? "Agent를 위한 공간이 준비됐어요"
                          : "Agent의 안전한 실행 공간"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {sandbox
                          ? agent
                            ? "지갑 주소가 등록되어 위임을 받을 수 있습니다."
                            : "러너가 지갑을 만들고 주소를 보고하기를 기다립니다."
                          : "Daytona 샌드박스 안에서 실행되고, 지갑 개인키는 그 안에 머무릅니다."}
                      </p>
                    </div>
                  </div>
                  {!sandbox ? (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={!principal || !!busy}
                        onClick={() =>
                          void action("sandbox", () => api("sandboxes", {}))
                        }
                      >
                        {busy === "sandbox" ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Hexagon />
                        )}
                        {state?.demo
                          ? "데모 샌드박스 생성"
                          : "샌드박스 생성하기"}
                      </Button>
                      {!principal && (
                        <p className="text-xs text-muted-foreground">
                          먼저 Principal 신원 확인을 완료해 주세요.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <dl className="space-y-3 text-sm">
                        <div className="space-y-1">
                          <dt className="text-muted-foreground">Sandbox ID</dt>
                          <dd className="break-all font-mono text-xs">
                            {sandbox.sandboxId}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-muted-foreground">
                            Agent wallet
                          </dt>
                          <dd className="break-all font-mono text-xs">
                            {agent?.address || "등록 대기 중…"}
                          </dd>
                        </div>
                      </dl>
                      {sandbox.simulated && !agent && (
                        <form
                          className="space-y-3"
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
                          <div className="space-y-2">
                            <Label htmlFor="agent-address">
                              데모 Agent 주소
                            </Label>
                            <Input
                              id="agent-address"
                              required
                              placeholder="0x…"
                              value={agentAddress}
                              onChange={(e) => setAgentAddress(e.target.value)}
                            />
                          </div>
                          <Button
                            variant="outline"
                            className="w-full"
                            disabled={!!busy}
                          >
                            주소 연결 {loading("register")}
                          </Button>
                        </form>
                      )}
                    </div>
                  )}
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <Terminal className="size-4" />
                        Agent events
                      </h3>
                      <Badge variant="secondary">
                        {state?.events.length || 0} events
                      </Badge>
                    </div>
                    <div
                      className="max-h-48 space-y-3 overflow-auto"
                      aria-live="polite"
                    >
                      {!state?.events.length ? (
                        <p className="text-sm text-muted-foreground">
                          Agent가 연결되면 활동이 여기에 표시됩니다.
                        </p>
                      ) : (
                        state.events
                          .slice(-6)
                          .reverse()
                          .map((e, i) => (
                            <div
                              className="flex items-start gap-3 text-xs"
                              key={`${e.at}-${i}`}
                            >
                              <time className="shrink-0 font-mono text-muted-foreground">
                                {new Date(e.at).toLocaleTimeString("en-GB")}
                              </time>
                              <p className="min-w-0 break-words">{e.message}</p>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card id="ledger">
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Spend ledger
                  </CardTitle>
                  <CardDescription>위임 범위 안에서, 투명하게.</CardDescription>
                  <CardAction>
                    <Badge variant="outline">USDC</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <p className="text-3xl font-semibold tracking-tight">
                      {spent !== null ? money(spent) : "—"}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}
                        /{" "}
                        {delegation
                          ? money(delegation.scope.cumulativeLimit)
                          : "10"}{" "}
                        USDC
                      </span>
                    </p>
                    <Progress
                      value={spent === null ? null : progress}
                      aria-label="누적 지출"
                    />
                    <p className="text-xs text-muted-foreground">
                      {spent === null
                        ? "정산 데이터 대기"
                        : `누적 한도의 ${progress.toFixed(0)}% 사용`}
                    </p>
                  </div>
                  <Separator />
                  <dl className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">1회 한도</dt>
                      <dd className="mt-1 font-medium">
                        {delegation ? money(delegation.scope.perTxLimit) : "5"}{" "}
                        USDC
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">승인 판정</dt>
                      <dd className="mt-1 font-medium">{approved}건</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">거절 판정</dt>
                      <dd className="mt-1 font-medium">{denied}건</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>
            <Card id="decisions" className="min-w-0 xl:col-span-2">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Verifier decisions
                </CardTitle>
                <CardDescription>
                  돈이 움직이기 직전, 모든 결제의 위임을 확인합니다.
                </CardDescription>
                <CardAction>
                  <Badge variant={verifier ? "default" : "secondary"}>
                    {verifier ? "Live" : "연결 대기"}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                {relevant.length ? (
                  <div className="space-y-4">
                    {[...relevant].reverse().map((d, i) => (
                      <Alert
                        variant={
                          d.decision === "denied" ? "destructive" : "default"
                        }
                        key={`${d.at}-${i}`}
                      >
                        {d.decision === "approved" ? <Check /> : <X />}
                        <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {principal?.name || "Principal"} → {short(d.payer)}
                          </span>
                          <Badge
                            variant={
                              d.decision === "denied"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {money(d.amount)} USDC ·{" "}
                            {d.decision === "approved" ? "승인" : "거절"}
                          </Badge>
                        </AlertTitle>
                        <AlertDescription>
                          <p>
                            {d.reason
                              ? reasonText[d.reason] || d.reason
                              : "위임과 지출 범위 검사를 통과했습니다."}
                          </p>
                          <time>
                            {new Date(d.at).toLocaleTimeString("ko-KR")}
                          </time>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <ShieldCheck className="size-8 text-muted-foreground" />
                    <h3 className="font-medium">
                      첫 번째 결제를 기다리고 있어요
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Agent에 위임을 발급하면 결제별 승인·거절 판정을 확인할 수
                      있습니다.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Principal → Agent → Verifier → Payment
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <footer className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>Built on identity. Bounded by trust.</span>
            <span>
              {state?.demo
                ? "Local demo · 실제 충전 없음"
                : "Base Sepolia testnet"}{" "}
              · KYA v0.1
            </span>
          </footer>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

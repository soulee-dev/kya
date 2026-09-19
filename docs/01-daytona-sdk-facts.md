# Daytona TypeScript SDK 확인 사항 (2026-09-19 조사)

## 전제
- npm 패키지는 `@daytona/sdk` (구 `@daytonaio/sdk`는 deprecated, 동일 API). 최신 0.214.0.
- GitHub `daytonaio/daytona`는 2026-06부로 비공개 전환. 마지막 공개 태그 v0.190.0.

## 설치와 인증
```ts
npm install @daytona/sdk
import { Daytona } from '@daytona/sdk'
const daytona = new Daytona() // 또는 new Daytona({ apiKey, apiUrl, target })
```
- API 키: https://app.daytona.io 대시보드에서 발급
- 환경 변수: `DAYTONA_API_KEY`, `DAYTONA_API_URL`(기본 https://app.daytona.io/api), `DAYTONA_TARGET`(us/eu)
- 출처: https://www.daytona.io/docs/getting-started/

## 샌드박스 생성
```ts
const sandbox = await daytona.create(
  { language: 'typescript', image: 'node:22', envVars: { KYA_DELEGATION: '...' },
    labels: { app: 'kya' }, autoStopInterval: 60, public: false },
  { timeout: 90, onSnapshotCreateLogs: console.log },
)
```
- params: `snapshot?`, `image?`, `language?`, `envVars?`, `labels?`, `autoStopInterval?`, `autoDeleteInterval?`, `ephemeral?`, `public?`, `resources?`, `name?`
- 출처: https://www.daytona.io/docs/typescript-sdk/daytona/

## 명령 실행
```ts
const r = await sandbox.process.executeCommand('node agent.js', '/home/daytona', { FOO: 'bar' }, 120)
r.exitCode; r.result /* stdout */; r.artifacts?.stdout
await sandbox.process.codeRun('console.log(1)')
```
- 출처: https://www.daytona.io/docs/typescript-sdk/process/

## 파일 업로드
```ts
await sandbox.fs.uploadFile(Buffer.from(src), '/home/daytona/agent.js')
await sandbox.fs.uploadFiles([{ source: Buffer.from('...'), destination: '/tmp/a.txt' }])
const buf = await sandbox.fs.downloadFile('/tmp/out.json')
```
- 출처: https://www.daytona.io/docs/typescript-sdk/file-system/

## 포트 외부 공개 (preview link)
```ts
const { url, token } = await sandbox.getPreviewLink(3000)       // 닫힌 포트는 자동 오픈
const signed = await sandbox.getSignedPreviewUrl(3000, 3600)     // 토큰 내장 URL
```
- URL 형식 `https://{port}-{sandboxId}.{proxyDomain}`
- `public: true`가 아니면 헤더 `x-daytona-preview-token: <token>` 필요. 이 토큰은 샌드박스 전체 권한이라 비밀로 취급.
- 출처: https://www.daytona.io/docs/preview-and-authentication/

## 식별자와 메타데이터
```ts
sandbox.id; sandbox.name; sandbox.labels
await sandbox.setLabels({ app: 'kya' })
await sandbox.getUserHomeDir()   // getUserRootDir()는 deprecated
const sb = await daytona.get(idOrName)
for await (const s of daytona.list({ labels: { app: 'kya' } })) {}
```
- 출처: https://www.daytona.io/docs/typescript-sdk/sandbox/

## 삭제와 자동 정리
```ts
await sandbox.delete()
await sandbox.setAutostopInterval(30)   // 분 단위, idle 기준. 기본 15분
await sandbox.setAutoDeleteInterval(60) // stopped 상태 지속 시간(분). 0이면 stop 즉시 삭제
```

## Daytona MCP 서버 도구 (v0.190.0 소스 기준)
`create_sandbox`, `destroy_sandbox`, `execute_command`, `file_upload`, `file_download`, `get_file_info`, `list_files`, `move_file`, `delete_file`, `create_folder`, `preview_link`, `git_clone`
- 설치: `daytona login` → `daytona mcp init claude`
- 출처: https://www.daytona.io/docs/mcp/

## 미확인
- `daytona.list(query)`의 labels 필터 세부 필드

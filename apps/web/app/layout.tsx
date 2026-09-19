import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "KYA — Know Your Agent",
  description: "신원 확인에서 Agent 위임까지. 검증 가능한 자율 결제의 시작.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

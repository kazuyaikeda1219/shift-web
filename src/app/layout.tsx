import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '検査室シフト管理',
  description: '検査室スタッフシフト自動生成システム',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-slate-50 text-slate-800 min-h-screen">
        <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-6">
          <span className="font-semibold text-slate-700">🏥 検査室シフト管理</span>
          <a href="/"          className="text-sm text-slate-500 hover:text-blue-600">シフト表</a>
          <a href="/register"  className="text-sm text-slate-500 hover:text-blue-600">休み申請</a>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  )
}

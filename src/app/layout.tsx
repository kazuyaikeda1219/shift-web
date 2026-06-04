import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'シフト管理システム',
  description: '検査室・栄養科シフト管理システム',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-slate-50 text-slate-800 min-h-screen">
        <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-6">
          <span className="font-semibold text-slate-700">🏥 シフト管理システム</span>
          <a href="/"          className="text-sm text-slate-500 hover:text-blue-600">シフト表</a>
          <a href="/register"  className="text-sm text-slate-500 hover:text-blue-600">休み申請</a>
          <a href="/eiyoka"    className="text-sm text-slate-500 hover:text-blue-600">栄養科</a>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  )
}

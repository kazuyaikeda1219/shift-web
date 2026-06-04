'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { generateMonth, ALL_SHIFTS, type DayShift, type ShiftType } from '@/lib/eiyokaShiftEngine'
import { getHolidays } from '@/lib/holidays'

// ── シフト表示スタイル（メインと共通） ─────────────────────────
const SHIFT_STYLE: Record<ShiftType, string> = {
  '早出':   'bg-sky-100 text-sky-800 border border-sky-300',
  '日勤':   'bg-emerald-100 text-emerald-800 border border-emerald-300',
  '遅出':   'bg-orange-100 text-orange-800 border border-orange-300',
  '遅出*':  'bg-amber-100 text-amber-800 border border-amber-300',
  '9事務':  'bg-purple-100 text-purple-800 border border-purple-300',
  '9遅出':  'bg-indigo-100 text-indigo-800 border border-indigo-300',
  '8-13':   'bg-teal-100 text-teal-800 border border-teal-300',
  '9-13':   'bg-cyan-100 text-cyan-800 border border-cyan-300',
  '自宅':   'bg-gray-100 text-gray-500 border border-gray-300',
  '休み':   'bg-white text-gray-300 border border-gray-200',
  '希望休': 'bg-pink-50 text-pink-400 border border-pink-200',
}

// ── 編集モーダル ────────────────────────────────────────────
function EditModal({
  label, current, onSave, onClose,
}: {
  label: string
  current: ShiftType
  onSave: (s: ShiftType) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<ShiftType>(current)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 min-w-[280px]" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-gray-700 mb-1">{label} — 江原</h3>
        <p className="text-xs text-gray-400 mb-4">シフトを選択してください</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {ALL_SHIFTS.map(s => (
            <button key={s} onClick={() => setSelected(s)}
              className={`px-2 py-1.5 rounded text-sm font-medium transition-all
                ${SHIFT_STYLE[s]}
                ${selected === s ? 'ring-2 ring-offset-1 ring-blue-500 scale-105' : 'opacity-80 hover:opacity-100'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded bg-gray-100 text-gray-600 text-sm hover:bg-gray-200">
            キャンセル
          </button>
          <button onClick={() => { onSave(selected); onClose() }}
            className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ── メインコンポーネント ─────────────────────────────────────
export default function EbaraPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [overrides, setOverrides] = useState<Record<string, ShiftType>>({})
  const [editTarget, setEditTarget] = useState<{ date: string; label: string } | null>(null)

  const holidays = useMemo(() => getHolidays(year), [year])

  const days: DayShift[] = useMemo(
    () => generateMonth(year, month, holidays, {}),
    [year, month, holidays],
  )

  // 江原さんのシフトのみ（overrides適用）
  const ebaraShifts = useMemo(() =>
    days.map(d => ({
      ...d,
      shift: (overrides[d.date] ?? d.shifts['ebara']) as ShiftType,
    })),
    [days, overrides],
  )

  const yearOptions = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 1 + i)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  // カレンダーグリッド用：月初の曜日オフセット
  const firstDow = new Date(year, month - 1, 1).getDay() // 0=Sun
  const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土']

  // 週ごとに分割
  const calendarCells: ({ day: DayShift; shift: ShiftType } | null)[] = [
    ...Array(firstDow).fill(null),
    ...ebaraShifts.map(d => ({ day: d, shift: d.shift })),
  ]
  // 7の倍数になるよう末尾を埋める
  while (calendarCells.length % 7 !== 0) calendarCells.push(null)
  const weeks: typeof calendarCells[] = []
  for (let i = 0; i < calendarCells.length; i += 7) {
    weeks.push(calendarCells.slice(i, i + 7))
  }

  // 出勤回数カウント
  const workDays = ebaraShifts.filter(d => d.shift !== '休み' && d.shift !== '希望休').length
  const jitakuDays = ebaraShifts.filter(d => d.shift === '自宅').length
  const hayaDays = ebaraShifts.filter(d => d.shift === '早出').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── ヘッダー ── */}
      <header className="bg-[#1e3a5f] text-white shadow no-print">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <Link href="/eiyoka" className="text-sm text-white/70 hover:text-white transition-colors">
            ← 栄養科 全体表へ戻る
          </Link>
          <h1 className="text-lg font-bold tracking-wide">江原 芳子 — 勤務表</h1>

          <div className="flex items-center gap-2 ml-auto">
            <select value={year}
              onChange={e => { setYear(Number(e.target.value)); setOverrides({}) }}
              className="rounded px-2 py-1 text-sm text-gray-800 bg-white">
              {yearOptions.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            <select value={month}
              onChange={e => { setMonth(Number(e.target.value)); setOverrides({}) }}
              className="rounded px-2 py-1 text-sm text-gray-800 bg-white">
              {monthOptions.map(m => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setOverrides({})}
              className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm border border-white/20">
              リセット
            </button>
            <button onClick={() => window.print()}
              className="px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-sm font-medium">
              印刷
            </button>
          </div>
        </div>
      </header>

      {/* ── 印刷ヘッダー（印刷時のみ表示） ── */}
      <div className="hidden print:block text-center py-4 border-b">
        <h1 className="text-xl font-bold">江原 芳子　勤務表</h1>
        <p className="text-sm text-gray-500">{year}年 {month}月</p>
        <p className="text-xs text-gray-400 mt-1">
          ※ 火・木・金は祝日でも【自宅】勤務
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">

        {/* ── 月次サマリー ── */}
        <div className="flex gap-4 mb-4 no-print">
          {[
            { label: '出勤日数', value: workDays, color: 'text-blue-700' },
            { label: '自宅勤務', value: jitakuDays, color: 'text-gray-600' },
            { label: '早出',     value: hayaDays,  color: 'text-sky-700' },
            { label: '休み',     value: days.length - workDays, color: 'text-gray-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-lg px-4 py-2 shadow-sm text-center min-w-[80px]">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {/* ── カレンダーグリッド ── */}
        <div className="bg-white rounded-xl shadow overflow-hidden print:shadow-none print:rounded-none">
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 bg-[#1e3a5f]">
            {WEEK_LABELS.map((w, i) => (
              <div key={w}
                className={`py-2 text-center text-sm font-bold
                  ${i === 0 ? 'text-red-300' : i === 6 ? 'text-blue-300' : 'text-white'}`}>
                {w}
              </div>
            ))}
          </div>

          {/* 週行 */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-t border-gray-100">
              {week.map((cell, di) => {
                if (!cell) return (
                  <div key={di} className="h-24 bg-gray-50 border-r border-gray-100 last:border-r-0" />
                )
                const { day: d, shift } = cell
                const isHoliday = d.isHoliday
                const isSun = d.weekday === '日'
                const isSat = d.weekday === '土'
                const isRest = shift === '休み' || shift === '希望休'
                const isOverridden = !!overrides[d.date]

                return (
                  <div
                    key={di}
                    className={`h-24 p-1.5 border-r border-gray-100 last:border-r-0 flex flex-col
                      ${isHoliday || isSun ? 'bg-red-50' : isSat ? 'bg-blue-50' : 'bg-white'}`}
                  >
                    {/* 日付 */}
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-bold leading-none
                        ${isSun || isHoliday ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}>
                        {d.day}
                      </span>
                      {isHoliday && (
                        <span className="text-[9px] text-orange-500 leading-none text-right max-w-[60px] truncate">
                          {d.holidayName}
                        </span>
                      )}
                    </div>

                    {/* シフトバッジ */}
                    <button
                      onClick={() => setEditTarget({ date: d.date, label: `${d.day}日(${d.weekday})` })}
                      className={`no-print flex-1 rounded text-xs font-medium flex items-center justify-center
                        transition-transform hover:scale-105
                        ${SHIFT_STYLE[shift]}
                        ${isOverridden ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
                        ${isRest ? 'opacity-40' : ''}`}
                    >
                      {shift}
                    </button>
                    {/* 印刷用（ボタンでなくdiv） */}
                    <div
                      className={`hidden print:flex flex-1 rounded text-xs font-medium items-center justify-center
                        ${SHIFT_STYLE[shift]}
                        ${isRest ? 'opacity-40' : ''}`}
                    >
                      {isRest ? '' : shift}
                    </div>

                    {/* 定期タスク */}
                    {d.periodicTasks.length > 0 && (
                      <div className="mt-0.5 text-[9px] text-yellow-700 leading-tight truncate">
                        {d.periodicTasks[0]}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── 注記 ── */}
        <div className="mt-4 text-xs text-gray-500 space-y-1 print:mt-2">
          <p>※ 火・木・金は祝日であっても【自宅】勤務となります。</p>
          <p>※ 土曜日は第2・4週のみ【早出】、それ以外は休みです。</p>
          <p>※ セルをクリックするとシフトを手動変更できます。</p>
        </div>

        {/* ── 印刷用サマリー ── */}
        <div className="hidden print:flex gap-6 mt-4 text-sm">
          <span>出勤日数：<strong>{workDays}</strong>日</span>
          <span>自宅勤務：<strong>{jitakuDays}</strong>日</span>
          <span>早出：<strong>{hayaDays}</strong>日</span>
          <span>休み：<strong>{days.length - workDays}</strong>日</span>
        </div>
      </div>

      {/* ── 編集モーダル ── */}
      {editTarget && (() => {
        const d = ebaraShifts.find(d => d.date === editTarget.date)!
        return (
          <EditModal
            label={editTarget.label}
            current={d.shift}
            onSave={s => setOverrides(prev => ({ ...prev, [editTarget.date]: s }))}
            onClose={() => setEditTarget(null)}
          />
        )
      })()}
    </div>
  )
}

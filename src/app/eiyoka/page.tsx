'use client'
import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  generateMonth, STAFF_IDS, STAFF_NAMES, STAFF_NOTES,
  ALL_SHIFTS, isWorking, KANRI_EIYOSHI,
  type DayShift, type ShiftType, type StaffId,
} from '@/lib/eiyokaShiftEngine'
import { getHolidays } from '@/lib/holidays'

// ── シフト表示スタイル ─────────────────────────────────────────
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

const WEEKDAY_COLOR: Record<string, string> = {
  '土': 'text-blue-600',
  '日': 'text-red-600',
}

// ── 凡例データ ─────────────────────────────────────────────────
const LEGEND: { label: ShiftType; note: string }[] = [
  { label: '早出',   note: '早番勤務' },
  { label: '日勤',   note: '日中勤務' },
  { label: '遅出',   note: '遅番勤務' },
  { label: '遅出*',  note: '遅番勤務（調理補助）' },
  { label: '9事務',  note: '9時〜事務勤務' },
  { label: '9遅出',  note: '9時〜遅出勤務' },
  { label: '8-13',   note: '8〜13時勤務' },
  { label: '9-13',   note: '9〜13時勤務' },
  { label: '自宅',   note: '自宅勤務（江原）' },
  { label: '希望休', note: '希望休・調整休' },
  { label: '休み',   note: '休み' },
]

// ── 編集モーダル ───────────────────────────────────────────────
function EditModal({
  date, staffId, current,
  onSave, onClose,
}: {
  date: string
  staffId: StaffId
  current: ShiftType
  onSave: (s: ShiftType) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<ShiftType>(current)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 min-w-[280px]" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-gray-700 mb-1">{date} — {STAFF_NAMES[staffId]}</h3>
        <p className="text-xs text-gray-400 mb-4">シフトを選択してください</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {ALL_SHIFTS.map(s => (
            <button
              key={s}
              onClick={() => setSelected(s)}
              className={`px-2 py-1.5 rounded text-sm font-medium transition-all
                ${SHIFT_STYLE[s]}
                ${selected === s ? 'ring-2 ring-offset-1 ring-blue-500 scale-105' : 'opacity-80 hover:opacity-100'}`}
            >
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

// ── ジョブカンCSVモーダル ──────────────────────────────────────
function JobcanModal({
  days, year, month, onClose,
}: {
  days: DayShift[]
  year: number
  month: number
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<StaffId>>(new Set(STAFF_IDS))

  const toggle = (id: StaffId) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDownload = async () => {
    const { downloadJobcanCSV } = await import('@/lib/jobcanExport')
    downloadJobcanCSV(days, Array.from(selected), year, month)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-[340px]" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-gray-700 mb-1">ジョブカン CSV 出力</h3>
        <p className="text-xs text-gray-400 mb-4">
          出力するスタッフを選択してください（複数選択可）
        </p>

        <div className="space-y-2 mb-5">
          <button
            onClick={() => setSelected(new Set(STAFF_IDS))}
            className="text-xs text-blue-600 hover:underline mr-3"
          >全員選択</button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-400 hover:underline"
          >全解除</button>

          <div className="grid grid-cols-2 gap-2 mt-2">
            {STAFF_IDS.map(id => (
              <label key={id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors
                  ${selected.has(id)
                    ? 'bg-blue-50 border-blue-300 text-blue-800'
                    : 'bg-white border-gray-200 text-gray-500'}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  onChange={() => toggle(id)}
                  className="accent-blue-600"
                />
                <span className="text-sm font-medium">{STAFF_NAMES[id]}</span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400 mb-4">
          ※ シフトパターン名はジョブカンの登録名に準拠しています。<br />
          　 ファイル形式：UTF-8 BOM付きCSV
        </p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded bg-gray-100 text-gray-600 text-sm hover:bg-gray-200">
            キャンセル
          </button>
          <button
            onClick={handleDownload}
            disabled={selected.size === 0}
            className="px-4 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            CSV ダウンロード（{selected.size}名）
          </button>
        </div>
      </div>
    </div>
  )
}

// ── メインページ ───────────────────────────────────────────────
export default function Page() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [overrides, setOverrides] = useState<Record<string, Partial<Record<StaffId, ShiftType>>>>({})
  const [editTarget, setEditTarget] = useState<{ date: string; staffId: StaffId } | null>(null)
  const [showLegend, setShowLegend] = useState(false)
  const [showJobcan, setShowJobcan] = useState(false)

  const holidays = useMemo(() => getHolidays(year), [year])

  const days: DayShift[] = useMemo(
    () => generateMonth(year, month, holidays, overrides),
    [year, month, holidays, overrides],
  )

  const allWarnings = useMemo(
    () => days.flatMap(d => d.warnings.map(w => `${d.day}日(${d.weekday}) — ${w}`)),
    [days],
  )

  const handleSave = useCallback((date: string, staffId: StaffId, shift: ShiftType) => {
    setOverrides(prev => ({
      ...prev,
      [date]: { ...prev[date], [staffId]: shift },
    }))
  }, [])

  const handleReset = useCallback(() => {
    setOverrides({})
  }, [])

  const handleExcel = useCallback(async () => {
    const { exportToExcel } = await import('@/lib/excelExport')
    exportToExcel(days, year, month)
  }, [days, year, month])

  const yearOptions = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 1 + i)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  const editDay = editTarget ? days.find(d => d.date === editTarget.date) : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── ヘッダー ── */}
      <header className="bg-[#1e3a5f] text-white shadow no-print">
        <div className="max-w-full px-4 py-3 flex items-center gap-4 flex-wrap">
          <Link href="/" className="text-sm text-white/70 hover:text-white transition-colors">
            ← トップへ
          </Link>
          <h1 className="text-lg font-bold tracking-wide">栄養科 勤務表</h1>

          <div className="flex items-center gap-2 ml-auto">
            <select
              value={year}
              onChange={e => { setYear(Number(e.target.value)); setOverrides({}) }}
              className="rounded px-2 py-1 text-sm text-gray-800 bg-white"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            <select
              value={month}
              onChange={e => { setMonth(Number(e.target.value)); setOverrides({}) }}
              className="rounded px-2 py-1 text-sm text-gray-800 bg-white"
            >
              {monthOptions.map(m => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowLegend(v => !v)}
              className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm border border-white/20"
            >
              凡例
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm border border-white/20"
            >
              リセット
            </button>
            <Link
              href="/eiyoka/ebara"
              className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm border border-white/20"
            >
              江原さん専用
            </Link>
            <button
              onClick={() => setShowJobcan(true)}
              className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-sm font-medium"
            >
              ジョブカンCSV
            </button>
            <button
              onClick={handleExcel}
              className="px-3 py-1.5 rounded bg-green-500 hover:bg-green-600 text-sm font-medium"
            >
              Excel出力
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-sm font-medium"
            >
              印刷
            </button>
          </div>
        </div>
      </header>

      {/* ── 凡例パネル ── */}
      {showLegend && (
        <div className="bg-white border-b px-4 py-3 no-print">
          <div className="flex flex-wrap gap-2">
            {LEGEND.map(({ label, note }) => (
              <div key={label} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${SHIFT_STYLE[label]}`}>
                <span className="font-medium">{label}</span>
                <span className="opacity-60">— {note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 警告バナー ── */}
      {allWarnings.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 no-print">
          <p className="text-xs font-bold text-red-700 mb-1">⚠ 調整が必要な点</p>
          <ul className="text-xs text-red-600 list-disc list-inside space-y-0.5">
            {allWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* ── スタッフ備考 ── */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 no-print">
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          {STAFF_IDS.map(id => STAFF_NOTES[id as StaffId] && (
            <span key={id} className="text-xs text-amber-700">
              <span className="font-medium">{STAFF_NAMES[id as StaffId]}</span>：{STAFF_NOTES[id as StaffId]}
            </span>
          ))}
        </div>
      </div>

      {/* ── テーブル ── */}
      <div className="overflow-x-auto px-2 py-3">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#1e3a5f] text-white">
              <th className="px-2 py-2 text-center whitespace-nowrap border border-blue-900 w-10">日</th>
              <th className="px-2 py-2 text-center whitespace-nowrap border border-blue-900 w-8">曜</th>
              <th className="px-2 py-2 text-center whitespace-nowrap border border-blue-900 w-16">祝日</th>
              {STAFF_IDS.map(id => (
                <th key={id} className="px-1 py-2 text-center whitespace-nowrap border border-blue-900 w-20">
                  <div>{STAFF_NAMES[id as StaffId]}</div>
                  {KANRI_EIYOSHI.includes(id as StaffId) && (
                    <div className="text-[10px] text-yellow-300">管理栄養士</div>
                  )}
                </th>
              ))}
              <th className="px-2 py-2 text-left whitespace-nowrap border border-blue-900 min-w-[160px]">定期タスク・備考</th>
            </tr>
          </thead>
          <tbody>
            {days.map(d => {
              const rowBg = d.isClosed
                ? d.weekday === '日' ? 'bg-red-50' : 'bg-orange-50'
                : d.weekday === '土' ? 'bg-blue-50' : 'bg-white'
              const hasWarning = d.warnings.length > 0

              return (
                <tr
                  key={d.date}
                  className={`${rowBg} hover:brightness-95 transition-colors ${hasWarning ? 'ring-1 ring-inset ring-red-300' : ''}`}
                >
                  {/* 日付 */}
                  <td className="px-2 py-1 text-center font-medium border border-gray-200">
                    {d.day}
                  </td>
                  {/* 曜日 */}
                  <td className={`px-2 py-1 text-center font-bold border border-gray-200 ${WEEKDAY_COLOR[d.weekday] ?? 'text-gray-700'}`}>
                    {d.weekday}
                  </td>
                  {/* 祝日名 */}
                  <td className="px-1 py-1 text-center text-[11px] text-orange-600 border border-gray-200 whitespace-nowrap">
                    {d.holidayName ?? ''}
                  </td>
                  {/* 各スタッフのシフト */}
                  {STAFF_IDS.map(id => {
                    const shift = d.shifts[id as StaffId]
                    const isOverridden = !!overrides[d.date]?.[id as StaffId]
                    return (
                      <td key={id} className="px-1 py-1 text-center border border-gray-200">
                        <button
                          onClick={() => setEditTarget({ date: d.date, staffId: id as StaffId })}
                          className={`w-full px-1 py-0.5 rounded text-xs font-medium transition-transform hover:scale-105
                            ${SHIFT_STYLE[shift]}
                            ${isOverridden ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                          title={isOverridden ? '手動変更済み' : ''}
                        >
                          {shift}
                        </button>
                      </td>
                    )
                  })}
                  {/* 定期タスク */}
                  <td className="px-2 py-1 text-xs text-gray-600 border border-gray-200">
                    {d.periodicTasks.length > 0 && (
                      <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-[11px]">
                        {d.periodicTasks.join(' / ')}
                      </span>
                    )}
                    {d.warnings.length > 0 && (
                      <span className="ml-1 text-red-500 text-[11px]">⚠ {d.warnings.join(' ')}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── 月次サマリー ── */}
      <div className="px-4 py-4 no-print">
        <h2 className="text-sm font-bold text-gray-600 mb-2">月次 出勤回数サマリー</h2>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-1 border border-gray-300 text-left">スタッフ</th>
                {(['早出','日勤','遅出','遅出*','9事務','9遅出','8-13','9-13','自宅','希望休','休み'] as ShiftType[]).map(s => (
                  <th key={s} className="px-2 py-1 border border-gray-300 text-center whitespace-nowrap">{s}</th>
                ))}
                <th className="px-2 py-1 border border-gray-300 text-center">出勤計</th>
              </tr>
            </thead>
            <tbody>
              {STAFF_IDS.map(id => {
                const counts: Partial<Record<ShiftType, number>> = {}
                for (const d of days) {
                  const s = d.shifts[id as StaffId]
                  counts[s] = (counts[s] ?? 0) + 1
                }
                const total = STAFF_IDS.reduce(() => 0, 0) // unused; compute below
                const workTotal = days.filter(d => isWorking(d.shifts[id as StaffId])).length
                return (
                  <tr key={id} className="hover:bg-gray-50">
                    <td className="px-3 py-1 border border-gray-200 font-medium">{STAFF_NAMES[id as StaffId]}</td>
                    {(['早出','日勤','遅出','遅出*','9事務','9遅出','8-13','9-13','自宅','希望休','休み'] as ShiftType[]).map(s => (
                      <td key={s} className="px-2 py-1 border border-gray-200 text-center">
                        {counts[s] ? <span className={`px-1 rounded ${SHIFT_STYLE[s]}`}>{counts[s]}</span> : ''}
                      </td>
                    ))}
                    <td className="px-2 py-1 border border-gray-200 text-center font-bold text-blue-700">
                      {workTotal}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 調整が必要な点（ページ末尾） ── */}
      {allWarnings.length > 0 && (
        <div className="px-4 pb-6 no-print">
          <h2 className="text-sm font-bold text-red-700 mb-2">⚠ 調整が必要な点</h2>
          <ul className="text-sm text-red-600 list-disc list-inside space-y-1 bg-red-50 rounded-lg p-3">
            {allWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* ── 編集モーダル ── */}
      {editTarget && editDay && (
        <EditModal
          date={`${editDay.day}日(${editDay.weekday})`}
          staffId={editTarget.staffId}
          current={editDay.shifts[editTarget.staffId]}
          onSave={(shift) => handleSave(editTarget.date, editTarget.staffId, shift)}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── ジョブカンCSVモーダル ── */}
      {showJobcan && (
        <JobcanModal
          days={days}
          year={year}
          month={month}
          onClose={() => setShowJobcan(false)}
        />
      )}
    </div>
  )
}

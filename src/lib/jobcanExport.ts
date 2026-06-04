import type { DayShift, ShiftType, StaffId } from './eiyokaShiftEngine'
import { STAFF_CODES } from './eiyokaShiftEngine'

// アプリのシフト → ジョブカン シフト名マッピング
const JOBCAN_SHIFT_NAME: Partial<Record<ShiftType, string>> = {
  '早出':   '早出9',
  '日勤':   '給3',
  '遅出':   '遅出',
  '遅出*':  '給2',
  '9事務':  '給3',
  '9遅出':  '給3',
  '8-13':   '給食4',
  '9-13':   '給1',
  '自宅':   '給食江原',
  '休み':   '',
  '希望休': '',
}

// 日付を YYYY/M/D 形式に変換
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y}/${m}/${d}`
}

/**
 * 指定スタッフのジョブカン取り込み用CSVを生成して返す
 */
export function generateJobcanCSV(
  days: DayShift[],
  targetStaff: StaffId[],
): string {
  const BOM = '﻿'
  const header = 'スタッフコード,日付,シフト名,休暇区分'
  const rows: string[] = [header]

  for (const staffId of targetStaff) {
    const code = STAFF_CODES[staffId]
    for (const d of days) {
      const shift = d.shifts[staffId]
      const shiftName = JOBCAN_SHIFT_NAME[shift] ?? ''
      const date = formatDate(d.date)
      rows.push(`${code},${date},${shiftName},`)
    }
  }

  return BOM + rows.join('\r\n')
}

/**
 * CSVをブラウザからダウンロードする
 */
export function downloadJobcanCSV(
  days: DayShift[],
  targetStaff: StaffId[],
  year: number,
  month: number,
): void {
  const csv = generateJobcanCSV(days, targetStaff)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ジョブカンシフト_${year}年${month}月.csv`
  a.click()
  URL.revokeObjectURL(url)
}

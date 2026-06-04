import * as XLSX from 'xlsx'
import type { DayShift, StaffId } from './eiyokaShiftEngine'
import { STAFF_IDS, STAFF_NAMES } from './eiyokaShiftEngine'

const SHIFT_COLOR: Record<string, string> = {
  '早出':   'FFBEE3F7',
  '日勤':   'FFD1FAE5',
  '遅出':   'FFFDE68A',
  '遅出*':  'FFFBBF24',
  '9事務':  'FFE9D5FF',
  '9遅出':  'FFC7D2FE',
  '8-13':   'FFD1FAE5',
  '9-13':   'FFA7F3D0',
  '自宅':   'FFF3F4F6',
  '休み':   'FFFFFFFF',
  '希望休': 'FFFCE7F3',
}

export function exportToExcel(
  days: DayShift[],
  year: number,
  month: number,
) {
  const wb = XLSX.utils.book_new()
  const ws_data: (string | number)[][] = []

  // ヘッダー行
  ws_data.push([
    '日付', '曜日', '祝日',
    ...STAFF_IDS.map(id => STAFF_NAMES[id as StaffId]),
    '定期タスク・備考', '要確認',
  ])

  for (const d of days) {
    const row: (string | number)[] = [
      d.day,
      d.weekday,
      d.holidayName ?? '',
      ...STAFF_IDS.map(id => d.shifts[id as StaffId]),
      d.periodicTasks.join(' / '),
      d.warnings.join(' / '),
    ]
    ws_data.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(ws_data)

  // 列幅設定
  ws['!cols'] = [
    { wch: 5 },   // 日付
    { wch: 4 },   // 曜日
    { wch: 10 },  // 祝日
    ...STAFF_IDS.map(() => ({ wch: 9 })),
    { wch: 30 },  // 定期タスク
    { wch: 30 },  // 要確認
  ]

  // セル塗りつぶし（スタッフ列）
  for (let r = 1; r < ws_data.length; r++) {
    const d = days[r - 1]
    const colOffset = 3 // 日付・曜日・祝日の後
    STAFF_IDS.forEach((id, ci) => {
      const shift = d.shifts[id as StaffId]
      const color = SHIFT_COLOR[shift] ?? 'FFFFFFFF'
      const cellAddr = XLSX.utils.encode_cell({ r, c: colOffset + ci })
      if (!ws[cellAddr]) ws[cellAddr] = { v: shift, t: 's' }
      ws[cellAddr].s = {
        fill: { fgColor: { rgb: color.slice(2) }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center' },
        font: { sz: 10 },
      }
    })

    // 日曜・祝日行の背景
    if (d.isClosed) {
      for (let c = 0; c < ws_data[r].length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        if (!ws[addr]) ws[addr] = { v: ws_data[r][c], t: 's' }
        if (!ws[addr].s) ws[addr].s = {}
        if (c < 3) {
          ws[addr].s.fill = { fgColor: { rgb: 'FFF0F9FF' }, patternType: 'solid' }
        }
      }
    }
  }

  // ヘッダーのスタイル
  for (let c = 0; c < ws_data[0].length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) ws[addr] = { v: ws_data[0][c], t: 's' }
    ws[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' }, patternType: 'solid' },
      font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 },
      alignment: { horizontal: 'center' },
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, `${year}年${month}月`)
  XLSX.writeFile(wb, `栄養科勤務表_${year}年${month}月.xlsx`, { bookType: 'xlsx', cellStyles: true })
}

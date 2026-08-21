/**
 * 昭栄運輸システム → スプレッドシート 書き戻し受け口（GAS Web App）
 *
 * 使い方:
 *   1) スプレッドシート（またはスタンドアロン）の「拡張機能 → Apps Script」にこのコードを貼付
 *   2) 下の CONFIG を自社の値に設定
 *   3) 「デプロイ → 新しいデプロイ → 種類=ウェブアプリ」
 *        - 次のユーザーとして実行: 自分
 *        - アクセスできるユーザー: 全員
 *   4) 発行された「ウェブアプリのURL」を開発側へ連携（環境変数 SHEET_WRITEBACK_URL に設定）
 *      SECRET は環境変数 SHEET_WRITEBACK_SECRET と同じ値にすること
 */
var CONFIG = {
  SECRET: 'ここに SHEET_WRITEBACK_SECRET と同じ長いランダム文字列',
  DISPATCH_SHEET_ID: 'ここに 流れ表(配車)スプレッドシートのID',
  DISPATCH_TAB: '流れ表', // 配車データのタブ名（実際の名前に合わせる）
  KINTAI_SHEET_ID: '114mp0U204ps2sigd9y18ImDDb9AlkvtaHzDNiINQFCM', // 勤怠ブック
  SHIFT_TAB: 'shift_log',
};

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== CONFIG.SECRET) return json({ ok: false, error: '認証エラー' });
    if (body.op === 'dispatch_replace') return json(dispatchReplace(body));
    if (body.op === 'shift_update') return json(shiftUpdate(body));
    return json({ ok: false, error: '未知のop: ' + body.op });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** 積込日=date の行を消して rows で置き換える（配車=流れ表）。 */
function dispatchReplace(body) {
  var sh = SpreadsheetApp.openById(CONFIG.DISPATCH_SHEET_ID).getSheetByName(CONFIG.DISPATCH_TAB);
  if (!sh) return { ok: false, error: 'タブが見つかりません: ' + CONFIG.DISPATCH_TAB };
  var data = sh.getDataRange().getValues();
  var header = data[0] || [];
  var col = header.indexOf('積込日');
  if (col < 0) col = 4; // 既定: 5列目
  var target = body.date;
  for (var r = data.length - 1; r >= 1; r--) {
    if (fmtDate(data[r][col]) === target) sh.deleteRow(r + 1);
  }
  if (body.rows && body.rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, body.rows.length, body.rows[0].length).setValues(body.rows);
  }
  return { ok: true, applied: body.rows ? body.rows.length : 0 };
}

/** ドライバー名＋開始日で一致する shift_log 行の 修正出勤/修正退勤/休憩時間/修正理由 を更新。 */
function shiftUpdate(body) {
  var sh = SpreadsheetApp.openById(CONFIG.KINTAI_SHEET_ID).getSheetByName(CONFIG.SHIFT_TAB);
  if (!sh) return { ok: false, error: 'タブが見つかりません: ' + CONFIG.SHIFT_TAB };
  var data = sh.getDataRange().getValues();
  var header = data[0] || [];
  var cName = header.indexOf('ドライバー名');
  var cDate = header.indexOf('開始日');
  var cEin = header.indexOf('修正出勤');
  var cEout = header.indexOf('修正退勤');
  var cRest = header.indexOf('休憩時間');
  var cReason = header.indexOf('修正理由・備考');
  var applied = 0;
  (body.updates || []).forEach(function (u) {
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][cName]).trim() === u.driver && fmtDate(data[r][cDate]) === u.work_date) {
        if (cEin >= 0 && u.edited_in) sh.getRange(r + 1, cEin + 1).setValue(u.edited_in);
        if (cEout >= 0 && u.edited_out) sh.getRange(r + 1, cEout + 1).setValue(u.edited_out);
        if (cRest >= 0 && u.rest) sh.getRange(r + 1, cRest + 1).setValue(u.rest);
        if (cReason >= 0 && u.reason) sh.getRange(r + 1, cReason + 1).setValue(u.reason);
        applied++;
        break;
      }
    }
  });
  return { ok: true, applied: applied };
}

/** 日付セル(Date/文字列 いずれも)を yyyy-MM-dd に正規化。 */
function fmtDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  var s = String(v);
  var m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return s.slice(0, 10);
}

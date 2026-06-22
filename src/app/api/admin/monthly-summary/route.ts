import { requireAdmin } from "@/lib/auth";
import { handle, notImplemented } from "@/lib/api/response";
import { monthlySummarySchema } from "@/lib/validation";

/**
 * POST /api/admin/monthly-summary  月次集計（仕様書 F-14, 8.1）
 *   ドライバー別に 出勤日数・拘束・労働・残業・休日労働・深夜・違反件数を集計、
 *   日別詳細を展開、休日区分を手修正して再計算可能。祝日はカレンダー連携で取得・着色。
 *   月次/年次拘束・運転時間(2日/2週平均)の改善基準告示判定もここで実施。 … 次フェーズで実装
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = monthlySummarySchema.parse(await request.json());
    void body;
    return notImplemented("月次集計（F-14）は次フェーズで実装");
  });
}

import AdminNav from "@/components/admin/AdminNav";
import { AutoMirror } from "@/components/admin/AutoMirror";

/** 管理画面 共通レイアウト。全 /admin 配下に大きめアイコンナビを表示（ログイン画面は自動非表示）。
 *   AutoMirror: 管理画面を開いている間、5分ごとに現行スプレッドシートの取り込みを起動する保険。 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav />
      <AutoMirror />
      {children}
    </div>
  );
}

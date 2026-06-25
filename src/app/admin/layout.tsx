import AdminNav from "@/components/admin/AdminNav";

/** 管理画面 共通レイアウト。全 /admin 配下に大きめアイコンナビを表示（ログイン画面は自動非表示）。 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav />
      {children}
    </div>
  );
}

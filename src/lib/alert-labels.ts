/** 改善基準告示の違反種別 → 日本語ラベル・アイコン・色（直感的表示用）。 */
export function alertLabel(type: string): { icon: string; label: string; cls: string } {
  switch (type) {
    case "restraint":
      return { icon: "⏱️", label: "拘束時間", cls: "bg-rose-100 text-rose-800" };
    case "rest_period":
      return { icon: "🛌", label: "休息不足", cls: "bg-orange-100 text-orange-800" };
    case "night":
      return { icon: "🌙", label: "深夜労働", cls: "bg-indigo-100 text-indigo-800" };
    case "continuous_drive":
    case "continuous_driving":
      return { icon: "🚗", label: "連続運転", cls: "bg-amber-100 text-amber-800" };
    case "driving_time":
      return { icon: "🛣️", label: "運転時間", cls: "bg-amber-100 text-amber-800" };
    case "monthly_restraint":
      return { icon: "📅", label: "月拘束超過", cls: "bg-rose-100 text-rose-800" };
    case "yearly_restraint":
      return { icon: "📅", label: "年拘束超過", cls: "bg-rose-100 text-rose-800" };
    default:
      return { icon: "⚠️", label: type, cls: "bg-amber-100 text-amber-800" };
  }
}

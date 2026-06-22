import { OfficeTerminal } from "@/components/office/OfficeTerminal";

export const dynamic = "force-dynamic";

/**
 * 据置端末（事務所共用 / S-08, S-09）。端末トークンで解錠し、出退勤のみ代行打刻。
 */
export default function OfficePage() {
  return <OfficeTerminal />;
}

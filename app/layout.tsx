import "./globals.css";
import "./documents.css";
import "./audit-polish.css";
import "./final-ui-polish.css";
import "./r26-settlement-hardening.css";
import "./r29d-costs-payments-polish.css";
import "./flatberry.css";
import "./admin-activity.css";
import "./visual-polish.css";
import "./dark-theme.css";

export const metadata = {
  title: "Flatberry",
  description: "Evidence nájemních plateb",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="cs"><body>{children}</body></html>;
}

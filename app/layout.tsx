import "./globals.css";

export const metadata = {
  title: "FlatCloud Rent",
  description: "Evidence nájemních plateb",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="cs"><body>{children}</body></html>;
}

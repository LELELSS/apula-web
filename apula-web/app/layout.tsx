import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import GlobalLoader from "@/components/GlobalLoader";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Apula",
  description:
    "CNN-Powered Fire Detection and Alert System integrating CCTV, thermal imaging, and IoT sensors.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={poppins.variable}>
        <GlobalLoader />

        {/* Main Content */}
        {children}
      </body>
    </html>
  );
}

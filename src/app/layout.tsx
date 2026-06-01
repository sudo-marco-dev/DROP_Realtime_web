import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'D.R.O.P. Simulation Dashboard',
  description: 'Digital Receptacle Online Parcel Web Twin & Security Control Panel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

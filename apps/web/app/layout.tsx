import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'School Management System',
  description: 'Admin web console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

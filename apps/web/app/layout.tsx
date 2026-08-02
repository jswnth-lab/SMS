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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

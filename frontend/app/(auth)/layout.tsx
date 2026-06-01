export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line">
        <div className="max-w-screen-xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 bg-accent rounded-sm flex items-center justify-center text-black font-display text-xl leading-none pt-1">
            R
          </div>
          <h1 className="display text-2xl tracking-wider">Reto de Constancia</h1>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

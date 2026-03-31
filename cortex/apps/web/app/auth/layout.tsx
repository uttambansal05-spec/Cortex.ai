export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brain-gradient pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}

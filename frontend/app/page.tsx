/** `/` is handled in `middleware.ts` (sign-in vs dashboard). This route is a fallback shell. */
export default function HomePage() {
  return <div className="min-h-screen bg-background" aria-hidden />;
}

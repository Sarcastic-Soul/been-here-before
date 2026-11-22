export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Been Here Before
      </h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Your coin has been here before. Here is how it ended.
      </p>
      <p className="text-sm text-zinc-500">
        Data provided by CoinMarketCap.com
      </p>
    </main>
  );
}

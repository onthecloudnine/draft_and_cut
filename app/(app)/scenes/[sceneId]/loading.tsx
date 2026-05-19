export default function SceneDetailLoading() {
  return (
    <div className="flex h-full min-h-0 animate-pulse flex-col bg-zinc-950 text-zinc-100">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3 sm:px-7">
        <div className="flex items-center gap-4">
          <div className="h-3 w-20 rounded bg-zinc-800" />
          <div className="hidden h-6 w-px bg-zinc-800 sm:block" />
          <div className="space-y-1.5">
            <div className="h-2.5 w-14 rounded bg-zinc-800" />
            <div className="h-4 w-56 rounded bg-zinc-800" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 rounded-md bg-zinc-900" />
          <div className="h-8 w-24 rounded-md bg-zinc-900" />
          <div className="h-8 w-24 rounded-md bg-red-900/50" />
        </div>
      </div>

      <div className="flex shrink-0 gap-2 border-b border-zinc-800 px-5 py-2 sm:px-7">
        <div className="h-8 w-28 rounded bg-zinc-900" />
        <div className="h-8 w-20 rounded bg-zinc-900" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col bg-black">
          <div className="h-9 shrink-0 border-b border-zinc-900 bg-zinc-950/40" />
          <div className="flex min-h-0 flex-1 items-center justify-center p-5">
            <div className="aspect-video w-full max-w-3xl rounded-md bg-zinc-900" />
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t border-zinc-900 bg-zinc-950 px-5 py-2">
            <div className="h-9 w-9 rounded-md bg-zinc-900" />
            <div className="h-9 w-9 rounded-md bg-zinc-900" />
            <div className="h-10 w-10 rounded-full bg-red-900/50" />
            <div className="h-9 w-9 rounded-md bg-zinc-900" />
            <div className="h-9 w-9 rounded-md bg-zinc-900" />
            <div className="h-7 w-28 rounded bg-zinc-900" />
            <div className="h-2 flex-1 rounded-full bg-zinc-900" />
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-3 border-zinc-800 bg-zinc-900 p-5 lg:w-[380px] lg:border-l xl:w-[420px]">
          <div className="flex gap-3 border-b border-zinc-800 pb-2">
            <div className="h-4 w-12 rounded bg-zinc-800" />
            <div className="h-4 w-14 rounded bg-zinc-800" />
            <div className="h-4 w-12 rounded bg-zinc-800" />
            <div className="h-4 w-16 rounded bg-zinc-800" />
            <div className="h-4 w-14 rounded bg-zinc-800" />
          </div>
          <div className="space-y-3 pt-2">
            <div className="h-9 rounded-md bg-zinc-950" />
            <div className="h-9 rounded-md bg-zinc-950" />
            <div className="h-9 rounded-md bg-zinc-950" />
            <div className="h-24 rounded-md bg-zinc-950" />
            <div className="h-20 rounded-md bg-zinc-950" />
          </div>
        </aside>
      </div>

      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <div className="h-3 w-32 rounded bg-zinc-800" />
          <div className="h-3 w-16 rounded bg-zinc-800" />
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div className="h-[7.5rem] w-40 shrink-0 rounded-md bg-zinc-900" key={idx} />
          ))}
        </div>
      </div>
    </div>
  );
}

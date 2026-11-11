export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 pt-10" aria-busy="true">
      <div className="skeleton h-9 w-1/3" />
      <div className="skeleton h-5 w-2/3" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}

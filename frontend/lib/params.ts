import { notFound } from "next/navigation";

/** Parses a positive integer route id or renders the 404 page. */
export async function idFromParams(params: Promise<{ id: string }>) {
  const { id } = await params;
  const value = Number(id);
  if (!Number.isInteger(value) || value <= 0) notFound();
  return value;
}

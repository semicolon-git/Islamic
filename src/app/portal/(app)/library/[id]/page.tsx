import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { bookPassages, getBook } from "@/features/library/server";
import { BookDetail } from "@/features/library/ui/book-detail";
import { NoAccess } from "@/features/portal/no-access";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const b = await getBook((await params).id);
  return { title: b ? b.title_en || b.title_ar : "Library" };
}

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (user.role === "specialist") return <NoAccess />;
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();
  const passages = await bookPassages(id, { limit: 30 });
  return <BookDetail initial={book} passages={passages} role={user.role} userId={user.id} />;
}

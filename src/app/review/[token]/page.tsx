import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Wordmark } from "@/components/Wordmark";
import { ReviewForm } from "./ReviewForm";

export const metadata: Metadata = {
  title: "Leave a review",
  robots: { index: false },
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const review = await prisma.review.findUnique({
    where: { token },
    include: { project: true, client: true },
  });
  if (!review) notFound();

  const alreadyDone = review.status === "Submitted" || review.status === "Featured";

  return (
    <div className="flex min-h-screen flex-col bg-navy-50/50">
      <div className="container-x flex h-16 items-center">
        <Wordmark />
      </div>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-lg">
          <h1 className="mb-2 text-center font-heading text-3xl font-700 text-navy">
            How did we do?
          </h1>
          <p className="mb-6 text-center text-navy-600">
            {review.project ? `On "${review.project.title}".` : ""} A minute of your
            time helps a lot.
          </p>
          {alreadyDone ? (
            <div className="card p-8 text-center">
              <p className="text-navy-600">You&apos;ve already submitted this review. Thank you!</p>
            </div>
          ) : (
            <ReviewForm token={token} defaultName={review.client?.name ?? review.authorName} />
          )}
        </div>
      </div>
    </div>
  );
}

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, testimonialsTable } from "@workspace/db";
import { Api } from "@workspace/api-zod";

const router: IRouter = Router();

function formatTestimonial(t: typeof testimonialsTable.$inferSelect) {
  return { ...t, createdAt: t.createdAt.toISOString() };
}

router.get("/testimonials", async (_req, res): Promise<void> => {
  const testimonials = await db.select().from(testimonialsTable).orderBy(testimonialsTable.id);
  res.json(testimonials.map(formatTestimonial));
});

router.post("/testimonials", async (req, res): Promise<void> => {
  const parsed = Api.CreateTestimonialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [testimonial] = await db.insert(testimonialsTable).values({
    ...parsed.data,
    isActive: parsed.data.isActive ?? true,
  }).returning();

  res.status(201).json(formatTestimonial(testimonial));
});

router.patch("/testimonials/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = Api.UpdateTestimonialParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = Api.UpdateTestimonialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.clientName != null) updateData.clientName = parsed.data.clientName;
  if (parsed.data.comment != null) updateData.comment = parsed.data.comment;
  if (parsed.data.rating != null) updateData.rating = parsed.data.rating;
  if (parsed.data.imageUrl != null) updateData.imageUrl = parsed.data.imageUrl;
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;

  const [testimonial] = await db.update(testimonialsTable).set(updateData).where(eq(testimonialsTable.id, params.data.id)).returning();
  if (!testimonial) {
    res.status(404).json({ error: "التقييم غير موجود" });
    return;
  }

  res.json(formatTestimonial(testimonial));
});

router.delete("/testimonials/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = Api.DeleteTestimonialParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [testimonial] = await db.delete(testimonialsTable).where(eq(testimonialsTable.id, params.data.id)).returning();
  if (!testimonial) {
    res.status(404).json({ error: "التقييم غير موجود" });
    return;
  }

  res.sendStatus(204);
});

export default router;

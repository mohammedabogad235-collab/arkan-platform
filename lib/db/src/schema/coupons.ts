import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const couponDiscountTypeValues = ["percentage", "fixed"] as const;
export const couponDiscountTypeSchema = z.enum(couponDiscountTypeValues);

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull().default("percentage"), // "percentage" | "fixed"
  discountValue: real("discount_value").notNull(),
  minOrderAmount: real("min_order_amount"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCouponSchema = createInsertSchema(couponsTable).omit({ id: true, usedCount: true, createdAt: true });
export const couponCodeSchema = z
  .string()
  .trim()
  .min(3, "الكود يجب أن يحتوي على 3 أحرف على الأقل")
  .max(50, "الكود طويل جداً")
  .regex(/^[A-Z0-9_-]+$/i, "الكود يجب أن يحتوي على أحرف وأرقام فقط");

export const createCouponInputSchema = z
  .object({
    code: couponCodeSchema,
    discountType: couponDiscountTypeSchema,
    discountValue: z.coerce.number().finite().positive("قيمة الخصم يجب أن تكون أكبر من صفر"),
    minOrderAmount: z.coerce.number().finite().nonnegative("الحد الأدنى لا يمكن أن يكون سالباً").nullable().optional(),
    maxUses: z.coerce.number().int("عدد مرات الاستخدام يجب أن يكون رقماً صحيحاً").positive("عدد مرات الاستخدام يجب أن يكون أكبر من صفر").nullable().optional(),
    isActive: z.boolean().optional(),
    expiresAt: z.union([z.string().trim().min(1), z.null()]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.discountType === "percentage" && value.discountValue > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "نسبة الخصم يجب ألا تتجاوز 100%",
      });
    }

    if (value.expiresAt) {
      const parsedDate = new Date(value.expiresAt);
      if (Number.isNaN(parsedDate.getTime())) {
        ctx.addIssue({
          code: "custom",
          path: ["expiresAt"],
          message: "تاريخ الانتهاء غير صالح",
        });
      }
    }
  });

export const updateCouponInputSchema = createCouponInputSchema
  .partial()
  .extend({
    code: couponCodeSchema.optional(),
    discountType: couponDiscountTypeSchema.optional(),
    discountValue: z.coerce.number().finite().positive("قيمة الخصم يجب أن تكون أكبر من صفر").optional(),
    minOrderAmount: z.coerce.number().finite().nonnegative("الحد الأدنى لا يمكن أن يكون سالباً").nullable().optional(),
    maxUses: z.coerce.number().int("عدد مرات الاستخدام يجب أن يكون رقماً صحيحاً").positive("عدد مرات الاستخدام يجب أن يكون أكبر من صفر").nullable().optional(),
    expiresAt: z.union([z.string().trim().min(1), z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "لا توجد بيانات صالحة للتحديث",
  });

export const validateCouponInputSchema = z.object({
  code: couponCodeSchema,
  orderAmount: z.coerce.number().finite().nonnegative("مبلغ الطلب غير صالح").optional(),
});

export type CreateCouponInput = z.infer<typeof createCouponInputSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponInputSchema>;
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;

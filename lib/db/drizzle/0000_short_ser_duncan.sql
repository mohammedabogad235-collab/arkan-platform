CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"discount_type" text DEFAULT 'percentage' NOT NULL,
	"discount_value" real NOT NULL,
	"min_order_amount" real,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'client' NOT NULL,
	"permissions" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price_egp" real NOT NULL,
	"price_sar" real NOT NULL,
	"features" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"details" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"currency" text DEFAULT 'both' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_name" text NOT NULL,
	"comment" text NOT NULL,
	"rating" integer DEFAULT 5 NOT NULL,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"site_name" text NOT NULL,
	"site_type" text NOT NULL,
	"details" text NOT NULL,
	"package_id" integer,
	"custom_budget" real,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"payment_method_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"deposit_paid" boolean DEFAULT false NOT NULL,
	"final_paid" boolean DEFAULT false NOT NULL,
	"total_amount" real,
	"deposit_percentage" real DEFAULT 50 NOT NULL,
	"notes" text,
	"coupon_code" text,
	"discount_amount" real,
	"receipt_url" text,
	"final_receipt_url" text,
	"delivered_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone1" text DEFAULT '' NOT NULL,
	"phone2" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"whatsapp" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"facebook_url" text DEFAULT '' NOT NULL,
	"instagram_url" text DEFAULT '' NOT NULL,
	"twitter_url" text DEFAULT '' NOT NULL,
	"require_deposit" boolean DEFAULT true NOT NULL,
	"deposit_percentage_value" real DEFAULT 50 NOT NULL,
	"terms_and_conditions" text DEFAULT '' NOT NULL,
	"privacy_policy" text DEFAULT '' NOT NULL,
	"email_user" text DEFAULT '' NOT NULL,
	"email_pass" text DEFAULT '' NOT NULL
);

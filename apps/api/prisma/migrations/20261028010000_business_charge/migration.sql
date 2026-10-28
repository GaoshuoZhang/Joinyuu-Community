-- AlterTable
ALTER TABLE "Demand" ADD COLUMN     "chargeAmountFen" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chargeRefundPolicy" VARCHAR(2000) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "chargeAmountFen" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chargeRefundPolicy" VARCHAR(2000) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CommunityEvent" ADD COLUMN     "chargeAmountFen" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chargeRefundPolicy" VARCHAR(2000) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "MallGoods" ADD COLUMN     "chargeAmountFen" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chargeRefundPolicy" VARCHAR(2000) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "chargeAmountFen" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chargeRefundPolicy" VARCHAR(2000) NOT NULL DEFAULT '';

ALTER TABLE "Demand" ADD CONSTRAINT "Demand_cash_pricing_check" CHECK ("chargeAmountFen" BETWEEN 0 AND 100000000 AND ("chargeAmountFen" = 0 OR length(trim("chargeRefundPolicy")) > 0));

ALTER TABLE "Project" ADD CONSTRAINT "Project_cash_pricing_check" CHECK ("chargeAmountFen" BETWEEN 0 AND 100000000 AND ("chargeAmountFen" = 0 OR length(trim("chargeRefundPolicy")) > 0));

ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_cash_pricing_check" CHECK ("chargeAmountFen" BETWEEN 0 AND 100000000 AND ("chargeAmountFen" = 0 OR length(trim("chargeRefundPolicy")) > 0));

ALTER TABLE "MallGoods" ADD CONSTRAINT "MallGoods_cash_pricing_check" CHECK ("chargeAmountFen" BETWEEN 0 AND 100000000 AND ("chargeAmountFen" = 0 OR length(trim("chargeRefundPolicy")) > 0));

ALTER TABLE "Space" ADD CONSTRAINT "Space_cash_pricing_check" CHECK ("chargeAmountFen" BETWEEN 0 AND 100000000 AND ("chargeAmountFen" = 0 OR length(trim("chargeRefundPolicy")) > 0));

-- Retire the independent price-book permissions; preserve its records and bill snapshots.
DELETE FROM "AdminRolePermission" WHERE "permissionCode" IN ('/commerce/services', 'perm:commerce:service:write');
DELETE FROM "AdminPermission" WHERE "code" IN ('/commerce/services', 'perm:commerce:service:write');

-- CreateTable
CREATE TABLE "CommerceQuote" (
    "id" VARCHAR(32) NOT NULL,
    "createdBy" VARCHAR(16) NOT NULL,
    "sourceType" VARCHAR(24) NOT NULL,
    "sourceId" VARCHAR(16) NOT NULL,
    "sourceName" VARCHAR(128) NOT NULL,
    "buyerType" VARCHAR(16) NOT NULL,
    "buyerId" VARCHAR(16) NOT NULL,
    "buyerName" VARCHAR(128) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceFen" INTEGER NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "orderId" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceOrder" (
    "id" VARCHAR(32) NOT NULL,
    "billId" VARCHAR(16),
    "quoteId" VARCHAR(32),
    "sourceType" VARCHAR(24) NOT NULL,
    "sourceId" VARCHAR(16) NOT NULL,
    "sourceName" VARCHAR(128) NOT NULL,
    "buyerType" VARCHAR(16) NOT NULL,
    "buyerId" VARCHAR(16) NOT NULL,
    "buyerName" VARCHAR(128) NOT NULL,
    "createdBy" VARCHAR(16) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceFen" INTEGER NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "paidFen" INTEGER NOT NULL DEFAULT 0,
    "refundedFen" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" VARCHAR(16) NOT NULL DEFAULT 'unpaid',
    "approvalStatus" VARCHAR(16) NOT NULL DEFAULT 'not_required',
    "fulfillmentStatus" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "afterSalesStatus" VARCHAR(16) NOT NULL DEFAULT 'none',
    "snapshot" JSONB NOT NULL,
    "reservationId" VARCHAR(16),
    "enrollmentId" INTEGER,
    "redemptionOrderId" VARCHAR(16),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "lastError" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WechatUserBinding" (
    "id" VARCHAR(16) NOT NULL,
    "userId" VARCHAR(16) NOT NULL,
    "appid" VARCHAR(64) NOT NULL,
    "openid" VARCHAR(64) NOT NULL,
    "unionid" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WechatUserBinding_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RedemptionOrder" ADD COLUMN "amountFen" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "commerceOrderId" VARCHAR(32),
ADD COLUMN "afterSalesFrozen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SpaceReservation" ADD COLUMN "amountFen" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "commerceOrderId" VARCHAR(32),
ADD COLUMN "afterSalesFrozen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EventEnrollment" ADD COLUMN "commerceOrderId" VARCHAR(32),
ADD COLUMN "afterSalesFrozen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN "cashMallOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cashSpaceOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cashEventOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cashLeaseOpen" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuote_orderId_key" ON "CommerceQuote"("orderId");

-- CreateIndex
CREATE INDEX "CommerceQuote_createdBy_status_idx" ON "CommerceQuote"("createdBy", "status");

-- CreateIndex
CREATE INDEX "CommerceQuote_status_expiresAt_idx" ON "CommerceQuote"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceOrder_billId_key" ON "CommerceOrder"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceOrder_quoteId_key" ON "CommerceOrder"("quoteId");

-- CreateIndex
CREATE INDEX "CommerceOrder_createdBy_createdAt_idx" ON "CommerceOrder"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceOrder_paymentStatus_expiresAt_idx" ON "CommerceOrder"("paymentStatus", "expiresAt");

-- CreateIndex
CREATE INDEX "CommerceOrder_sourceType_sourceId_idx" ON "CommerceOrder"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WechatUserBinding_appid_openid_key" ON "WechatUserBinding"("appid", "openid");

-- CreateIndex
CREATE UNIQUE INDEX "WechatUserBinding_userId_appid_key" ON "WechatUserBinding"("userId", "appid");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionOrder_commerceOrderId_key" ON "RedemptionOrder"("commerceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceReservation_commerceOrderId_key" ON "SpaceReservation"("commerceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "EventEnrollment_commerceOrderId_key" ON "EventEnrollment"("commerceOrderId");

-- AddForeignKey
ALTER TABLE "CommerceOrder" ADD CONSTRAINT "CommerceOrder_billId_fkey" FOREIGN KEY ("billId") REFERENCES "CommerceBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money invariants (same ceiling as admin-created bills)
ALTER TABLE "CommerceQuote" ADD CONSTRAINT "CommerceQuote_money_check" CHECK ("unitPriceFen" > 0 AND "unitPriceFen" <= 100000000 AND "amountFen" > 0 AND "amountFen" <= 100000000 AND "quantity" >= 1 AND "quantity" <= 10000);
ALTER TABLE "CommerceOrder" ADD CONSTRAINT "CommerceOrder_money_check" CHECK ("unitPriceFen" > 0 AND "unitPriceFen" <= 100000000 AND "amountFen" > 0 AND "amountFen" <= 100000000 AND "paidFen" >= 0 AND "paidFen" <= "amountFen" AND "refundedFen" >= 0 AND "refundedFen" <= "paidFen");
ALTER TABLE "RedemptionOrder" ADD CONSTRAINT "RedemptionOrder_cash_check" CHECK ("amountFen" >= 0);
ALTER TABLE "SpaceReservation" ADD CONSTRAINT "SpaceReservation_cash_check" CHECK ("amountFen" >= 0);

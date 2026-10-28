-- CreateTable
CREATE TABLE "CommerceService" (
    "id" VARCHAR(16) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "module" VARCHAR(16) NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "refundPolicy" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceBill" (
    "id" VARCHAR(16) NOT NULL,
    "businessKey" VARCHAR(128) NOT NULL,
    "module" VARCHAR(16) NOT NULL,
    "sourceId" VARCHAR(16) NOT NULL,
    "sourceName" VARCHAR(128) NOT NULL,
    "buyerType" VARCHAR(16) NOT NULL,
    "buyerId" VARCHAR(16) NOT NULL,
    "buyerName" VARCHAR(128) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "period" VARCHAR(64) NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "paidFen" INTEGER NOT NULL DEFAULT 0,
    "refundedFen" INTEGER NOT NULL DEFAULT 0,
    "dueDate" VARCHAR(10) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'unpaid',
    "snapshot" JSONB NOT NULL,
    "createdBy" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceReceipt" (
    "id" VARCHAR(16) NOT NULL,
    "billId" VARCHAR(16) NOT NULL,
    "reference" VARCHAR(128) NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "createdBy" VARCHAR(64) NOT NULL,
    "reviewedBy" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CommerceReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercePayment" (
    "id" VARCHAR(32) NOT NULL,
    "billId" VARCHAR(16) NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "appid" VARCHAR(64) NOT NULL,
    "mchid" VARCHAR(64) NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "transactionId" VARCHAR(64),
    "prepay" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceRefund" (
    "id" VARCHAR(32) NOT NULL,
    "paymentId" VARCHAR(32) NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "reason" VARCHAR(80) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "createdBy" VARCHAR(64) NOT NULL,
    "approvedBy" VARCHAR(64),
    "lastError" VARCHAR(255),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CommerceRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommerceBill_businessKey_key" ON "CommerceBill"("businessKey");

-- CreateIndex
CREATE INDEX "CommerceBill_module_status_dueDate_idx" ON "CommerceBill"("module", "status", "dueDate");

-- CreateIndex
CREATE INDEX "CommerceBill_buyerType_buyerId_idx" ON "CommerceBill"("buyerType", "buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceReceipt_reference_key" ON "CommerceReceipt"("reference");

-- CreateIndex
CREATE INDEX "CommerceReceipt_billId_idx" ON "CommerceReceipt"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercePayment_transactionId_key" ON "CommercePayment"("transactionId");

-- CreateIndex
CREATE INDEX "CommercePayment_status_nextCheckAt_idx" ON "CommercePayment"("status", "nextCheckAt");

-- CreateIndex
CREATE INDEX "CommerceRefund_status_nextCheckAt_idx" ON "CommerceRefund"("status", "nextCheckAt");

-- AddForeignKey
ALTER TABLE "CommerceReceipt" ADD CONSTRAINT "CommerceReceipt_billId_fkey" FOREIGN KEY ("billId") REFERENCES "CommerceBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercePayment" ADD CONSTRAINT "CommercePayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "CommerceBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceRefund" ADD CONSTRAINT "CommerceRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CommercePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Upgrade existing installations without reseeding or granting finance access to ordinary roles.
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('/commerce/overview', '经营概览', '交易经营', 'menu', 100) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('/commerce/receivables', '应收与交易', '交易经营', 'menu', 101) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('/commerce/services', '收费服务', '交易经营', 'menu', 102) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('perm:commerce:service:write', '维护收费服务', '交易经营', 'button', 103) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('perm:commerce:bill:create', '出账与作废', '交易经营', 'button', 104) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('perm:commerce:receipt:create', '登记线下收款', '交易经营', 'button', 105) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('perm:commerce:receipt:review', '复核线下收款', '交易经营', 'button', 106) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('perm:commerce:payment:create', '生成微信收款码', '交易经营', 'button', 107) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('perm:commerce:refund:create', '申请退款', '交易经营', 'button', 108) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "AdminPermission" ("code", "name", "module", "authType", "sort") VALUES ('perm:commerce:refund:approve', '审批并提交退款', '交易经营', 'button', 109) ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "CommerceService" ADD CONSTRAINT "CommerceService_amount_check" CHECK ("amountFen" > 0 AND "amountFen" <= 100000000);
ALTER TABLE "CommerceBill" ADD CONSTRAINT "CommerceBill_money_check" CHECK ("amountFen" > 0 AND "amountFen" <= 100000000 AND "paidFen" >= 0 AND "paidFen" <= "amountFen" AND "refundedFen" >= 0 AND "refundedFen" <= "paidFen");
ALTER TABLE "CommercePayment" ADD CONSTRAINT "CommercePayment_amount_check" CHECK ("amountFen" > 0 AND "amountFen" <= 100000000);
ALTER TABLE "CommerceRefund" ADD CONSTRAINT "CommerceRefund_amount_check" CHECK ("amountFen" > 0 AND "amountFen" <= 100000000);
CREATE UNIQUE INDEX "CommercePayment_one_pending_bill" ON "CommercePayment" ("billId") WHERE "status" = 'pending';
